"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { geocodeQueryFor } from "@/lib/domain/geocoding";
import { geocodeBatch, geocodingConfigured } from "@/lib/geocoding/google";
import { logEvent } from "@/lib/observability";
import { requireOperator } from "./context";

/**
 * Cuántos locales se ubican por pedido. Google admite mucho más, pero la acción
 * corre dentro de una solicitud con tiempo limitado: mejor varias tandas cortas
 * que una que se corta a la mitad.
 */
const MAX_PER_REQUEST = 150;
const CONCURRENCY = 8;
const BUDGET_MS = 15_000;
/** Escrituras simultáneas contra la base al guardar lo ubicado. */
const WRITE_CHUNK = 10;

export type CompleteLocationsResult = {
  error: string | null;
  /** Ubicados en este pedido. */
  located: number;
  /** Que Google no pudo ubicar (dirección inexistente o demasiado vaga). */
  notFound: number;
  /** Con dirección y todavía sin ubicación después de este pedido. */
  remaining: number;
};

const empty = (error: string | null): CompleteLocationsResult => ({
  error,
  located: 0,
  notFound: 0,
  remaining: 0,
});

/**
 * «Completar ubicaciones»: ubica los locales del proyecto que tienen dirección y
 * todavía no tienen ubicación (importados por planilla o cargados antes de que
 * la ubicación fuera automática).
 *
 * No hay columna de estado: «con dirección y sin ubicación» es el criterio.
 * Consecuencia aceptada (docs/specs/2026-09-24-sin-latitud-longitud, DEC-06): una
 * dirección que Google no encuentra se reintenta cada vez que se aprieta el
 * botón, con el tope de arriba acotando el costo.
 */
export async function completeMissingLocations(projectId: string): Promise<CompleteLocationsResult> {
  const t = await getTranslations("Errors");
  if (!geocodingConfigured()) return empty(t("locationUnavailable"));

  let ctx;
  try {
    ctx = await requireOperator();
  } catch {
    return empty(t("accessDenied"));
  }
  const { supabase, companyId, userId } = ctx;

  const { data: project } = await supabase
    .from("projects")
    .select("id, country")
    .eq("id", projectId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!project) return empty(t("projectNotFound"));

  const { data: sites, error } = await supabase
    .from("sites")
    .select("id, location_id, address, city, state, zone")
    .eq("project_id", projectId)
    .eq("company_id", companyId)
    .is("archived_at", null)
    .is("lat", null)
    .neq("address", "")
    .order("name")
    .limit(MAX_PER_REQUEST);
  if (error) return empty(t("operation"));

  const items = (sites ?? []).flatMap((site) => {
    const query = geocodeQueryFor({
      address: site.address,
      city: site.city,
      state: site.state || site.zone,
      country: project.country,
    });
    return query ? [{ id: site.id, query }] : [];
  });

  const result = await geocodeBatch(items, {
    max: MAX_PER_REQUEST,
    concurrency: CONCURRENCY,
    budgetMs: BUDGET_MS,
  });

  // La ficha canónica es la fuente: al actualizarla, el trigger propaga la
  // ubicación a todas sus proyecciones (los `sites` de otros proyectos también).
  // Un local sin ficha canónica (anterior a ese modelo) se actualiza directo.
  const byId = new Map((sites ?? []).map((site) => [site.id, site]));
  const entries = [...result.located.entries()];
  let located = 0;
  for (let index = 0; index < entries.length; index += WRITE_CHUNK) {
    const chunk = entries.slice(index, index + WRITE_CHUNK);
    const outcomes = await Promise.all(
      chunk.map(async ([siteId, coordinates]) => {
        const site = byId.get(siteId);
        if (!site) return false;
        const update = site.location_id
          ? supabase
              .from("locations")
              .update({ lat: coordinates.lat, lng: coordinates.lng, updated_by: userId })
              .eq("id", site.location_id)
              .eq("company_id", companyId)
          : supabase
              .from("sites")
              .update({ lat: coordinates.lat, lng: coordinates.lng })
              .eq("id", siteId)
              .eq("company_id", companyId);
        const { error: writeError } = await update;
        return !writeError;
      }),
    );
    located += outcomes.filter(Boolean).length;
  }

  const { count } = await supabase
    .from("sites")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("company_id", companyId)
    .is("archived_at", null)
    .is("lat", null)
    .neq("address", "");

  logEvent("info", "geocode.complete_missing", {
    project_id: projectId,
    attempted: items.length,
    located,
    not_found: result.failed.length,
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  return { error: null, located, notFound: result.failed.length, remaining: count ?? 0 };
}

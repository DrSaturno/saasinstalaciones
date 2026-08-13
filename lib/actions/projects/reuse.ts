"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { attachCanonicalLocations } from "@/lib/actions/canonical-locations";
import type { CanonicalLocationProjection } from "@/lib/domain/canonical-locations";
import { requireOperator } from "./context";
import type { ImportResult } from "./types";

const PAGE = 1000;
const ID_BATCH = 200;
const LOCATION_FIELDS =
  "id, company_id, client_id, name, address, city, state, zone, country, lat, lng, external_ref, contact_name, contact_phone, contact_email, opening_hours, access_notes, parking_notes, technical_notes, risk_notes, permanent_notes" as const;

/**
 * Identidades permanentes del cliente que todavia no estan en este proyecto.
 *
 * Ya no deduplica copias de `sites` por nombre/direccion: la identidad es
 * `locations.id` y la asociacion existente es `project_locations`.
 */
export async function fetchReusableLocations(projectId: string): Promise<{
  error: string | null;
  locations: {
    id: string;
    name: string;
    address: string;
    city: string;
    state: string;
    externalRef: string | null;
    projectName: string;
  }[];
}> {
  const t = await getTranslations("Errors");
  try {
    const { supabase, companyId } = await requireOperator();
    const { data: project } = await supabase
      .from("projects")
      .select("id, client_id, country, zones")
      .eq("id", projectId)
      .eq("company_id", companyId)
      .single();
    if (!project?.client_id) return { error: null, locations: [] };
    if (project.zones.length === 0) return { error: null, locations: [] };
    const clientId = project.client_id;

    const [locationRows, { data: associations }] = await Promise.all([
      (async () => {
        const rows: {
          id: string;
          name: string;
          address: string;
          city: string;
          state: string;
          external_ref: string | null;
        }[] = [];
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await supabase
            .from("locations")
            .select("id, name, address, city, state, external_ref")
            .eq("client_id", clientId)
            .eq("country", project.country)
            .in("zone", project.zones)
            .is("archived_at", null)
            .order("name")
            .range(from, from + PAGE - 1);
          if (error || !data) break;
          rows.push(...data);
          if (data.length < PAGE) break;
        }
        return rows;
      })(),
      (async () => {
        const rows: {
          location_id: string;
          project_id: string;
          created_at: string;
          status: string;
        }[] = [];
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await supabase
            .from("project_locations")
            .select("location_id, project_id, created_at, status")
            .eq("client_id", clientId)
            .order("created_at", { ascending: false })
            .range(from, from + PAGE - 1);
          if (error || !data) break;
          rows.push(...data);
          if (data.length < PAGE) break;
        }
        return { data: rows };
      })(),
    ]);

    const current = new Set(
      (associations ?? [])
        .filter(
          (association) =>
            association.project_id === projectId &&
            association.status !== "cancelled",
        )
        .map((association) => association.location_id),
    );
    const previousProjectByLocation = new Map<string, string>();
    for (const association of associations ?? []) {
      if (
        association.project_id !== projectId &&
        !previousProjectByLocation.has(association.location_id)
      ) {
        previousProjectByLocation.set(
          association.location_id,
          association.project_id,
        );
      }
    }
    const previousProjectIds = [...new Set(previousProjectByLocation.values())];
    const projectName = new Map<string, string>();
    for (let index = 0; index < previousProjectIds.length; index += ID_BATCH) {
      const { data } = await supabase
        .from("projects")
        .select("id, name")
        .in("id", previousProjectIds.slice(index, index + ID_BATCH));
      for (const row of data ?? []) projectName.set(row.id, row.name);
    }

    return {
      error: null,
      locations: locationRows
        .filter((location) => !current.has(location.id))
        .map((location) => {
          const previousProjectId = previousProjectByLocation.get(location.id);
          return {
            id: location.id,
            name: location.name,
            address: location.address,
            city: location.city,
            state: location.state,
            externalRef: location.external_ref,
            projectName: previousProjectId
              ? (projectName.get(previousProjectId) ?? "")
              : "",
          };
        }),
    };
  } catch {
    return { error: t("unexpected"), locations: [] };
  }
}

/** Asocia las identidades elegidas; no copia la locacion ni sus documentos. */
export async function reuseLocations(
  projectId: string,
  locationIds: string[],
): Promise<ImportResult> {
  const t = await getTranslations("Errors");
  const ids = z.array(z.string().uuid()).min(1).max(2000).safeParse(locationIds);
  if (!ids.success) return { error: t("invalidData"), inserted: 0, skipped: [] };

  try {
    const { supabase, companyId, userId } = await requireOperator();
    const { data: project } = await supabase
      .from("projects")
      .select("id, company_id, client_id, country, zones")
      .eq("id", projectId)
      .eq("company_id", companyId)
      .single();
    if (!project?.client_id) {
      return { error: t("projectNotFound"), inserted: 0, skipped: [] };
    }
    if (project.zones.length === 0) {
      return { error: t("invalidData"), inserted: 0, skipped: [] };
    }

    const locations: CanonicalLocationProjection[] = [];
    for (let index = 0; index < ids.data.length; index += ID_BATCH) {
      const { data, error } = await supabase
        .from("locations")
        .select(LOCATION_FIELDS)
        .in("id", ids.data.slice(index, index + ID_BATCH))
        .eq("client_id", project.client_id)
        .eq("company_id", companyId)
        .eq("country", project.country)
        .in("zone", project.zones)
        .is("archived_at", null);
      if (error) return { error: t("operation"), inserted: 0, skipped: [] };
      locations.push(...(data ?? []));
    }
    if (locations.length !== new Set(ids.data).size) {
      return { error: t("invalidData"), inserted: 0, skipped: [] };
    }

    const result = await attachCanonicalLocations(
      supabase,
      { ...project, client_id: project.client_id },
      locations,
      userId,
    );
    if (result.error) {
      return {
        error: t("importBatch", {
          count: result.inserted,
          error: result.error,
        }),
        inserted: result.inserted,
        skipped: [],
      };
    }

    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/clients");
    return { error: null, inserted: result.inserted, skipped: [] };
  } catch {
    return { error: t("unexpected"), inserted: 0, skipped: [] };
  }
}

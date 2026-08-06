"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/types/database";
import { BATCH_SIZE, requireOperator } from "./context";
import type { ImportResult } from "./types";

/**
 * Locaciones que ese cliente ya tiene cargadas en OTROS proyectos.
 *
 * Un cliente que vuelve suele instalar en los mismos locales, así que cargarlos
 * de nuevo a mano (o volver a importar la planilla) es trabajo repetido. Sólo
 * se ofrecen las que todavía no están en este proyecto, comparando por código
 * interno y, si no lo tienen, por nombre y dirección.
 */
export async function fetchReusableSites(projectId: string): Promise<{
  error: string | null;
  sites: {
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
      .select("id, client_id")
      .eq("id", projectId)
      .eq("company_id", companyId)
      .single();
    if (!project?.client_id) return { error: null, sites: [] };

    // Los demás proyectos del mismo cliente.
    const { data: siblings } = await supabase
      .from("projects")
      .select("id, name")
      .eq("company_id", companyId)
      .eq("client_id", project.client_id)
      .neq("id", projectId);
    const siblingIds = (siblings ?? []).map((sibling) => sibling.id);
    if (siblingIds.length === 0) return { error: null, sites: [] };

    const nameById = new Map((siblings ?? []).map((s) => [s.id, s.name]));

    const [{ data: candidates }, { data: current }] = await Promise.all([
      supabase
        .from("sites")
        .select("id, project_id, name, address, city, state, external_ref")
        .in("project_id", siblingIds)
        .is("archived_at", null)
        .order("name"),
      supabase
        .from("sites")
        .select("name, address, external_ref")
        .eq("project_id", projectId),
    ]);

    const takenRefs = new Set(
      (current ?? [])
        .map((site) => site.external_ref?.trim().toLowerCase())
        .filter((ref): ref is string => Boolean(ref)),
    );
    const takenPairs = new Set(
      (current ?? []).map(
        (site) =>
          `${site.name.trim().toLowerCase()}|${site.address.trim().toLowerCase()}`,
      ),
    );

    const seen = new Set<string>();
    const sites = (candidates ?? [])
      .filter((site) => {
        const ref = site.external_ref?.trim().toLowerCase();
        const pair = `${site.name.trim().toLowerCase()}|${site.address.trim().toLowerCase()}`;
        if (ref ? takenRefs.has(ref) : takenPairs.has(pair)) return false;
        // El mismo local puede estar en varios proyectos previos: una sola vez.
        const dedupe = ref || pair;
        if (seen.has(dedupe)) return false;
        seen.add(dedupe);
        return true;
      })
      .map((site) => ({
        id: site.id,
        name: site.name,
        address: site.address,
        city: site.city ?? "",
        state: site.state ?? "",
        externalRef: site.external_ref,
        projectName: nameById.get(site.project_id) ?? "",
      }));

    return { error: null, sites };
  } catch {
    return { error: t("unexpected"), sites: [] };
  }
}

/** Copia al proyecto actual las locaciones elegidas de proyectos anteriores. */
export async function reuseSites(
  projectId: string,
  siteIds: string[],
): Promise<ImportResult> {
  const t = await getTranslations("Errors");
  const ids = z.array(z.string().uuid()).min(1).max(2000).safeParse(siteIds);
  if (!ids.success) return { error: t("invalidData"), inserted: 0, skipped: [] };

  try {
    const { supabase, companyId } = await requireOperator();

    const { data: project } = await supabase
      .from("projects")
      .select("id, country, zones")
      .eq("id", projectId)
      .eq("company_id", companyId)
      .single();
    if (!project) return { error: t("projectNotFound"), inserted: 0, skipped: [] };

    const { data: origin } = await supabase
      .from("sites")
      .select(
        "id, name, address, city, state, zone, lat, lng, external_ref, contact_name, contact_phone, contact_email, opening_hours, access_notes, parking_notes, technical_notes, risk_notes, permanent_notes",
      )
      .in("id", ids.data);
    if (!origin?.length) {
      return { error: t("invalidData"), inserted: 0, skipped: [] };
    }

    // La zona tiene que ser una de las del proyecto destino; si la original no
    // aplica, se usa la primera del proyecto para no dejarla huérfana.
    const fallbackZone = project.zones?.[0] ?? "";

    const rows = origin.map((site) => ({
      project_id: projectId,
      company_id: companyId,
      name: site.name,
      address: site.address,
      city: site.city,
      state: site.state,
      zone: project.zones?.includes(site.zone ?? "") ? site.zone : fallbackZone,
      lat: site.lat,
      lng: site.lng,
      external_ref: site.external_ref,
      contact_name: site.contact_name,
      contact_phone: site.contact_phone,
      contact_email: site.contact_email,
      opening_hours: site.opening_hours,
      access_notes: site.access_notes,
      parking_notes: site.parking_notes,
      technical_notes: site.technical_notes,
      risk_notes: site.risk_notes,
      permanent_notes: site.permanent_notes,
    }));

    let inserted = 0;
    const created: { newId: string; originId: string }[] = [];
    for (let index = 0; index < rows.length; index += BATCH_SIZE) {
      const batch = rows.slice(index, index + BATCH_SIZE);
      const { data: createdBatch, error } = await supabase
        .from("sites")
        .insert(batch)
        .select("id");
      if (error) {
        return {
          error: t("importBatch", { count: inserted, error: error.message }),
          inserted,
          skipped: [],
        };
      }
      (createdBatch ?? []).forEach((row, position) => {
        const source = origin[index + position];
        if (source) created.push({ newId: row.id, originId: source.id });
      });
      inserted += batch.length;
    }

    // Los archivos permanentes de la ficha (planos, fotos de fachada) viajan
    // con el local: son del lugar, no del proyecto. Se copia el archivo en el
    // bucket para que borrar el proyecto viejo no rompa el nuevo.
    await copySiteAttachments(supabase, companyId, created);

    revalidatePath(`/projects/${projectId}`);
    return { error: null, inserted, skipped: [] };
  } catch {
    return { error: t("unexpected"), inserted: 0, skipped: [] };
  }
}

/** Duplica los adjuntos permanentes de cada locación de origen a su copia. */
async function copySiteAttachments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  pairs: { newId: string; originId: string }[],
) {
  if (pairs.length === 0) return;

  const { data: attachments } = await supabase
    .from("site_attachments")
    .select("site_id, storage_path, file_name, mime_type, size_bytes")
    .in(
      "site_id",
      pairs.map((pair) => pair.originId),
    );
  if (!attachments?.length) return;

  const newIdByOrigin = new Map(pairs.map((pair) => [pair.originId, pair.newId]));
  const rows: TablesInsert<"site_attachments">[] = [];

  for (const attachment of attachments) {
    const newSiteId = newIdByOrigin.get(attachment.site_id);
    if (!newSiteId) continue;

    const fileName = attachment.storage_path.split("/").pop() ?? "archivo";
    const destination = `${companyId}/${newSiteId}/${crypto.randomUUID()}-${fileName}`;

    const { error } = await supabase.storage
      .from("evidence")
      .copy(attachment.storage_path, destination);
    // Si un archivo falla, se omite: no vale la pena tumbar toda la copia de
    // locaciones porque un adjunto ya no esté en el bucket.
    if (error) continue;

    rows.push({
      site_id: newSiteId,
      company_id: companyId,
      storage_path: destination,
      file_name: attachment.file_name,
      mime_type: attachment.mime_type,
      size_bytes: attachment.size_bytes,
    });
  }

  if (rows.length) await supabase.from("site_attachments").insert(rows);
}

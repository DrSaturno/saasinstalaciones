import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  toSiteProjection,
  type CanonicalLocationProjection,
  type CanonicalProjectTarget,
} from "@/lib/domain/canonical-locations";
import type { Database, TablesInsert } from "@/types/database";

const WRITE_BATCH = 500;
const READ_PAGE = 1000;

/**
 * Asocia identidades existentes y crea solamente la proyeccion `sites` que el
 * resto de la app necesita durante el dual-read. La locacion permanente y sus
 * documentos no se copian.
 *
 * Una locacion es de la EMPRESA, no de un cliente: puede usarse en proyectos de
 * cualquier cliente de esa empresa (docs/specs/2026-09-24-locaciones-compartidas).
 * Lo que la ata a un cliente es el vinculo `client_locations`, que esta funcion
 * asegura antes de asociarla al proyecto. El vinculo de una locacion con su
 * cliente de origen ya existe (lo crea la base); para cualquier otro cliente se
 * crea aca, SIN codigo propio: el codigo del local es del cliente y se le
 * asigna despues, si lo tiene.
 */
export async function attachCanonicalLocations(
  supabase: SupabaseClient<Database>,
  project: CanonicalProjectTarget,
  locations: readonly CanonicalLocationProjection[],
  userId: string,
): Promise<{ inserted: number; siteIds: string[]; error: string | null }> {
  if (locations.length === 0) return { inserted: 0, siteIds: [], error: null };

  const uniqueLocations = [...new Map(locations.map((row) => [row.id, row])).values()];
  const outOfScope = uniqueLocations.some(
    (location) =>
      location.company_id !== project.company_id ||
      location.country !== project.country ||
      !project.zones.includes(location.zone),
  );
  if (outOfScope) {
    return {
      inserted: 0,
      siteIds: [],
      error: "canonical_location_scope_mismatch",
    };
  }

  const [linkedResult, projectedResult] = await Promise.all([
    (async () => {
      const rows: { location_id: string; status: string }[] = [];
      for (let from = 0; ; from += READ_PAGE) {
        const { data, error } = await supabase
          .from("project_locations")
          .select("location_id, status")
          .eq("project_id", project.id)
          .range(from, from + READ_PAGE - 1);
        if (error) return { rows, error: error.message };
        if (!data) break;
        rows.push(...data);
        if (data.length < READ_PAGE) break;
      }
      return { rows, error: null };
    })(),
    (async () => {
      const rows: { id: string; location_id: string | null }[] = [];
      for (let from = 0; ; from += READ_PAGE) {
        const { data, error } = await supabase
          .from("sites")
          .select("id, location_id")
          .eq("project_id", project.id)
          .not("location_id", "is", null)
          .range(from, from + READ_PAGE - 1);
        if (error) return { rows, error: error.message };
        if (!data) break;
        rows.push(...data);
        if (data.length < READ_PAGE) break;
      }
      return { rows, error: null };
    })(),
  ]);
  const readError = linkedResult.error ?? projectedResult.error;
  if (readError) return { inserted: 0, siteIds: [], error: readError };

  const associationByLocation = new Map(
    linkedResult.rows.map((row) => [row.location_id, row.status]),
  );
  const siteIdByLocation = new Map<string, string>();
  for (const site of projectedResult.rows) {
    if (site.location_id && !siteIdByLocation.has(site.location_id)) {
      siteIdByLocation.set(site.location_id, site.id);
    }
  }
  const pending = uniqueLocations.filter((location) => {
    const associationStatus = associationByLocation.get(location.id);
    return (
      !siteIdByLocation.has(location.id) ||
      !associationStatus ||
      associationStatus === "cancelled"
    );
  });
  if (pending.length === 0) return { inserted: 0, siteIds: [], error: null };

  // Vinculo con el cliente del proyecto para las locaciones que vienen de otro
  // cliente. `ignoreDuplicates`: si ya estaba vinculada (otro proyecto del mismo
  // cliente), no se toca su codigo.
  const needLinks = pending.filter((location) => location.client_id !== project.client_id);
  for (let index = 0; index < needLinks.length; index += WRITE_BATCH) {
    const { error } = await supabase.from("client_locations").upsert(
      needLinks.slice(index, index + WRITE_BATCH).map((location) => ({
        location_id: location.id,
        company_id: project.company_id,
        client_id: project.client_id,
        external_ref: null,
        created_by: userId,
      })),
      { onConflict: "location_id,client_id", ignoreDuplicates: true },
    );
    if (error) return { inserted: 0, siteIds: [], error: error.message };
  }

  const missingProjections = pending.filter(
    (location) => !siteIdByLocation.has(location.id),
  );
  for (let index = 0; index < missingProjections.length; index += WRITE_BATCH) {
    const batch = missingProjections.slice(index, index + WRITE_BATCH);
    const { data, error } = await supabase
      .from("sites")
      .insert(batch.map((location) => toSiteProjection(location, project)))
      .select("id, location_id");
    if (error) {
      return {
        inserted: 0,
        siteIds: pending
          .map((location) => siteIdByLocation.get(location.id))
          .filter((id): id is string => Boolean(id)),
        error: error.message,
      };
    }
    for (const site of data ?? []) {
      if (site.location_id) siteIdByLocation.set(site.location_id, site.id);
    }
  }

  const associationRows: TablesInsert<"project_locations">[] = pending
    .filter((location) => {
      const status = associationByLocation.get(location.id);
      return !status || status === "cancelled";
    })
    .map((location) => {
      const siteId = siteIdByLocation.get(location.id);
      return {
        company_id: project.company_id,
        client_id: project.client_id,
        project_id: project.id,
        location_id: location.id,
        status: "active",
        created_by: userId,
        operational_snapshot: {
          legacy_site_ids: siteId ? [siteId] : [],
        },
      };
    });
  const repairedProjectionOnly = pending.length - associationRows.length;
  let attachedAssociations = 0;
  for (let index = 0; index < associationRows.length; index += WRITE_BATCH) {
    const batch = associationRows.slice(index, index + WRITE_BATCH);
    const { error } = await supabase
      .from("project_locations")
      .upsert(batch, {
        onConflict: "project_id,location_id",
      });
    if (error) {
      return {
        inserted: repairedProjectionOnly + attachedAssociations,
        siteIds: pending
          .map((location) => siteIdByLocation.get(location.id))
          .filter((id): id is string => Boolean(id)),
        error: error.message,
      };
    }
    attachedAssociations += batch.length;
  }

  return {
    inserted: pending.length,
    siteIds: pending
      .map((location) => siteIdByLocation.get(location.id))
      .filter((id): id is string => Boolean(id)),
    error: null,
  };
}

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
      location.client_id !== project.client_id ||
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

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  measureDivergence,
  type DivergenceReport,
  type LocationRow,
  type SiteRow,
} from "@/lib/domain/canonical-divergence";

const PAGE = 1000;

/**
 * Cuántos puntos activos todavía no apuntan a una locación canónica.
 *
 * Es un `count` con índice, pensado para el menú lateral: `fetchDivergenceReport`
 * pagina tres tablas enteras y correrlo en cada render del layout sería caro.
 * No cubre las divergencias de campo, sólo la más común y la más barata de
 * detectar.
 */
export async function countUnlinkedSites(
  supabase: SupabaseClient<Database>,
): Promise<number> {
  const { count } = await supabase
    .from("sites")
    .select("id", { count: "exact", head: true })
    .is("archived_at", null)
    .is("location_id", null);
  return count ?? 0;
}

/**
 * Mide la divergencia entre la proyección `sites` y el modelo canónico.
 *
 * RLS acota todo al tenant, así que el informe es siempre de la empresa del
 * usuario. Se pagina de a 1000 porque un proyecto grande tiene miles de puntos
 * y medir sólo la primera página daría un «cero» falso, que es exactamente el
 * error que este informe existe para evitar.
 */
export async function fetchDivergenceReport(
  supabase: SupabaseClient<Database>,
): Promise<DivergenceReport> {
  const sites: SiteRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("sites")
      .select("id, project_id, location_id, name, address, city, state, zone, external_ref, lat, lng")
      .is("archived_at", null)
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    for (const row of data) {
      sites.push({
        id: row.id,
        projectId: row.project_id,
        locationId: row.location_id,
        name: row.name,
        address: row.address,
        city: row.city,
        state: row.state,
        zone: row.zone,
        externalRef: row.external_ref,
        lat: row.lat,
        lng: row.lng,
      });
    }
    if (data.length < PAGE) break;
  }

  const locations: LocationRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("locations")
      .select("id, name, address, city, state, zone, external_ref, lat, lng")
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    for (const row of data) {
      locations.push({
        id: row.id,
        name: row.name,
        address: row.address,
        city: row.city,
        state: row.state,
        zone: row.zone,
        externalRef: row.external_ref,
        lat: row.lat,
        lng: row.lng,
      });
    }
    if (data.length < PAGE) break;
  }

  const associations = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("project_locations")
      .select("project_id, location_id")
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    for (const row of data) {
      associations.add(`${row.project_id}:${row.location_id}`);
    }
    if (data.length < PAGE) break;
  }

  return measureDivergence(sites, locations, associations);
}

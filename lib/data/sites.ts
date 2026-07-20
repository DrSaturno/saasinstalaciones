import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/types/database";

export type SiteRow = Pick<
  Tables<"sites">,
  "id" | "name" | "address" | "city" | "state" | "zone" | "status" | "external_ref"
>;

const PAGE = 1000;

/**
 * Trae TODOS los puntos de un proyecto.
 *
 * PostgREST limita la respuesta a 1000 filas por defecto: sin paginar, un
 * proyecto de 2000 estaciones se mostraría incompleto sin ningún error visible.
 */
export async function fetchAllSites(
  supabase: SupabaseClient<Database>,
  projectId: string,
): Promise<SiteRow[]> {
  const all: SiteRow[] = [];

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("sites")
      .select("id, name, address, city, state, zone, status, external_ref")
      .eq("project_id", projectId)
      .order("name")
      .range(from, from + PAGE - 1);

    if (error || !data) break;
    all.push(...data);
    if (data.length < PAGE) break;
  }

  return all;
}

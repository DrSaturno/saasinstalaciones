import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/types/database";

export type SiteRow = Pick<
  Tables<"sites">,
  "id" | "name" | "address" | "city" | "state" | "zone" | "status" | "external_ref" | "archived_at"
> & {
  order_count: number;
  completed_count: number;
  progress: number;
};

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
  const rawSites: Omit<SiteRow, "order_count" | "completed_count" | "progress">[] = [];
  const orderStats = new Map<string, { total: number; completed: number }>();

  const fetchSites = async () => {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("sites")
        .select("id, name, address, city, state, zone, status, external_ref, archived_at")
        .eq("project_id", projectId)
        .order("name")
        .range(from, from + PAGE - 1);

      if (error || !data) break;
      rawSites.push(...data);
      if (data.length < PAGE) break;
    }
  };

  const fetchOrders = async () => {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("work_orders")
        .select("site_id, status")
        .eq("project_id", projectId)
        .neq("status", "cancelada")
        .range(from, from + PAGE - 1);
      if (error || !data) break;
      for (const order of data) {
        const entry = orderStats.get(order.site_id) ?? { total: 0, completed: 0 };
        entry.total++;
        if (order.status === "finalizada") entry.completed++;
        orderStats.set(order.site_id, entry);
      }
      if (data.length < PAGE) break;
    }
  };

  await Promise.all([fetchSites(), fetchOrders()]);

  return rawSites.map((site) => {
    const stats = orderStats.get(site.id) ?? { total: 0, completed: 0 };
    return {
      ...site,
      order_count: stats.total,
      completed_count: stats.completed,
      progress: stats.total ? Math.round((stats.completed / stats.total) * 100) : 0,
    };
  });
}

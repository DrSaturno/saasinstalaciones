import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, OrderStatus } from "@/types/database";

export type TaskRow = {
  id: string;
  order_number: string;
  title: string;
  status: OrderStatus;
  scheduled_date: string | null;
  site_name: string;
  site_address: string;
  site_city: string;
  company_id: string;
  company_name: string;
};

/** Peso para ordenar: lo accionable primero, lo cerrado al final. */
const STATUS_WEIGHT: Record<OrderStatus, number> = {
  en_proceso: 0,
  planificada: 1,
  en_revision: 2,
  relevamiento: 3,
  pendiente: 4,
  finalizada: 5,
  cancelada: 6,
};

type RawTask = {
  id: string;
  order_number: string;
  title: string;
  status: OrderStatus;
  scheduled_date: string | null;
  company_id: string;
  sites: { name: string; address: string; city: string } | null;
  companies: { name: string } | null;
};

/**
 * Órdenes asignadas al instalador logueado. La RLS
 * `work_orders_installer_read` ya filtra por assigned_installer_id = auth.uid().
 */
export async function fetchMyTasks(
  supabase: SupabaseClient<Database>,
): Promise<TaskRow[]> {
  const { data } = await supabase
    .from("work_orders")
    .select(
      "id, order_number, title, status, scheduled_date, company_id, sites(name, address, city), companies(name)",
    )
    .order("scheduled_date", { ascending: true, nullsFirst: false })
    .overrideTypes<RawTask[]>();

  const rows: TaskRow[] = (data ?? []).map((o) => ({
    id: o.id,
    order_number: o.order_number,
    title: o.title,
    status: o.status,
    scheduled_date: o.scheduled_date,
    site_name: o.sites?.name ?? "—",
    site_address: o.sites?.address ?? "",
    site_city: o.sites?.city ?? "",
    company_id: o.company_id,
    company_name: o.companies?.name ?? "",
  }));

  return rows.sort(
    (a, b) => STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status],
  );
}

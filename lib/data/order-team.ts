import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PaymentStatus } from "@/types/database";

/**
 * Embed para sumar el costo de los ayudantes a una consulta de órdenes que ya
 * existe (finanzas, ficha de proyecto) sin una segunda consulta.
 */
export const TEAM_COST_SELECT = "work_order_team_members(installer_amount, status)";

export type TeamCostEmbed = {
  work_order_team_members?: { installer_amount: number | null; status: string }[] | null;
};

/** Lo que se le paga a los ayudantes ACTIVOS de una orden, sin el responsable. */
export function embeddedTeamCost(row: TeamCostEmbed): number {
  return (row.work_order_team_members ?? [])
    .filter((member) => member.status === "active")
    .reduce((sum, member) => sum + Number(member.installer_amount ?? 0), 0);
}

/**
 * Filtro `.or()` de "las órdenes de esta persona": las que tiene como
 * responsable más aquellas donde es ayudante activo (bloque 5). Se calcula
 * aparte porque PostgREST no puede OR-ear una columna de `work_orders` con
 * una fila de otra tabla sin un embed `!inner` que descartaría las órdenes
 * sin ayudantes. Los ids salen de la base, no de la entrada del usuario.
 */
export async function orderScopeFilter(
  supabase: SupabaseClient<Database>,
  installerId: string,
): Promise<string> {
  const { data } = await supabase
    .from("work_order_team_members")
    .select("order_id")
    .eq("installer_id", installerId)
    .eq("status", "active");
  const ids = (data ?? []).map((row) => row.order_id);
  return ids.length
    ? `assigned_installer_id.eq.${installerId},id.in.(${ids.join(",")})`
    : `assigned_installer_id.eq.${installerId}`;
}

/**
 * Igual que `TEAM_COST_SELECT` pero con quién es cada ayudante y su estado de
 * cobro: lo necesita finanzas para atribuir costo y deuda a cada persona.
 */
export const TEAM_MEMBERS_SELECT =
  "work_order_team_members(installer_id, installer_amount, status, payment_status)";

export type TeamMembersEmbed = {
  work_order_team_members?:
    | { installer_id: string; installer_amount: number | null; status: string; payment_status: PaymentStatus }[]
    | null;
};

/** Ayudantes ACTIVOS de un embed de `TEAM_MEMBERS_SELECT`, listos para finanzas. */
export function embeddedTeamMembers(row: TeamMembersEmbed) {
  return (row.work_order_team_members ?? [])
    .filter((member) => member.status === "active")
    .map((member) => ({
      installerId: member.installer_id,
      amount: member.installer_amount === null ? null : Number(member.installer_amount),
      paymentStatus: member.payment_status,
    }));
}

export type OrderTeamMember = {
  installerId: string;
  name: string;
  amount: number | null;
  paymentStatus: PaymentStatus;
};

/**
 * Ayudantes activos de una orden (bloque 5), sin el responsable — ese sigue
 * en `work_orders.assigned_installer_id`. La RLS de `work_order_team_members`
 * ya limita quién ve esto: quien opera la orden ve a todos, un ayudante sólo
 * su propia fila.
 */
export async function fetchOrderTeam(
  supabase: SupabaseClient<Database>,
  orderId: string,
): Promise<OrderTeamMember[]> {
  const { data: rows } = await supabase
    .from("work_order_team_members")
    .select("installer_id, installer_amount, payment_status")
    .eq("order_id", orderId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (!rows?.length) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", rows.map((row) => row.installer_id));
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));

  return rows.map((row) => ({
    installerId: row.installer_id,
    name: names.get(row.installer_id) ?? "—",
    amount: row.installer_amount === null ? null : Number(row.installer_amount),
    paymentStatus: row.payment_status,
  }));
}

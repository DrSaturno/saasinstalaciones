import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type CoordinationHome = {
  /** Proyectos activos a cargo. */
  projects: number;
  /** Órdenes de esos proyectos, sin contar canceladas. */
  total: number;
  pendingReview: number;
  inProgress: number;
  unassigned: number;
  doneToday: number;
  /** Trabajos por día de la semana entrante, del equipo que coordina. */
  week: { date: string; total: number }[];
};

/**
 * Métricas del coordinador sobre lo que COORDINA, no sobre lo que ejecuta.
 *
 * Van separadas de las de instalador a propósito: son dos roles conviviendo en
 * la misma persona y mezclarlas haría ilegibles las dos. El alcance sale de
 * `projects.coordinator_id`, igual que el tablero de Coordinación.
 */
export async function fetchCoordinationHome(
  supabase: SupabaseClient<Database>,
  coordinatorId: string,
  today: string,
  weekDates: readonly string[],
): Promise<CoordinationHome | null> {
  const { data: projects } = await supabase
    .from("projects")
    .select("id")
    .eq("coordinator_id", coordinatorId)
    .is("archived_at", null);

  const projectIds = (projects ?? []).map((project) => project.id);
  const empty: CoordinationHome = {
    projects: projectIds.length,
    total: 0,
    pendingReview: 0,
    inProgress: 0,
    unassigned: 0,
    doneToday: 0,
    week: weekDates.map((date) => ({ date, total: 0 })),
  };
  if (projectIds.length === 0) return empty;

  const { data: orders } = await supabase
    .from("work_orders")
    .select("id, status, scheduled_date, assigned_installer_id, updated_at")
    .in("project_id", projectIds)
    .neq("status", "cancelada");

  if (!orders?.length) return empty;

  const perDay = new Map(weekDates.map((date) => [date, 0]));
  for (const order of orders) {
    if (!order.scheduled_date) continue;
    if (perDay.has(order.scheduled_date)) {
      perDay.set(order.scheduled_date, (perDay.get(order.scheduled_date) ?? 0) + 1);
    }
  }

  return {
    projects: projectIds.length,
    total: orders.length,
    pendingReview: orders.filter((order) => order.status === "en_revision").length,
    inProgress: orders.filter((order) => order.status === "en_proceso").length,
    unassigned: orders.filter((order) => !order.assigned_installer_id).length,
    doneToday: orders.filter(
      (order) =>
        order.status === "finalizada" && order.updated_at.startsWith(today),
    ).length,
    week: weekDates.map((date) => ({ date, total: perDay.get(date) ?? 0 })),
  };
}

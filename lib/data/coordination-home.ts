import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, OrderStatus } from "@/types/database";

export type CoordinationHome = {
  companyId: string;
  /** Proyectos activos a cargo. */
  projects: number;
  /** Órdenes de esos proyectos, incluidas canceladas. */
  total: number;
  /** Conteo por cada estado de la máquina: puede tener trabajos en todos. */
  byStatus: Record<OrderStatus, number>;
  unassigned: number;
  doneToday: number;
};

const EMPTY_STATUS: Record<OrderStatus, number> = {
  pendiente: 0,
  relevamiento: 0,
  planificada: 0,
  en_camino: 0,
  en_sitio: 0,
  en_proceso: 0,
  en_revision: 0,
  finalizada: 0,
  cancelada: 0,
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
): Promise<CoordinationHome[]> {
  const { data: projects } = await supabase
    .from("projects")
    .select("id, company_id")
    .eq("coordinator_id", coordinatorId)
    .is("archived_at", null);

  const projectIds = (projects ?? []).map((project) => project.id);
  if (projectIds.length === 0) return [];

  const { data: orders } = await supabase
    .from("work_orders")
    .select("id, company_id, status, assigned_installer_id, updated_at")
    .in("project_id", projectIds);

  const companyIds = [
    ...new Set((projects ?? []).map((project) => project.company_id)),
  ];

  return companyIds.map((companyId) => {
    const companyProjects = (projects ?? []).filter(
      (project) => project.company_id === companyId,
    );
    const companyOrders = (orders ?? []).filter(
      (order) => order.company_id === companyId,
    );
    const byStatus = { ...EMPTY_STATUS };
    for (const order of companyOrders) byStatus[order.status] += 1;

    return {
      companyId,
      projects: companyProjects.length,
      total: companyOrders.length,
      byStatus,
      unassigned: companyOrders.filter(
        (order) =>
          !order.assigned_installer_id &&
          !["finalizada", "cancelada"].includes(order.status),
      ).length,
      doneToday: companyOrders.filter(
        (order) =>
          order.status === "finalizada" && order.updated_at.startsWith(today),
      ).length,
    };
  });
}

export function emptyCoordinationHome(companyId: string): CoordinationHome {
  return {
    companyId,
    projects: 0,
    total: 0,
    byStatus: { ...EMPTY_STATUS },
    unassigned: 0,
    doneToday: 0,
  };
}

import type {
  IncidentStatus,
  OrderStatus,
  ProjectStatus,
} from "@/types/database";

export type LocationAssociationSource = {
  id: string;
  project_id: string;
  status: string;
  scope: string;
  unit_quantity: number;
  created_at: string;
};

export type LocationProjectSource = {
  id: string;
  name: string;
  status: ProjectStatus;
  starts_at: string | null;
  ends_at: string | null;
  archived_at: string | null;
};

export type LocationSiteSource = {
  id: string;
  project_id: string;
};

export type LocationOrderSource = {
  id: string;
  site_id: string;
  project_id: string;
  order_number: string;
  title: string;
  status: OrderStatus;
  scheduled_date: string | null;
  finalized_at: string | null;
  created_at: string;
};

export type LocationIncidentSource = {
  order_id: string;
  status: IncidentStatus;
};

export type LocationOrderHistory = LocationOrderSource & {
  incidentCount: number;
  openIncidentCount: number;
};

export type LocationProjectHistory = {
  associationId: string | null;
  associationStatus: string;
  scope: string;
  unitQuantity: number;
  projectId: string;
  projectName: string | null;
  projectStatus: ProjectStatus | null;
  startsAt: string | null;
  endsAt: string | null;
  archivedAt: string | null;
  orders: LocationOrderHistory[];
};

/**
 * Une la asociacion canonica con sus proyecciones legacy y OTs.
 *
 * Durante el dual-read puede haber una divergencia temporal: una OT vinculada
 * por `sites.location_id` cuyo `project_locations` todavia no se reconcilio.
 * Esa historia no se oculta; aparece como proyecto sin asociacion para que la
 * ficha siga siendo completa y el corte pueda medir la divergencia.
 */
export function buildLocationProjectHistory({
  associations,
  projects,
  sites,
  orders,
  incidents,
}: {
  associations: readonly LocationAssociationSource[];
  projects: readonly LocationProjectSource[];
  sites: readonly LocationSiteSource[];
  orders: readonly LocationOrderSource[];
  incidents: readonly LocationIncidentSource[];
}): LocationProjectHistory[] {
  const associationByProject = new Map(
    associations.map((association) => [association.project_id, association]),
  );
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const projectBySite = new Map(sites.map((site) => [site.id, site.project_id]));
  const incidentStats = new Map<
    string,
    { total: number; open: number }
  >();

  for (const incident of incidents) {
    const current = incidentStats.get(incident.order_id) ?? {
      total: 0,
      open: 0,
    };
    current.total += 1;
    if (incident.status === "open") current.open += 1;
    incidentStats.set(incident.order_id, current);
  }

  const ordersByProject = new Map<string, LocationOrderHistory[]>();
  for (const order of orders) {
    const projectId = projectBySite.get(order.site_id) ?? order.project_id;
    const incident = incidentStats.get(order.id) ?? { total: 0, open: 0 };
    const historyOrder = {
      ...order,
      incidentCount: incident.total,
      openIncidentCount: incident.open,
    };
    ordersByProject.set(projectId, [
      ...(ordersByProject.get(projectId) ?? []),
      historyOrder,
    ]);
  }

  const projectIds = new Set([
    ...associations.map((association) => association.project_id),
    ...ordersByProject.keys(),
  ]);

  return [...projectIds]
    .map((projectId) => {
      const association = associationByProject.get(projectId);
      const project = projectById.get(projectId);
      const projectOrders = (ordersByProject.get(projectId) ?? []).toSorted(
        (a, b) =>
          (b.scheduled_date ?? b.created_at).localeCompare(
            a.scheduled_date ?? a.created_at,
          ),
      );

      return {
        associationId: association?.id ?? null,
        associationStatus: association?.status ?? "unreconciled",
        scope: association?.scope ?? "",
        unitQuantity: association?.unit_quantity ?? 1,
        projectId,
        projectName: project?.name ?? null,
        projectStatus: project?.status ?? null,
        startsAt: project?.starts_at ?? null,
        endsAt: project?.ends_at ?? null,
        archivedAt: project?.archived_at ?? null,
        orders: projectOrders,
      } satisfies LocationProjectHistory;
    })
    .toSorted((a, b) => {
      const aDate = a.startsAt ?? a.orders[0]?.created_at ?? "";
      const bDate = b.startsAt ?? b.orders[0]?.created_at ?? "";
      return bDate.localeCompare(aDate);
    });
}

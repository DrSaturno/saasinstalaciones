import { describe, expect, it } from "vitest";

import { buildLocationProjectHistory } from "@/lib/domain/location-detail";

const projects = [
  {
    id: "project-new",
    name: "Renovacion 2026",
    status: "active" as const,
    starts_at: "2026-06-01",
    ends_at: null,
    archived_at: null,
  },
  {
    id: "project-old",
    name: "Campana 2024",
    status: "done" as const,
    starts_at: "2024-02-01",
    ends_at: "2024-04-30",
    archived_at: "2024-05-02T00:00:00Z",
  },
];

describe("buildLocationProjectHistory", () => {
  it("reune las OTs de las distintas proyecciones de una misma locacion", () => {
    const history = buildLocationProjectHistory({
      associations: projects.map((project, index) => ({
        id: `association-${index}`,
        project_id: project.id,
        status: index === 0 ? "active" : "completed",
        scope: index === 0 ? "Cambio de marquesina" : "Relevamiento",
        unit_quantity: 1,
        created_at: project.starts_at,
      })),
      projects,
      sites: [
        { id: "site-new", project_id: "project-new" },
        { id: "site-old", project_id: "project-old" },
      ],
      orders: [
        {
          id: "order-new",
          site_id: "site-new",
          project_id: "project-new",
          order_number: "OT-2026-1",
          title: "Instalacion",
          status: "en_proceso",
          scheduled_date: "2026-08-20",
          finalized_at: null,
          created_at: "2026-08-01T00:00:00Z",
        },
        {
          id: "order-old",
          site_id: "site-old",
          project_id: "project-old",
          order_number: "OT-2024-1",
          title: "Relevamiento",
          status: "finalizada",
          scheduled_date: "2024-03-10",
          finalized_at: "2024-03-10T18:00:00Z",
          created_at: "2024-03-01T00:00:00Z",
        },
      ],
      incidents: [
        { order_id: "order-new", status: "open" },
        { order_id: "order-new", status: "resolved" },
      ],
    });

    expect(history.map((entry) => entry.projectId)).toEqual([
      "project-new",
      "project-old",
    ]);
    expect(history[0].orders[0]).toMatchObject({
      id: "order-new",
      incidentCount: 2,
      openIncidentCount: 1,
    });
    expect(history[1].orders[0].id).toBe("order-old");
  });

  it("no oculta una OT si falta temporalmente la asociacion canonica", () => {
    const history = buildLocationProjectHistory({
      associations: [],
      projects: [projects[0]],
      sites: [{ id: "site-new", project_id: "project-new" }],
      orders: [
        {
          id: "order-new",
          site_id: "site-new",
          project_id: "project-new",
          order_number: "OT-2026-1",
          title: "Instalacion",
          status: "pendiente",
          scheduled_date: null,
          finalized_at: null,
          created_at: "2026-08-01T00:00:00Z",
        },
      ],
      incidents: [],
    });

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      associationId: null,
      associationStatus: "unreconciled",
      projectId: "project-new",
    });
  });

  it("ordena primero el proyecto mas reciente y sus OTs mas nuevas", () => {
    const history = buildLocationProjectHistory({
      associations: projects.map((project, index) => ({
        id: `association-${index}`,
        project_id: project.id,
        status: "active",
        scope: "",
        unit_quantity: 1,
        created_at: project.starts_at,
      })),
      projects,
      sites: [{ id: "site-new", project_id: "project-new" }],
      orders: [
        {
          id: "older",
          site_id: "site-new",
          project_id: "project-new",
          order_number: "OT-1",
          title: "Primera",
          status: "finalizada",
          scheduled_date: "2026-07-01",
          finalized_at: null,
          created_at: "2026-06-01T00:00:00Z",
        },
        {
          id: "newer",
          site_id: "site-new",
          project_id: "project-new",
          order_number: "OT-2",
          title: "Segunda",
          status: "pendiente",
          scheduled_date: "2026-08-01",
          finalized_at: null,
          created_at: "2026-07-01T00:00:00Z",
        },
      ],
      incidents: [],
    });

    expect(history[0].projectId).toBe("project-new");
    expect(history[0].orders.map((order) => order.id)).toEqual([
      "newer",
      "older",
    ]);
  });
});

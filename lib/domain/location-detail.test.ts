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
          assigned_installer_id: "installer-1",
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
          assigned_installer_id: null,
        },
      ],
      incidents: [
        { order_id: "order-new", status: "open" },
        { order_id: "order-new", status: "resolved" },
      ],
      installerNames: new Map([["installer-1", "Juana Pérez"]]),
    });

    expect(history.map((entry) => entry.projectId)).toEqual([
      "project-new",
      "project-old",
    ]);
    expect(history[0].orders[0]).toMatchObject({
      id: "order-new",
      incidentCount: 2,
      openIncidentCount: 1,
      installerName: "Juana Pérez",
    });
    expect(history[1].orders[0].installerName).toBeNull();
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
          assigned_installer_id: null,
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
          assigned_installer_id: null,
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
          assigned_installer_id: null,
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

  it("resuelve el instalador desde el mapa de nombres, sin romper si falta o no vino asignado", () => {
    const history = buildLocationProjectHistory({
      associations: [],
      projects: [projects[0]],
      sites: [{ id: "site-new", project_id: "project-new" }],
      orders: [
        {
          id: "con-instalador-conocido",
          site_id: "site-new",
          project_id: "project-new",
          order_number: "OT-1",
          title: "Instalacion",
          status: "en_proceso",
          scheduled_date: "2026-08-10",
          finalized_at: null,
          created_at: "2026-08-01T00:00:00Z",
          assigned_installer_id: "installer-1",
        },
        {
          id: "con-instalador-sin-nombre",
          site_id: "site-new",
          project_id: "project-new",
          order_number: "OT-2",
          title: "Instalacion",
          status: "en_proceso",
          scheduled_date: "2026-08-05",
          finalized_at: null,
          created_at: "2026-08-01T00:00:00Z",
          // Instalador dado de baja o el mapa no llegó a resolverlo: no debe reventar.
          assigned_installer_id: "installer-desconocido",
        },
        {
          id: "sin-asignar",
          site_id: "site-new",
          project_id: "project-new",
          order_number: "OT-3",
          title: "Instalacion",
          status: "pendiente",
          scheduled_date: "2026-08-01",
          finalized_at: null,
          created_at: "2026-08-01T00:00:00Z",
          assigned_installer_id: null,
        },
      ],
      incidents: [],
      installerNames: new Map([["installer-1", "Juana Pérez"]]),
    });

    const byId = new Map(history[0].orders.map((order) => [order.id, order.installerName]));
    expect(byId.get("con-instalador-conocido")).toBe("Juana Pérez");
    expect(byId.get("con-instalador-sin-nombre")).toBeNull();
    expect(byId.get("sin-asignar")).toBeNull();
  });
});

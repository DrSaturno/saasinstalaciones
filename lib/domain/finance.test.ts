import { describe, expect, it } from "vitest";
import { buildFinancialOverview } from "@/lib/domain/finance";

describe("buildFinancialOverview", () => {
  it("distribuye un contrato global sin duplicar el importe", () => {
    const result = buildFinancialOverview(
      [{ id: "p", name: "Proyecto", billingMode: "project", contractAmount: 1000, currency: "ARS" }],
      [
        { id: "1", projectId: "p", siteId: "a", status: "finalizada", amount: 999, currency: "ARS", installerId: "i", finalizedAt: "2026-07-10T12:00:00Z", scheduledDate: "2026-07-10" },
        { id: "2", projectId: "p", siteId: "b", status: "pendiente", amount: 999, currency: "ARS", installerId: null, finalizedAt: null, scheduledDate: null },
      ],
      { siteZones: new Map([["a", "AMBA"], ["b", "AMBA"]]), installerNames: new Map([["i", "Ana"]]), now: new Date("2026-07-21T12:00:00Z") },
    );
    expect(result.currencies[0]).toMatchObject({ contracted: 1000, completed: 500, pending: 500 });
    expect(result.zones[0].contracted).toBe(1000);
  });

  it("suma importes por instalación y excluye órdenes canceladas", () => {
    const result = buildFinancialOverview(
      [{ id: "p", name: "Proyecto", billingMode: "per_installation", contractAmount: null, currency: "BRL" }],
      [
        { id: "1", projectId: "p", siteId: "a", status: "finalizada", amount: 300, currency: "BRL", installerId: null, finalizedAt: "2026-06-01T12:00:00Z", scheduledDate: "2026-06-01" },
        { id: "2", projectId: "p", siteId: "a", status: "cancelada", amount: 800, currency: "BRL", installerId: null, finalizedAt: null, scheduledDate: null },
      ],
      { siteZones: new Map(), installerNames: new Map(), now: new Date("2026-07-21T12:00:00Z") },
    );
    expect(result.projects[0]).toMatchObject({ contracted: 300, completed: 300, pending: 0 });
  });
});

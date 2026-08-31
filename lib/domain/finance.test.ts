import { describe, expect, it } from "vitest";
import { buildFinancialOverview } from "@/lib/domain/finance";

describe("buildFinancialOverview", () => {
  it("distribuye un contrato global sin duplicar el importe", () => {
    const result = buildFinancialOverview(
      [{ id: "p", name: "Proyecto", billingMode: "project", contractAmount: 1000, currency: "ARS" }],
      [
        { id: "1", orderNumber: "OT-1", title: "Trabajo 1", projectId: "p", siteId: "a", status: "finalizada", amount: 999, installerAmount: null, paymentStatus: "paid", currency: "ARS", installerId: "i", finalizedAt: "2026-07-10T12:00:00Z", scheduledDate: "2026-07-10" },
        { id: "2", orderNumber: "OT-2", title: "Trabajo 2", projectId: "p", siteId: "b", status: "pendiente", amount: 999, installerAmount: null, paymentStatus: "pending", currency: "ARS", installerId: null, finalizedAt: null, scheduledDate: null },
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
        { id: "1", orderNumber: "OT-1", title: "Trabajo 1", projectId: "p", siteId: "a", status: "finalizada", amount: 300, installerAmount: null, paymentStatus: "paid", currency: "BRL", installerId: null, finalizedAt: "2026-06-01T12:00:00Z", scheduledDate: "2026-06-01" },
        { id: "2", orderNumber: "OT-2", title: "Trabajo 2", projectId: "p", siteId: "a", status: "cancelada", amount: 800, installerAmount: null, paymentStatus: "pending", currency: "BRL", installerId: null, finalizedAt: null, scheduledDate: null },
      ],
      { siteZones: new Map(), installerNames: new Map(), now: new Date("2026-07-21T12:00:00Z") },
    );
    expect(result.projects[0]).toMatchObject({ contracted: 300, completed: 300, pending: 0 });
  });
});

describe("costo del instalador y margen", () => {
  const proyecto = { id: "p", name: "Proyecto", billingMode: "per_installation" as const, contractAmount: null, currency: "ARS" as const };
  const contexto = { siteZones: new Map(), installerNames: new Map([["i", "Ana"]]), now: new Date("2026-07-21T12:00:00Z") };

  it("el margen es lo realizado menos lo que se le paga al instalador", () => {
    const result = buildFinancialOverview(
      [proyecto],
      [
        { id: "1", orderNumber: "OT-1", title: "Terminada", projectId: "p", siteId: "a", status: "finalizada", amount: 1000, installerAmount: 300, paymentStatus: "paid", currency: "ARS", installerId: "i", finalizedAt: "2026-07-10T12:00:00Z", scheduledDate: "2026-07-10" },
      ],
      contexto,
    );
    expect(result.projects[0]).toMatchObject({ completed: 1000, installerCost: 300, margin: 700 });
    expect(result.currencies[0]).toMatchObject({ installerCost: 300, margin: 700 });
  });

  it("no confunde el ingreso de la empresa con el costo del instalador", () => {
    const result = buildFinancialOverview(
      [proyecto],
      [
        { id: "1", orderNumber: "OT-1", title: "Terminada", projectId: "p", siteId: "a", status: "finalizada", amount: 1000, installerAmount: 300, paymentStatus: "paid", currency: "ARS", installerId: "i", finalizedAt: "2026-07-10T12:00:00Z", scheduledDate: "2026-07-10" },
      ],
      contexto,
    );
    // El desglose por instalador reportaba el ingreso como si fuera su pago:
    // eran el mismo número con dos etiquetas. Ahora son dos columnas distintas.
    expect(result.installers[0]).toMatchObject({ name: "Ana", completed: 1000, installerCost: 300 });
  });

  it("una orden sin costo cargado no inventa margen", () => {
    const result = buildFinancialOverview(
      [proyecto],
      [
        { id: "1", orderNumber: "OT-1", title: "Sin costo", projectId: "p", siteId: "a", status: "finalizada", amount: 1000, installerAmount: null, paymentStatus: "pending", currency: "ARS", installerId: "i", finalizedAt: "2026-07-10T12:00:00Z", scheduledDate: "2026-07-10" },
      ],
      contexto,
    );
    expect(result.projects[0]).toMatchObject({ installerCost: 0, margin: 1000 });
  });
});

describe("pendientes de pago al instalador", () => {
  const proyecto = { id: "p", name: "Refacción Norte", billingMode: "per_installation" as const, contractAmount: null, currency: "ARS" as const };
  const contexto = { siteZones: new Map(), installerNames: new Map([["i", "Ana"], ["j", "Beto"]]), now: new Date("2026-07-21T12:00:00Z") };

  it("lista sólo el trabajo terminado que todavía no se pagó", () => {
    const result = buildFinancialOverview(
      [proyecto],
      [
        { id: "1", orderNumber: "OT-1", title: "Terminada sin pagar", projectId: "p", siteId: "a", status: "finalizada", amount: 1000, installerAmount: 300, paymentStatus: "pending", currency: "ARS", installerId: "i", finalizedAt: "2026-07-10T12:00:00Z", scheduledDate: "2026-07-10" },
        { id: "2", orderNumber: "OT-2", title: "Terminada y pagada", projectId: "p", siteId: "a", status: "finalizada", amount: 1000, installerAmount: 400, paymentStatus: "paid", currency: "ARS", installerId: "j", finalizedAt: "2026-07-11T12:00:00Z", scheduledDate: "2026-07-11" },
        // En curso: el trabajo no terminó, así que todavía no se debe.
        { id: "3", orderNumber: "OT-3", title: "En curso", projectId: "p", siteId: "a", status: "en_proceso", amount: 1000, installerAmount: 500, paymentStatus: "pending", currency: "ARS", installerId: "i", finalizedAt: null, scheduledDate: "2026-07-12" },
      ],
      contexto,
    );
    expect(result.pendingPayments).toHaveLength(1);
    expect(result.pendingPayments[0]).toMatchObject({
      orderNumber: "OT-1",
      installerName: "Ana",
      projectName: "Refacción Norte",
      installerCost: 300,
    });
    expect(result.pendingPaymentTotals).toEqual([{ currency: "ARS", total: 300, orders: 1 }]);
  });

  it("ordena lo más viejo primero: es la deuda que más urge", () => {
    const result = buildFinancialOverview(
      [proyecto],
      [
        { id: "1", orderNumber: "OT-NUEVA", title: "Reciente", projectId: "p", siteId: "a", status: "finalizada", amount: 100, installerAmount: 10, paymentStatus: "pending", currency: "ARS", installerId: "i", finalizedAt: "2026-07-15T12:00:00Z", scheduledDate: "2026-07-15" },
        { id: "2", orderNumber: "OT-VIEJA", title: "Antigua", projectId: "p", siteId: "a", status: "finalizada", amount: 100, installerAmount: 10, paymentStatus: "pending", currency: "ARS", installerId: "i", finalizedAt: "2026-05-02T12:00:00Z", scheduledDate: "2026-05-02" },
      ],
      contexto,
    );
    expect(result.pendingPayments.map((row) => row.orderNumber)).toEqual(["OT-VIEJA", "OT-NUEVA"]);
  });
});

describe("el margen compara cosas del mismo momento", () => {
  it("no cuenta el costo de órdenes que todavía no se terminaron", () => {
    // Encontrado probando la pantalla: con una orden terminada y varias sin
    // empezar, el margen daba negativo porque sumaba el costo de TODAS contra
    // el ingreso de las terminadas. Comparaba ingreso realizado con costo
    // comprometido: pérdidas que no existían.
    const result = buildFinancialOverview(
      [{ id: "p", name: "Proyecto", billingMode: "per_installation", contractAmount: null, currency: "ARS" }],
      [
        { id: "1", orderNumber: "OT-1", title: "Terminada", projectId: "p", siteId: "a", status: "finalizada", amount: 1000, installerAmount: 400, paymentStatus: "paid", currency: "ARS", installerId: "i", finalizedAt: "2026-07-10T12:00:00Z", scheduledDate: "2026-07-10" },
        { id: "2", orderNumber: "OT-2", title: "Sin empezar", projectId: "p", siteId: "a", status: "pendiente", amount: 1000, installerAmount: 400, paymentStatus: "pending", currency: "ARS", installerId: "i", finalizedAt: null, scheduledDate: "2026-07-20" },
        { id: "3", orderNumber: "OT-3", title: "Sin empezar", projectId: "p", siteId: "a", status: "pendiente", amount: 1000, installerAmount: 400, paymentStatus: "pending", currency: "ARS", installerId: "i", finalizedAt: null, scheduledDate: "2026-07-21" },
      ],
      { siteZones: new Map(), installerNames: new Map([["i", "Ana"]]), now: new Date("2026-07-25T12:00:00Z") },
    );

    // Ingreso realizado 1000 contra costo realizado 400 → 600, no 1000 - 1200.
    expect(result.projects[0].margin).toBe(600);
    expect(result.currencies[0].margin).toBe(600);
    // El costo comprometido sí incluye todo: es "cuánto voy a pagar en total".
    expect(result.projects[0].installerCost).toBe(1200);
  });
});

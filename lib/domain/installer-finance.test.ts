import { describe, expect, it } from "vitest";
import {
  buildInstallerEarnings,
  type InstallerEarningInput,
} from "@/lib/domain/installer-finance";

const CONTEXTO = {
  companyNames: new Map([
    ["empresa-a", "Gráfica A"],
    ["empresa-b", "Gráfica B"],
  ]),
  fallbackCompanyName: "Empresa",
};

function orden(over: Partial<InstallerEarningInput> = {}): InstallerEarningInput {
  return {
    orderId: "1",
    orderNumber: "OT-1",
    title: "Trabajo",
    companyId: "empresa-a",
    status: "finalizada",
    amount: 100,
    currency: "ARS",
    paymentStatus: "pending",
    finalizedAt: "2026-07-10T12:00:00Z",
    scheduledDate: "2026-07-10",
    ...over,
  };
}

describe("buildInstallerEarnings", () => {
  it("suma el trabajo de todas las empresas en un solo total", () => {
    // Es la razón de existir de esta vista: el instalador trabaja para varias
    // empresas y quiere su ingreso completo, no uno por cada una.
    const result = buildInstallerEarnings(
      [
        orden({ orderId: "1", companyId: "empresa-a", amount: 100 }),
        orden({ orderId: "2", companyId: "empresa-b", amount: 250 }),
      ],
      CONTEXTO,
    );
    expect(result.totals).toHaveLength(1);
    expect(result.totals[0]).toMatchObject({ currency: "ARS", earned: 350, doneOrders: 2 });
  });

  it("separa cobrado de pendiente", () => {
    const result = buildInstallerEarnings(
      [
        orden({ orderId: "1", amount: 100, paymentStatus: "paid" }),
        orden({ orderId: "2", amount: 60, paymentStatus: "pending" }),
      ],
      CONTEXTO,
    );
    expect(result.totals[0]).toMatchObject({
      earned: 160, paid: 100, unpaid: 60, paidOrders: 1, unpaidOrders: 1,
    });
  });

  it("no cuenta como ganado un trabajo que todavía no se hizo", () => {
    const result = buildInstallerEarnings(
      [
        orden({ orderId: "1", status: "finalizada", amount: 100 }),
        orden({ orderId: "2", status: "planificada", amount: 999, finalizedAt: null }),
      ],
      CONTEXTO,
    );
    // La orden futura aparece en la lista, pero no infla el ingreso.
    expect(result.totals[0].earned).toBe(100);
    expect(result.rows).toHaveLength(2);
  });

  it("ignora las órdenes canceladas", () => {
    const result = buildInstallerEarnings(
      [
        orden({ orderId: "1", amount: 100 }),
        orden({ orderId: "2", status: "cancelada", amount: 500, finalizedAt: null }),
      ],
      CONTEXTO,
    );
    expect(result.totals[0].earned).toBe(100);
    expect(result.rows).toHaveLength(1);
  });

  it("nunca mezcla monedas de países distintos", () => {
    const result = buildInstallerEarnings(
      [
        orden({ orderId: "1", currency: "ARS", amount: 100 }),
        orden({ orderId: "2", currency: "BRL", amount: 50, companyId: "empresa-b" }),
      ],
      CONTEXTO,
    );
    expect(result.totals).toHaveLength(2);
    expect(result.totals.map((total) => total.currency).sort()).toEqual(["ARS", "BRL"]);
  });
});

describe("filtros", () => {
  const ordenes = [
    orden({ orderId: "1", orderNumber: "INT-100", companyId: "empresa-a", amount: 100, paymentStatus: "paid", finalizedAt: "2026-07-05T12:00:00Z", scheduledDate: "2026-07-05" }),
    orden({ orderId: "2", orderNumber: "INT-200", companyId: "empresa-b", amount: 200, paymentStatus: "pending", finalizedAt: "2026-08-15T12:00:00Z", scheduledDate: "2026-08-15" }),
  ];

  it("filtra por empresa", () => {
    const result = buildInstallerEarnings(ordenes, { ...CONTEXTO, filters: { companyId: "empresa-b" } });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].companyName).toBe("Gráfica B");
  });

  it("la lista de empresas no se achica al filtrar por una", () => {
    // Si el desplegable se armara con lo filtrado, elegir una empresa borraría
    // las demás y no habría forma de volver atrás.
    const result = buildInstallerEarnings(ordenes, { ...CONTEXTO, filters: { companyId: "empresa-b" } });
    expect(result.companies).toHaveLength(2);
  });

  it("filtra por estado de pago", () => {
    const result = buildInstallerEarnings(ordenes, { ...CONTEXTO, filters: { paymentStatus: "pending" } });
    expect(result.rows.map((row) => row.orderNumber)).toEqual(["INT-200"]);
  });

  it("busca por número de orden sin exigir el texto exacto", () => {
    const result = buildInstallerEarnings(ordenes, { ...CONTEXTO, filters: { orderNumber: "int-2" } });
    expect(result.rows.map((row) => row.orderNumber)).toEqual(["INT-200"]);
  });

  it("filtra por período", () => {
    const result = buildInstallerEarnings(ordenes, {
      ...CONTEXTO,
      filters: { from: "2026-08-01", to: "2026-08-31" },
    });
    expect(result.rows.map((row) => row.orderNumber)).toEqual(["INT-200"]);
    expect(result.totals[0].earned).toBe(200);
  });

  it("ordena lo más reciente primero", () => {
    const result = buildInstallerEarnings(ordenes, CONTEXTO);
    expect(result.rows.map((row) => row.orderNumber)).toEqual(["INT-200", "INT-100"]);
  });
});

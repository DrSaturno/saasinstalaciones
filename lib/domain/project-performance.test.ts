import { describe, expect, it } from "vitest";
import {
  buildProjectPerformance,
  type PerformanceOrder,
} from "@/lib/domain/project-performance";

const HOY = "2026-08-20";
const POR_INSTALACION = { billingMode: "per_installation" as const, contractAmount: null, currency: "ARS" as const };

function orden(over: Partial<PerformanceOrder> = {}): PerformanceOrder {
  return {
    status: "finalizada",
    amount: 1000,
    installerAmount: 400,
    installerId: "i1",
    scheduledEndDate: "2026-08-10",
    finalizedAt: "2026-08-09T12:00:00Z",
    ...over,
  };
}

describe("buildProjectPerformance", () => {
  it("calcula ganancia y margen sobre lo terminado", () => {
    const result = buildProjectPerformance(POR_INSTALACION, [orden()], [], HOY);
    expect(result).toMatchObject({ revenue: 1000, installerCost: 400, profit: 600, marginPct: 60 });
  });

  it("no cuenta el costo de lo que todavía no se hizo, pero sí lo informa aparte", () => {
    const result = buildProjectPerformance(
      POR_INSTALACION,
      [orden(), orden({ status: "pendiente", finalizedAt: null })],
      [],
      HOY,
    );
    // Ganancia sobre lo terminado…
    expect(result.profit).toBe(600);
    // …y el compromiso total con los instaladores, que es otra pregunta útil.
    expect(result.committedCost).toBe(800);
  });

  it("marca demorada la orden cuya fecha de fin ya pasó y sigue abierta", () => {
    const result = buildProjectPerformance(
      POR_INSTALACION,
      [
        orden({ status: "en_proceso", scheduledEndDate: "2026-08-01", finalizedAt: null }),
        orden({ status: "en_proceso", scheduledEndDate: "2026-09-30", finalizedAt: null }),
        // Terminada tarde: ya no está demorada, se entregó.
        orden({ status: "finalizada", scheduledEndDate: "2026-08-01" }),
      ],
      [],
      HOY,
    );
    expect(result.orders).toMatchObject({ total: 3, done: 1, open: 2, delayed: 1 });
  });

  it("una orden sin fecha de fin nunca está demorada", () => {
    const result = buildProjectPerformance(
      POR_INSTALACION,
      [orden({ status: "pendiente", scheduledEndDate: null, finalizedAt: null })],
      [],
      HOY,
    );
    expect(result.orders.delayed).toBe(0);
  });

  it("cuenta personas distintas, no órdenes", () => {
    const result = buildProjectPerformance(
      POR_INSTALACION,
      [
        orden({ installerId: "i1" }),
        orden({ installerId: "i1" }),
        orden({ installerId: "i2" }),
        orden({ installerId: null }),
      ],
      [],
      HOY,
    );
    expect(result.installers).toBe(2);
  });

  it("ignora las canceladas en todo", () => {
    const result = buildProjectPerformance(
      POR_INSTALACION,
      [orden(), orden({ status: "cancelada", amount: 9999, installerAmount: 9999, finalizedAt: null })],
      [],
      HOY,
    );
    expect(result.revenue).toBe(1000);
    expect(result.committedCost).toBe(400);
    expect(result.orders.total).toBe(1);
  });

  it("con cobro por proyecto reconoce la parte proporcional a lo terminado", () => {
    const result = buildProjectPerformance(
      { billingMode: "project", contractAmount: 1000, currency: "ARS" },
      [
        orden({ amount: null }),
        orden({ status: "pendiente", amount: null, finalizedAt: null }),
      ],
      [],
      HOY,
    );
    // Mitad de las órdenes terminadas → mitad del contrato reconocida.
    expect(result.revenue).toBe(500);
    expect(result.budget).toBe(1000);
    expect(result.budgetUsedPct).toBe(50);
  });

  it("avisa cuando no hay ningún costo cargado en vez de mostrar margen falso", () => {
    const result = buildProjectPerformance(
      POR_INSTALACION,
      [orden({ installerAmount: null })],
      [],
      HOY,
    );
    expect(result.costMissing).toBe(true);
    // El margen daría 100% y sería mentira: no es que no se pague nada, es que
    // todavía no se cargó cuánto.
    expect(result.installerCost).toBe(0);
  });

  it("resume las incidencias y destaca las críticas", () => {
    const result = buildProjectPerformance(
      POR_INSTALACION,
      [orden()],
      [
        { status: "open", severity: "critical" },
        { status: "open", severity: "low" },
        { status: "resolved", severity: "high" },
      ],
      HOY,
    );
    expect(result.incidents).toMatchObject({ total: 3, open: 2, critical: 1 });
  });

  it("sin ingreso no inventa un margen", () => {
    const result = buildProjectPerformance(
      POR_INSTALACION,
      [orden({ status: "pendiente", finalizedAt: null })],
      [],
      HOY,
    );
    expect(result.marginPct).toBeNull();
  });
});

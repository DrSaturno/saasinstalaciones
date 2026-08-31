import type { IncidentSeverity, OrderCurrency, OrderStatus } from "@/types/database";

/**
 * Cómo le fue a un proyecto: no sólo cuánto entró, sino cuánto costó
 * ejecutarlo, con qué gente y con cuántos problemas.
 *
 * Vive aparte de `lib/domain/finance.ts` porque contesta otra pregunta: aquel
 * compara proyectos entre sí para la pantalla de finanzas; éste abre uno solo.
 */
export type PerformanceOrder = {
  status: OrderStatus;
  amount: number | null;
  installerAmount: number | null;
  installerId: string | null;
  scheduledEndDate: string | null;
  finalizedAt: string | null;
};

export type PerformanceIncident = {
  status: "open" | "resolved";
  severity: IncidentSeverity;
};

export type ProjectPerformance = {
  currency: OrderCurrency;
  /** Ingreso de las órdenes ya terminadas. */
  revenue: number;
  /** Lo que se le paga al instalador por esas mismas órdenes terminadas. */
  installerCost: number;
  /** Ingreso menos costo, sobre lo terminado. */
  profit: number;
  /** Porcentaje de ganancia sobre el ingreso; `null` si todavía no hay ingreso. */
  marginPct: number | null;
  /** Lo comprometido con los instaladores por TODO el proyecto, no sólo lo hecho. */
  committedCost: number;
  budget: number;
  /** Cuánto del presupuesto se realizó; `null` si no hay presupuesto cargado. */
  budgetUsedPct: number | null;
  orders: { total: number; done: number; open: number; delayed: number };
  installers: number;
  incidents: { total: number; open: number; critical: number };
  /** `true` cuando no hay ningún costo cargado: sin eso no hay margen que mostrar. */
  costMissing: boolean;
};

export function buildProjectPerformance(
  project: { billingMode: "project" | "per_installation"; contractAmount: number | null; currency: OrderCurrency },
  orders: PerformanceOrder[],
  incidents: PerformanceIncident[],
  today: string,
): ProjectPerformance {
  // Una orden cancelada no suma ni resta: no se hizo ni se va a hacer.
  const live = orders.filter((order) => order.status !== "cancelada");
  const done = live.filter((order) => order.status === "finalizada");

  const revenue =
    project.billingMode === "project"
      ? // Con cobro por proyecto no hay importe por orden: se reconoce la parte
        // proporcional a lo que ya se terminó.
        live.length
        ? (Number(project.contractAmount ?? 0) / live.length) * done.length
        : 0
      : done.reduce((sum, order) => sum + Number(order.amount ?? 0), 0);

  const installerCost = done.reduce((sum, order) => sum + Number(order.installerAmount ?? 0), 0);
  const committedCost = live.reduce((sum, order) => sum + Number(order.installerAmount ?? 0), 0);
  const profit = revenue - installerCost;

  const budget =
    project.billingMode === "project"
      ? Number(project.contractAmount ?? 0)
      : live.reduce((sum, order) => sum + Number(order.amount ?? 0), 0);

  // Una orden está demorada si su fecha de fin comprometida ya pasó y todavía
  // no se terminó. La fecha vive en la orden, no en el proyecto: un proyecto
  // en fecha puede tener trabajos colgados.
  const delayed = live.filter(
    (order) =>
      order.status !== "finalizada" &&
      order.scheduledEndDate !== null &&
      order.scheduledEndDate < today,
  ).length;

  const installers = new Set(
    live.map((order) => order.installerId).filter((id): id is string => id !== null),
  ).size;

  return {
    currency: project.currency,
    revenue,
    installerCost,
    profit,
    marginPct: revenue > 0 ? Math.round((profit / revenue) * 100) : null,
    committedCost,
    budget,
    budgetUsedPct: budget > 0 ? Math.round((revenue / budget) * 100) : null,
    orders: {
      total: live.length,
      done: done.length,
      open: live.length - done.length,
      delayed,
    },
    installers,
    incidents: {
      total: incidents.length,
      open: incidents.filter((incident) => incident.status === "open").length,
      critical: incidents.filter((incident) => incident.severity === "critical").length,
    },
    costMissing: committedCost === 0,
  };
}

import { nextFinanceWeekday } from "@/lib/domain/finance-forecast";

/**
 * Circuito semanal de pagos (docs/specs/2026-11-13-finanzas-flujo-semanal).
 * Funciones puras: las usan la pantalla de aprobación, el detalle del pago, el
 * Resumen y el aviso del domingo, para que todos cuenten lo mismo.
 */

/** Mismo criterio que `finance_entry_requires_invoice` en la base. */
const INVOICE_CATEGORIES = new Set(["installation", "coordination", "logistics", "service"]);

export function financeRequiresInvoice(direction: string, category: string): boolean {
  return direction === "payable" && INVOICE_CATEGORIES.has(category);
}

/**
 * Etapa visible de un pago o cobro. La base guarda cuatro estados; la pantalla
 * muestra cinco, porque «aprobado» esconde dos situaciones muy distintas para
 * quien paga: falta la factura del proveedor, o ya se puede pagar.
 */
export type FinanceStage = "review" | "awaitingInvoice" | "ready" | "settled" | "void";

export function financeStage(
  entry: { direction: string; category: string; status: string },
  hasInvoice: boolean,
): FinanceStage {
  if (entry.status === "review") return "review";
  if (entry.status === "settled") return "settled";
  if (entry.status === "void") return "void";
  return financeRequiresInvoice(entry.direction, entry.category) && !hasInvoice ? "awaitingInvoice" : "ready";
}

/**
 * Un pago o un cobro de una OT que todavía no se terminó: no está para que el
 * dueño lo decida ni para pagarse o cobrarse, así que no se muestra en Pagos ni
 * en Cobros, y no se puede aprobar. Aparece solo cuando la orden se finaliza en
 * Operaciones. El anticipo es la excepción: se aprueba y se paga antes de
 * terminar el trabajo. Lo que ya está aprobado o saldado se ve siempre: tiene
 * historia de plata y no se puede esconder.
 */
export function financeWaitsForOrder(
  entry: { direction: string; status: string; order_id: string | null; installment?: string | null },
  finishedOrderIds: ReadonlySet<string>,
): boolean {
  return (entry.direction === "payable" || entry.direction === "receivable") && entry.status === "review" && !!entry.order_id
    && entry.installment !== "advance" && !finishedOrderIds.has(entry.order_id);
}

export type FinanceZoneKey = "amba" | "interior" | "general";

/** AMBA, interior o «general» (gastos sin OT: fijos, sueldos, otros). */
export function financeZoneKey(entry: { zone: string | null; order_id?: string | null }): FinanceZoneKey {
  if (entry.zone === "amba") return "amba";
  if (entry.zone === "interior") return "interior";
  return "general";
}

/** Suma en centavos por moneda: nunca se mezclan monedas ni se arrastran decimales. */
export function sumByCurrency<T>(rows: T[], amount: (row: T) => number, currency: (row: T) => string) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(currency(row), (totals.get(currency(row)) ?? 0) + Math.round(amount(row) * 100));
  }
  return [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([code, cents]) => ({ currency: code, amount: cents / 100 }));
}

export function groupByZone<T extends { zone: string | null }>(rows: T[]): Record<FinanceZoneKey, T[]> {
  const groups: Record<FinanceZoneKey, T[]> = { amba: [], interior: [], general: [] };
  for (const row of rows) groups[financeZoneKey(row)].push(row);
  return groups;
}

// ---------------------------------------------------------------------------
// Aviso del domingo
// ---------------------------------------------------------------------------

/** Una fila del `payload.entries` que devuelve `finance_weekly_digest()`. */
export type DigestEntry = {
  id: string;
  status: "review" | "approved";
  zone: string | null;
  category: string;
  party: string;
  party_kind: string;
  order_number: string | null;
  site: string | null;
  city: string | null;
  description: string;
  amount: number;
  currency: string;
  due_on: string | null;
  order_finished: boolean;
  requires_invoice: boolean;
  has_invoice: boolean;
};

export type DigestPayload = {
  today: string;
  amba_weekday: number;
  interior_weekday: number;
  entries: DigestEntry[];
};

export type DigestTotals = { currency: string; amount: number }[];

export type WeeklyDigest = {
  today: string;
  /** Lo que el dueño tiene que aprobar: sólo OTs terminadas y gastos sin OT. */
  toApprove: Record<FinanceZoneKey, DigestEntry[]>;
  toApproveTotals: Record<FinanceZoneKey, DigestTotals>;
  toApproveCount: number;
  /** Pagos de OTs que todavía no terminaron: se informan, no se aprueban. */
  notFinishedCount: number;
  /** Día de pago de cada zona, con lo listo y lo que espera factura. */
  paydays: {
    zone: "amba" | "interior";
    date: string;
    ready: DigestEntry[];
    readyTotals: DigestTotals;
    awaitingInvoice: DigestEntry[];
    awaitingInvoiceTotals: DigestTotals;
  }[];
  /** Gastos sin OT ya aprobados y pendientes de pago (fijos, sueldos, otros). */
  generalReady: DigestEntry[];
  generalReadyTotals: DigestTotals;
  isEmpty: boolean;
};

const totals = (rows: DigestEntry[]) => sumByCurrency(rows, (row) => row.amount, (row) => row.currency);

/**
 * Ordena todo lo abierto de una empresa en lo que hay que decidir esta semana.
 * «Listo para pagar» es aprobado y, si corresponde, con factura: sin factura no
 * entra en el total del día (D12), se muestra aparte.
 */
export function buildWeeklyDigest(payload: DigestPayload): WeeklyDigest {
  const review = payload.entries.filter((entry) => entry.status === "review" && entry.amount > 0);
  const approvable = review.filter((entry) => entry.order_finished);
  const toApprove = groupByZone(approvable);
  const approved = payload.entries.filter((entry) => entry.status === "approved" && entry.amount > 0);
  const isReady = (entry: DigestEntry) => !entry.requires_invoice || entry.has_invoice;

  const paydays = (["amba", "interior"] as const).map((zone) => {
    const weekday = zone === "amba" ? payload.amba_weekday : payload.interior_weekday;
    // El aviso sale el domingo: el «próximo» lunes o martes es el de esta semana.
    const date = nextFinanceWeekday(payload.today, weekday);
    const inZone = approved.filter((entry) => entry.zone === zone);
    const ready = inZone.filter((entry) => isReady(entry) && (!entry.due_on || entry.due_on <= date));
    const awaitingInvoice = inZone.filter((entry) => !isReady(entry));
    return { zone, date, ready, readyTotals: totals(ready), awaitingInvoice, awaitingInvoiceTotals: totals(awaitingInvoice) };
  });
  const generalReady = approved.filter((entry) => financeZoneKey(entry) === "general" && isReady(entry));

  return {
    today: payload.today,
    toApprove,
    toApproveTotals: { amba: totals(toApprove.amba), interior: totals(toApprove.interior), general: totals(toApprove.general) },
    toApproveCount: approvable.length,
    notFinishedCount: review.length - approvable.length,
    paydays,
    generalReady,
    generalReadyTotals: totals(generalReady),
    isEmpty: approvable.length === 0 && approved.length === 0,
  };
}

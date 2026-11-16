import { addFinanceDays } from "@/lib/domain/finance-forecast";

/**
 * Números del negocio para el Resumen (FLX-60, D13). Funciones puras sobre lo
 * que ya carga el módulo; no hay consulta nueva.
 *
 * Dos miradas que NO se mezclan:
 *   - Caja: lo que efectivamente entró y salió (movimientos confirmados).
 *   - Resultado: lo facturable menos lo que cuesta (obligaciones, pagadas o no).
 * Todos los importes son sin IVA (D4) y por moneda: nunca se suman monedas.
 */

export type InsightEntry = {
  id: string;
  direction: string;
  status: string;
  category: string;
  amount: number;
  open_amount: number;
  paid_amount: number;
  currency: string;
  due_on: string | null;
  period_month: string | null;
  projectId: string | null;
};
export type InsightTransaction = { entry_id: string; amount: number; occurred_on: string };
export type InsightProject = { id: string; name: string; client_id: string | null };
export type InsightClient = { id: string; name: string };

export type FinanceInsightsInput = {
  entries: InsightEntry[];
  transactions: InsightTransaction[];
  projects: InsightProject[];
  clients: InsightClient[];
};

type Flow = { income: number; expense: number; net: number };
export type ProfitRow = { id: string; name: string; income: number; cost: number; profit: number; margin: number | null };

export type CurrencyInsights = {
  currency: string;
  /** Caja del mes en curso y del anterior. */
  month: Flow;
  previousMonth: Flow;
  /** Caja prevista para las próximas cuatro semanas (lunes a domingo), según vencimientos. */
  weeks: (Flow & { from: string; to: string })[];
  /** Resultado acumulado: todo lo facturable menos todo lo que cuesta. */
  accumulated: { income: number; cost: number; profit: number; margin: number | null };
  projects: ProfitRow[];
  clients: ProfitRow[];
  /** Lo que deben los clientes, por antigüedad del vencimiento. */
  aging: { current: number; days30: number; days60: number; older: number; undated: number; total: number };
  /** Gastos fijos y sueldos del mes. */
  fixed: { total: number; paid: number; remaining: number; count: number };
};

const cents = (value: number) => Math.round(value * 100);
const fromCents = (value: number) => value / 100;
const margin = (income: number, profit: number) => (income > 0 ? Math.round((profit / income) * 1000) / 10 : null);
const FIXED_CATEGORIES = new Set(["fixed", "payroll"]);

function monthStart(date: string): string { return `${date.slice(0, 7)}-01`; }
function shiftMonth(start: string, months: number): string {
  const date = new Date(`${start}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}
/** Lunes de la semana de `date` (semana de lunes a domingo, como el resto del módulo). */
function weekStart(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
  return addFinanceDays(date, 1 - day);
}
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
}

export function buildFinanceInsights(input: FinanceInsightsInput, today: string): CurrencyInsights[] {
  const entries = input.entries.filter((entry) => entry.status !== "void");
  const byId = new Map(input.entries.map((entry) => [entry.id, entry]));
  const projectById = new Map(input.projects.map((project) => [project.id, project]));
  const clientNames = new Map(input.clients.map((client) => [client.id, client.name]));
  const thisMonth = monthStart(today), nextMonth = shiftMonth(thisMonth, 1), lastMonth = shiftMonth(thisMonth, -1);
  const firstWeek = weekStart(today);
  const currencies = [...new Set(entries.map((entry) => entry.currency))].sort();

  return currencies.map((currency) => {
    const rows = entries.filter((entry) => entry.currency === currency);
    const cash = (from: string, to: string): Flow => {
      let income = 0, expense = 0;
      for (const tx of input.transactions) {
        const entry = byId.get(tx.entry_id);
        if (!entry || entry.currency !== currency || tx.occurred_on < from || tx.occurred_on >= to) continue;
        if (entry.direction === "receivable") income += cents(tx.amount); else expense += cents(tx.amount);
      }
      return { income: fromCents(income), expense: fromCents(expense), net: fromCents(income - expense) };
    };

    const weeks = [0, 1, 2, 3].map((index) => {
      const from = addFinanceDays(firstWeek, index * 7), to = addFinanceDays(from, 6);
      let income = 0, expense = 0;
      for (const entry of rows) {
        if (!entry.due_on || entry.open_amount <= 0) continue;
        // Lo vencido y todavía abierto se espera en la semana en curso.
        const due = index === 0 && entry.due_on < from ? from : entry.due_on;
        if (due < from || due > to) continue;
        if (entry.direction === "receivable") income += cents(entry.open_amount); else expense += cents(entry.open_amount);
      }
      return { from, to, income: fromCents(income), expense: fromCents(expense), net: fromCents(income - expense) };
    });

    const totals = (list: InsightEntry[]) => {
      let income = 0, cost = 0;
      for (const entry of list) { if (entry.direction === "receivable") income += cents(entry.amount); else cost += cents(entry.amount); }
      return { income: fromCents(income), cost: fromCents(cost), profit: fromCents(income - cost), margin: margin(income, income - cost) };
    };
    const accumulated = totals(rows);

    const projectGroups = new Map<string, InsightEntry[]>();
    for (const entry of rows) {
      if (!entry.projectId) continue;
      projectGroups.set(entry.projectId, [...(projectGroups.get(entry.projectId) ?? []), entry]);
    }
    const projects: ProfitRow[] = [...projectGroups].map(([id, list]) => ({
      id, name: projectById.get(id)?.name ?? "—", ...totals(list),
    })).sort((a, b) => b.profit - a.profit || a.name.localeCompare(b.name));

    const clientGroups = new Map<string, InsightEntry[]>();
    for (const [projectId, list] of projectGroups) {
      const clientId = projectById.get(projectId)?.client_id;
      if (!clientId) continue;
      clientGroups.set(clientId, [...(clientGroups.get(clientId) ?? []), ...list]);
    }
    const clients: ProfitRow[] = [...clientGroups].map(([id, list]) => ({
      id, name: clientNames.get(id) ?? "—", ...totals(list),
    })).sort((a, b) => b.profit - a.profit || a.name.localeCompare(b.name));

    const aging = { current: 0, days30: 0, days60: 0, older: 0, undated: 0, total: 0 };
    for (const entry of rows) {
      if (entry.direction !== "receivable" || entry.open_amount <= 0) continue;
      const value = cents(entry.open_amount);
      aging.total += value;
      if (!entry.due_on) { aging.undated += value; continue; }
      const overdue = daysBetween(entry.due_on, today);
      if (overdue <= 0) aging.current += value;
      else if (overdue <= 30) aging.days30 += value;
      else if (overdue <= 60) aging.days60 += value;
      else aging.older += value;
    }

    let fixedTotal = 0, fixedPaid = 0, fixedCount = 0;
    for (const entry of rows) {
      if (entry.direction !== "payable" || !FIXED_CATEGORIES.has(entry.category)) continue;
      const inMonth = entry.period_month
        ? entry.period_month >= thisMonth && entry.period_month < nextMonth
        : Boolean(entry.due_on && entry.due_on >= thisMonth && entry.due_on < nextMonth);
      if (!inMonth) continue;
      fixedTotal += cents(entry.amount); fixedPaid += Math.min(cents(entry.paid_amount), cents(entry.amount)); fixedCount++;
    }

    return {
      currency,
      month: cash(thisMonth, nextMonth),
      previousMonth: cash(lastMonth, thisMonth),
      weeks,
      accumulated,
      projects,
      clients,
      aging: {
        current: fromCents(aging.current), days30: fromCents(aging.days30), days60: fromCents(aging.days60),
        older: fromCents(aging.older), undated: fromCents(aging.undated), total: fromCents(aging.total),
      },
      fixed: { total: fromCents(fixedTotal), paid: fromCents(fixedPaid), remaining: fromCents(fixedTotal - fixedPaid), count: fixedCount },
    };
  });
}

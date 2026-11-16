import { describe, expect, it } from "vitest";
import { buildFinanceInsights, type InsightEntry } from "@/lib/domain/finance-insights";

const entry = (over: Partial<InsightEntry>): InsightEntry => ({
  id: "e", direction: "payable", status: "approved", category: "installation", amount: 100, open_amount: 100,
  paid_amount: 0, currency: "ARS", due_on: null, period_month: null, projectId: null, ...over,
});
// 2026-11-13 es viernes: la semana en curso va del lunes 9 al domingo 15.
const today = "2026-11-13";
const projects = [{ id: "p1", name: "Proyecto Uno", client_id: "c1" }, { id: "p2", name: "Proyecto Dos", client_id: "c1" }];
const clients = [{ id: "c1", name: "Cliente" }];

describe("números del negocio", () => {
  it("resultado por proyecto, por cliente y general, con su porcentaje", () => {
    const [ars] = buildFinanceInsights({
      projects, clients, transactions: [],
      entries: [
        entry({ id: "r1", direction: "receivable", amount: 1000, open_amount: 1000, projectId: "p1" }),
        entry({ id: "c1", amount: 600, projectId: "p1" }),
        entry({ id: "r2", direction: "receivable", amount: 500, open_amount: 500, projectId: "p2" }),
        entry({ id: "c2", amount: 700, projectId: "p2" }),
        entry({ id: "g", category: "fixed", amount: 100 }),
        entry({ id: "v", status: "void", amount: 9999, projectId: "p1" }),
      ],
    }, today);
    expect(ars.projects.map((p) => [p.name, p.profit, p.margin])).toEqual([
      ["Proyecto Uno", 400, 40], ["Proyecto Dos", -200, -40]]);
    expect(ars.clients).toEqual([{ id: "c1", name: "Cliente", income: 1500, cost: 1300, profit: 200, margin: 13.3 }]);
    // El general incluye el gasto fijo, que no es de ningún proyecto.
    expect(ars.accumulated).toEqual({ income: 1500, cost: 1400, profit: 100, margin: 6.7 });
  });

  it("caja del mes y del anterior: sólo movimientos confirmados", () => {
    const [ars] = buildFinanceInsights({
      projects: [], clients: [],
      entries: [entry({ id: "r", direction: "receivable" }), entry({ id: "p" })],
      transactions: [
        { entry_id: "r", amount: 800, occurred_on: "2026-11-02" },
        { entry_id: "p", amount: 300, occurred_on: "2026-11-10" },
        { entry_id: "p", amount: 50, occurred_on: "2026-10-31" },
        { entry_id: "r", amount: 999, occurred_on: "2026-12-01" },
      ],
    }, today);
    expect(ars.month).toEqual({ income: 800, expense: 300, net: 500 });
    expect(ars.previousMonth).toEqual({ income: 0, expense: 50, net: -50 });
  });

  it("previsión semanal: lo vencido cae en la semana en curso", () => {
    const [ars] = buildFinanceInsights({
      projects: [], clients: [], transactions: [],
      entries: [
        entry({ id: "a", open_amount: 100, due_on: "2026-11-01" }),
        entry({ id: "b", open_amount: 200, due_on: "2026-11-16" }),
        entry({ id: "c", direction: "receivable", open_amount: 900, due_on: "2026-11-17" }),
        entry({ id: "d", open_amount: 0, due_on: "2026-11-16" }),
      ],
    }, today);
    expect(ars.weeks.map((week) => [week.from, week.income, week.expense])).toEqual([
      ["2026-11-09", 0, 100], ["2026-11-16", 900, 200], ["2026-11-23", 0, 0], ["2026-11-30", 0, 0]]);
  });

  it("antigüedad de la cobranza por tramos", () => {
    const due = (id: string, date: string | null, amount: number) =>
      entry({ id, direction: "receivable", open_amount: amount, amount, due_on: date });
    const [ars] = buildFinanceInsights({
      projects: [], clients: [], transactions: [],
      entries: [due("a", "2026-11-20", 10), due("b", "2026-11-01", 20), due("c", "2026-09-20", 30), due("d", "2026-08-01", 40), due("e", null, 50)],
    }, today);
    expect(ars.aging).toEqual({ current: 10, days30: 20, days60: 30, older: 40, undated: 50, total: 150 });
  });

  it("gastos fijos y sueldos del mes: total, pagado y lo que falta", () => {
    const [ars] = buildFinanceInsights({
      projects: [], clients: [], transactions: [],
      entries: [
        entry({ id: "a", category: "fixed", amount: 1000, paid_amount: 400, period_month: "2026-11-01" }),
        entry({ id: "b", category: "payroll", amount: 500, paid_amount: 500, due_on: "2026-11-05" }),
        entry({ id: "c", category: "fixed", amount: 700, period_month: "2026-12-01" }),
        entry({ id: "d", category: "installation", amount: 300, due_on: "2026-11-05" }),
      ],
    }, today);
    expect(ars.fixed).toEqual({ total: 1500, paid: 900, remaining: 600, count: 2 });
  });

  it("no mezcla monedas", () => {
    const result = buildFinanceInsights({
      projects: [], clients: [], transactions: [],
      entries: [entry({ id: "a", currency: "ARS" }), entry({ id: "b", currency: "BRL", amount: 7 })],
    }, today);
    expect(result.map((row) => [row.currency, row.accumulated.cost])).toEqual([["ARS", 100], ["BRL", 7]]);
  });
});

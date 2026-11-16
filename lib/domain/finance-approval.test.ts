import { describe, expect, it } from "vitest";
import {
  buildWeeklyDigest,
  financeRequiresInvoice,
  financeStage,
  financeWaitsForOrder,
  groupByZone,
  sumByCurrency,
  type DigestEntry,
} from "@/lib/domain/finance-approval";

const entry = (over: Partial<DigestEntry>): DigestEntry => ({
  id: "e", status: "review", zone: "amba", category: "installation", party: "Ana", party_kind: "installer",
  order_number: "OT-1", site: "Local", city: "Quilmes", description: "", amount: 100, currency: "ARS",
  due_on: null, order_finished: true, requires_invoice: true, has_invoice: false, ...over,
});

describe("etapa visible de un pago", () => {
  it("la factura sólo se exige a instaladores, coordinadores, logística y servicios", () => {
    expect(financeRequiresInvoice("payable", "installation")).toBe(true);
    expect(financeRequiresInvoice("payable", "coordination")).toBe(true);
    expect(financeRequiresInvoice("payable", "fixed")).toBe(false);
    expect(financeRequiresInvoice("payable", "payroll")).toBe(false);
    expect(financeRequiresInvoice("receivable", "installation")).toBe(false);
  });
  it("un aprobado sin factura no está listo para pagar; un gasto fijo sí", () => {
    const pay = { direction: "payable", category: "installation", status: "approved" };
    expect(financeStage(pay, false)).toBe("awaitingInvoice");
    expect(financeStage(pay, true)).toBe("ready");
    expect(financeStage({ ...pay, category: "fixed" }, false)).toBe("ready");
    expect(financeStage({ ...pay, status: "review" }, true)).toBe("review");
    expect(financeStage({ ...pay, status: "settled" }, false)).toBe("settled");
  });
  it("el pago de una OT sin terminar espera la orden; el anticipo, los gastos sin OT y lo ya aprobado no", () => {
    const finished = new Set(["ot-terminada"]);
    const pay = { direction: "payable", status: "review", order_id: "ot-abierta", installment: "balance" };
    expect(financeWaitsForOrder(pay, finished)).toBe(true);
    expect(financeWaitsForOrder({ ...pay, order_id: "ot-terminada" }, finished)).toBe(false);
    expect(financeWaitsForOrder({ ...pay, installment: "advance" }, finished)).toBe(false);
    expect(financeWaitsForOrder({ ...pay, order_id: null }, finished)).toBe(false);
    expect(financeWaitsForOrder({ ...pay, status: "approved" }, finished)).toBe(false);
    expect(financeWaitsForOrder({ ...pay, direction: "receivable" }, finished)).toBe(false);
  });
});

describe("agrupado y totales", () => {
  it("separa AMBA, interior y gastos sin OT", () => {
    const groups = groupByZone([{ zone: "amba" }, { zone: "interior" }, { zone: null }, { zone: "amba" }]);
    expect([groups.amba.length, groups.interior.length, groups.general.length]).toEqual([2, 1, 1]);
  });
  it("suma por moneda sin arrastrar decimales", () => {
    const rows = [{ a: 0.1, c: "ARS" }, { a: 0.2, c: "ARS" }, { a: 5, c: "BRL" }];
    expect(sumByCurrency(rows, (r) => r.a, (r) => r.c)).toEqual([
      { currency: "ARS", amount: 0.3 }, { currency: "BRL", amount: 5 }]);
  });
});

describe("aviso del domingo", () => {
  // 2026-11-15 es domingo: lunes 16 (AMBA), martes 17 (interior).
  const base = { today: "2026-11-15", amba_weekday: 1, interior_weekday: 2 };

  it("pide aprobar sólo OTs terminadas, separadas por zona, y cuenta las que no", () => {
    const digest = buildWeeklyDigest({ ...base, entries: [
      entry({ id: "a", zone: "amba", amount: 100 }),
      entry({ id: "b", zone: "interior", amount: 300 }),
      entry({ id: "c", zone: "interior", amount: 50, order_finished: false }),
      entry({ id: "d", zone: null, category: "fixed", requires_invoice: false, amount: 900, order_number: null }),
    ] });
    expect(digest.toApprove.amba.map((e) => e.id)).toEqual(["a"]);
    expect(digest.toApprove.interior.map((e) => e.id)).toEqual(["b"]);
    expect(digest.toApprove.general.map((e) => e.id)).toEqual(["d"]);
    expect(digest.toApproveTotals.interior).toEqual([{ currency: "ARS", amount: 300 }]);
    expect(digest.toApproveCount).toBe(3);
    expect(digest.notFinishedCount).toBe(1);
  });

  it("el total del lunes y del martes sólo cuenta lo que tiene factura", () => {
    const digest = buildWeeklyDigest({ ...base, entries: [
      entry({ id: "a", status: "approved", zone: "amba", amount: 100, has_invoice: true, due_on: "2026-11-16" }),
      entry({ id: "b", status: "approved", zone: "amba", amount: 70, has_invoice: false }),
      entry({ id: "c", status: "approved", zone: "interior", amount: 300, has_invoice: true, due_on: "2026-11-10" }),
      entry({ id: "d", status: "approved", zone: "amba", amount: 40, has_invoice: true, due_on: "2026-11-23" }),
    ] });
    const [amba, interior] = digest.paydays;
    expect([amba.date, interior.date]).toEqual(["2026-11-16", "2026-11-17"]);
    expect(amba.readyTotals).toEqual([{ currency: "ARS", amount: 100 }]);
    expect(amba.awaitingInvoiceTotals).toEqual([{ currency: "ARS", amount: 70 }]);
    expect(interior.readyTotals).toEqual([{ currency: "ARS", amount: 300 }]);
  });

  it("un gasto fijo aprobado queda listo sin factura", () => {
    const digest = buildWeeklyDigest({ ...base, entries: [
      entry({ status: "approved", zone: null, category: "fixed", requires_invoice: false, amount: 900 }),
    ] });
    expect(digest.generalReadyTotals).toEqual([{ currency: "ARS", amount: 900 }]);
    expect(digest.isEmpty).toBe(false);
  });

  it("sin nada abierto, el aviso está vacío", () => {
    expect(buildWeeklyDigest({ ...base, entries: [] }).isEmpty).toBe(true);
  });
});

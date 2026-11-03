import { describe, expect, it } from "vitest";
import { cents, chequeMaturity, entryBalance, financePeriodRange, suggestChequeAllocations } from "@/lib/domain/finance-ledger";

describe("agreed finance rules", () => {
  it("assigns one cheque proportionally to outstanding balances", () => {
    expect(suggestChequeAllocations(50000000, [
      { id: "a", amount: 60000000, paid: 0, reserved: 0 },
      { id: "b", amount: 40000000, paid: 0, reserved: 0 },
    ]).allocations).toEqual([{ entry_id: "a", amount: 300000 }, { entry_id: "b", amount: 200000 }]);
  });
  it("subtracts confirmed payments and pending cheques before suggesting", () => {
    expect(suggestChequeAllocations(30000, [
      { id: "a", amount: 100000, paid: 40000, reserved: 40000 },
      { id: "b", amount: 100000, paid: 0, reserved: 90000 },
    ]).allocations).toEqual([{ entry_id: "a", amount: 200 }, { entry_id: "b", amount: 100 }]);
  });
  it("keeps cents exact and deterministic after input reorder", () => {
    const input = ["c", "b", "a"].map((id) => ({ id, amount: 100, paid: 0, reserved: 0 }));
    expect(suggestChequeAllocations(2, input).allocations).toEqual([{ entry_id: "a", amount: .01 }, { entry_id: "b", amount: .01 }]);
    expect(suggestChequeAllocations(2, input.reverse())).toEqual(suggestChequeAllocations(2, input));
  });
  it("blocks excess rather than allocating more than available", () => {
    expect(suggestChequeAllocations(101, [{ id: "a", amount: 100, paid: 0, reserved: 0 }])).toEqual({ allocations: [], excess: 1 });
    expect(() => suggestChequeAllocations(0, [])).toThrow();
  });
  it("recalculates partial debt and exposes credit after an OT reduction", () => {
    expect(entryBalance(120000, 30000)).toEqual({ pending: 90000, credit: 0, available: 90000 });
    expect(entryBalance(20000, 30000)).toEqual({ pending: 0, credit: 10000, available: 0 });
  });
  it("accepts only exact cents at monetary boundaries", () => {
    expect(cents("123456789.01")).toBe(12345678901);
    for (const input of ["1.001", "-1", "1e3", "NaN"]) expect(() => cents(input)).toThrow();
  });
  it("uses calendar days across month, leap year and year boundaries", () => {
    expect(chequeMaturity("2028-01-31", 30)).toBe("2028-03-01");
    expect(chequeMaturity("2026-12-01", 60)).toBe("2027-01-30");
  });
  it("uses calendar half months, Monday weeks and inclusive custom ranges", () => {
    expect(financePeriodRange("2026-10-27", "week")).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(financePeriodRange("2028-02-16", "fortnight")).toEqual({ from: "2028-02-16", to: "2028-02-29" });
    expect(financePeriodRange("2026-10-27", "semester")).toEqual({ from: "2026-07-01", to: "2026-12-31" });
    expect(() => financePeriodRange("2026-10-27", "custom", "2026-10-30", "2026-10-01")).toThrow();
  });
});

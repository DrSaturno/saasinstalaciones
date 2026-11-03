import { describe, expect, it } from "vitest";
import { buildFinanceDemo } from "./finance-demo";
import { buildFinanceForecast, nextFinanceWeekday } from "./finance-forecast";
import { financeDemoOpenAmount } from "./finance-demo-transactions";

describe("finance forecast", () => {
  it("moves both payment days to the following week when completion falls on the payment day", () => {
    expect(nextFinanceWeekday("2026-09-28", 1)).toBe("2026-10-05");
    expect(nextFinanceWeekday("2026-09-29", 2)).toBe("2026-10-06");
  });

  it("keeps AMBA and Interior apart and excludes unreviewed historical costs", () => {
    const data = buildFinanceDemo("2026-09-25", {});
    const result = buildFinanceForecast(data.overview, "2026-09-25");
    expect(result.forecast.get("2026-09-28|amba|ARS")).toBe(162000);
    expect(result.forecast.get("2026-09-29|interior|ARS")).toBe(285000);
    expect(result.fixed.get("ARS")).toBe(310000);
    expect(result.unscheduled).toBe(1);
    expect(result.importedReview).toBe(1);
    expect([...result.forecast.values()].reduce((a, b) => a + b, 0)).toBe(815000);
  });

  it("filters demo cash movements without changing the forecast source", () => {
    const data = buildFinanceDemo("2026-09-25", { status: "settled", direction: "payable" });
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].installment).toBe("advance");
    expect(data.overview).toHaveLength(7);
  });

  it("deducts partial payments in cents and closes only the fully covered obligation", () => {
    const data = buildFinanceDemo("2026-09-25", {});
    const entry = data.entries[0];
    expect(financeDemoOpenAmount(entry, [{ id: "a", entryId: entry.id, amount: 50000.25,
      occurredOn: "2026-09-25", method: "transfer", proofName: "proof.pdf" }])).toBe(77999.75);
    expect(financeDemoOpenAmount(entry, [
      { id: "a", entryId: entry.id, amount: 50000.25, occurredOn: "2026-09-25", method: "transfer", proofName: "a.pdf" },
      { id: "b", entryId: entry.id, amount: 77999.75, occurredOn: "2026-09-25", method: "transfer", proofName: "b.pdf" },
    ])).toBe(0);
  });
});

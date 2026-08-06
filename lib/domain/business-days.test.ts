import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  businessDaysUntil,
  canCancelWithoutReview,
  isBusinessDay,
  rescheduleResponseDeadline,
} from "@/lib/domain/business-days";

describe("business-day rules", () => {
  const calendar = { holidays: new Set(["2026-08-17"]) };

  it("skips weekends and configured holidays", () => {
    expect(isBusinessDay("2026-08-15", calendar)).toBe(false);
    expect(isBusinessDay("2026-08-17", calendar)).toBe(false);
    expect(addBusinessDays("2026-08-14", 2, calendar)).toBe("2026-08-19");
  });

  it("anchors the reschedule window at the persisted notification date", () => {
    expect(rescheduleResponseDeadline({ notifiedDate: "2026-08-14", calendar })).toBe(
      "2026-08-19",
    );
  });

  it("requires two business days of notice for a common cancellation", () => {
    expect(
      canCancelWithoutReview({ requestedDate: "2026-08-12", scheduledDate: "2026-08-14" }),
    ).toBe(true);
    expect(
      canCancelWithoutReview({ requestedDate: "2026-08-13", scheduledDate: "2026-08-14" }),
    ).toBe(false);
  });

  it("returns a signed distance and rejects invalid calendar dates", () => {
    expect(businessDaysUntil("2026-08-14", "2026-08-12")).toBe(-2);
    expect(() => isBusinessDay("2026-02-30")).toThrow("invalid_date_key");
  });
});

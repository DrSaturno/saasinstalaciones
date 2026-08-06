import { describe, expect, it } from "vitest";
import {
  canConvertOpportunity,
  canTransitionOpportunity,
  opportunityConversionErrors,
  type OpportunityConversionInput,
} from "@/lib/domain/opportunities";

const ready: OpportunityConversionInput = {
  status: "client_approved",
  clientId: "client",
  locationId: "location",
  coordinatorId: "coordinator",
  selectedQuoteId: "quote",
  approvedQuoteRevisionId: "revision-2",
  selectedQuoteRevisionId: "revision-2",
  agendaDecision: "available",
};

describe("opportunity lifecycle", () => {
  it("keeps publication separate from project conversion", () => {
    expect(canTransitionOpportunity("draft", "published")).toBe(true);
    expect(canTransitionOpportunity("published", "converted")).toBe(false);
    expect(canTransitionOpportunity("client_approved", "converted")).toBe(true);
  });

  it("requires the approved exact quote revision", () => {
    expect(
      opportunityConversionErrors({ ...ready, approvedQuoteRevisionId: "revision-1" }),
    ).toContain("approved_revision_mismatch");
  });

  it("requires a coordinator and a conflict-safe agenda decision", () => {
    expect(
      opportunityConversionErrors({ ...ready, coordinatorId: null, agendaDecision: "conflict" }),
    ).toEqual(["coordinator_required", "agenda_conflict"]);
  });

  it("accepts a complete conversion or an audited agenda override", () => {
    expect(canConvertOpportunity(ready)).toBe(true);
    expect(canConvertOpportunity({ ...ready, agendaDecision: "override" })).toBe(true);
  });
});

export const OPPORTUNITY_STATUSES = [
  "draft",
  "published",
  "client_approved",
  "converted",
  "closed",
  "cancelled",
] as const;

export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

const OPPORTUNITY_TRANSITIONS: Record<OpportunityStatus, OpportunityStatus[]> = {
  draft: ["published", "cancelled"],
  published: ["client_approved", "closed", "cancelled"],
  client_approved: ["converted", "published", "cancelled"],
  converted: [],
  closed: ["published"],
  cancelled: [],
};

export function canTransitionOpportunity(
  from: OpportunityStatus,
  to: OpportunityStatus,
): boolean {
  return OPPORTUNITY_TRANSITIONS[from].includes(to);
}

export type OpportunityConversionInput = {
  status: OpportunityStatus;
  clientId: string | null;
  locationId: string | null;
  coordinatorId: string | null;
  selectedQuoteId: string | null;
  approvedQuoteRevisionId: string | null;
  selectedQuoteRevisionId: string | null;
  agendaDecision: "available" | "override" | "conflict" | "unknown";
};

export type OpportunityConversionError =
  | "opportunity_not_approved"
  | "client_required"
  | "location_required"
  | "coordinator_required"
  | "selected_quote_required"
  | "approved_revision_mismatch"
  | "agenda_conflict";

export function opportunityConversionErrors(
  input: OpportunityConversionInput,
): OpportunityConversionError[] {
  const errors: OpportunityConversionError[] = [];
  if (input.status !== "client_approved") errors.push("opportunity_not_approved");
  if (!input.clientId) errors.push("client_required");
  if (!input.locationId) errors.push("location_required");
  if (!input.coordinatorId) errors.push("coordinator_required");
  if (!input.selectedQuoteId) errors.push("selected_quote_required");
  if (
    !input.approvedQuoteRevisionId ||
    input.approvedQuoteRevisionId !== input.selectedQuoteRevisionId
  ) {
    errors.push("approved_revision_mismatch");
  }
  if (input.agendaDecision !== "available" && input.agendaDecision !== "override") {
    errors.push("agenda_conflict");
  }
  return errors;
}

export function canConvertOpportunity(input: OpportunityConversionInput): boolean {
  return opportunityConversionErrors(input).length === 0;
}

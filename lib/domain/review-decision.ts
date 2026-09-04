import type { OrderStatus } from "@/types/database";

/**
 * Las cuatro salidas que tiene el coordinador frente a una entrega
 * (`REQ-14.5`, FLD-R6).
 *
 * Sólo `approve` cierra el trabajo; las otras tres lo devuelven a
 * `en_proceso`. Lo que las distingue no es a dónde va la orden, sino **qué
 * queda registrado y qué ve el instalador**: "te faltan fotos" y "esto está
 * mal hecho" mandan a la misma pantalla y significan cosas muy distintas.
 */
export type ReviewDecision =
  | "approve"
  | "request_evidence"
  | "request_changes"
  | "reopen";

export const REVIEW_DECISIONS: ReviewDecision[] = [
  "approve",
  "request_evidence",
  "request_changes",
  "reopen",
];

/** Estado desde el que cada decisión tiene sentido. */
const VALID_FROM: Record<ReviewDecision, OrderStatus[]> = {
  approve: ["en_revision"],
  request_evidence: ["en_revision"],
  request_changes: ["en_revision"],
  // Reabrir parte de un trabajo YA aprobado: es la única que toca una orden
  // cerrada, y por eso la que más necesita motivo.
  reopen: ["finalizada"],
};

const TARGET: Record<ReviewDecision, OrderStatus> = {
  approve: "finalizada",
  request_evidence: "en_proceso",
  request_changes: "en_proceso",
  reopen: "en_proceso",
};

/**
 * Aprobar es lo único que no necesita explicación: el trabajo está bien y se
 * cierra. Las otras tres le devuelven trabajo a alguien, y un rechazo sin
 * motivo obliga al instalador a adivinar qué corregir (FLD-R6.5, AC-14-B).
 */
export function reviewNeedsReason(decision: ReviewDecision): boolean {
  return decision !== "approve";
}

export const MIN_REASON_LENGTH = 10;

export type ReviewBlock =
  | "invalidDecisionForStatus"
  | "reasonRequired"
  | "reasonTooShort";

/**
 * Devuelve por qué NO se puede aplicar la decisión, o `null` si es válida.
 *
 * Espejo de lo que valida la base. La segregación de funciones (quien ejecutó
 * no aprueba ni reabre) NO se decide acá: es de identidad, la aplica el
 * trigger, y duplicarla en el dominio invitaría a confiar en la copia.
 */
export function reviewDecisionBlock(
  decision: ReviewDecision,
  status: OrderStatus,
  reason: string | null | undefined,
): ReviewBlock | null {
  if (!VALID_FROM[decision].includes(status)) return "invalidDecisionForStatus";

  if (reviewNeedsReason(decision)) {
    const trimmed = (reason ?? "").trim();
    if (!trimmed) return "reasonRequired";
    if (trimmed.length < MIN_REASON_LENGTH) return "reasonTooShort";
  }

  return null;
}

export function reviewTargetStatus(decision: ReviewDecision): OrderStatus {
  return TARGET[decision];
}

/** Las decisiones que tiene sentido ofrecer estando en este estado. */
export function availableDecisions(status: OrderStatus): ReviewDecision[] {
  return REVIEW_DECISIONS.filter((decision) =>
    VALID_FROM[decision].includes(status),
  );
}

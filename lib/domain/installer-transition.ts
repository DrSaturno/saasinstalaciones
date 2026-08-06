import type { OrderStatus } from "@/types/database";

export type InstallerTransitionTarget = "en_proceso" | "en_revision";

const EXPECTED_SOURCE: Record<InstallerTransitionTarget, OrderStatus> = {
  en_proceso: "planificada",
  en_revision: "en_proceso",
};

export type InstallerTransitionDecision =
  | { kind: "apply"; expectedStatus: OrderStatus }
  | { kind: "already_applied" }
  | { kind: "conflict" };

/**
 * Decide si una transición encolada por un instalador sigue siendo aplicable.
 *
 * La comparación con el estado de origen evita que una operación vieja
 * reabra una orden que otra persona ya avanzó o cerró. Mantener el destino
 * como no-op conserva la idempotencia cuando se pierde la respuesta del server.
 */
export function decideInstallerTransition(
  currentStatus: OrderStatus,
  targetStatus: InstallerTransitionTarget,
): InstallerTransitionDecision {
  if (currentStatus === targetStatus) return { kind: "already_applied" };

  const expectedStatus = EXPECTED_SOURCE[targetStatus];
  if (currentStatus !== expectedStatus) return { kind: "conflict" };

  return { kind: "apply", expectedStatus };
}

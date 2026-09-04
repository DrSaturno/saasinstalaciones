import type { OrderStatus } from "@/types/database";

export type InstallerTransitionTarget =
  | "en_camino"
  | "en_sitio"
  | "en_proceso"
  | "en_revision";

/**
 * Estados desde los que cada destino es alcanzable por el instalador.
 *
 * Es una lista y no un valor único desde el punto 24: con las etapas de
 * traslado y llegada, a `en_proceso` se llega desde tres lugares distintos
 * —directo (el instalador ya estaba en el sitio), desde el traslado, o desde
 * la llegada— y todos son legítimos. Con un origen único, empezar el trabajo
 * después de marcar "llegué" quedaba como conflicto.
 */
const EXPECTED_SOURCES: Record<InstallerTransitionTarget, OrderStatus[]> = {
  en_camino: ["planificada"],
  en_sitio: ["planificada", "en_camino"],
  en_proceso: ["planificada", "en_camino", "en_sitio"],
  en_revision: ["en_proceso"],
};

export type InstallerTransitionDecision =
  | { kind: "apply"; expectedStatuses: OrderStatus[] }
  | { kind: "already_applied" }
  | { kind: "conflict" };

/**
 * Decide si una transición encolada por un instalador sigue siendo aplicable.
 *
 * La comparación con los estados de origen evita que una operación vieja
 * reabra una orden que otra persona ya avanzó o cerró: una operación "ir a
 * en_sitio" que llega tarde, cuando la orden ya está en revisión, no encuentra
 * su origen entre los esperados y da conflicto en vez de retroceder el estado.
 *
 * Mantener el destino como no-op conserva la idempotencia cuando se pierde la
 * respuesta del server.
 */
export function decideInstallerTransition(
  currentStatus: OrderStatus,
  targetStatus: InstallerTransitionTarget,
): InstallerTransitionDecision {
  if (currentStatus === targetStatus) return { kind: "already_applied" };

  const expectedStatuses = EXPECTED_SOURCES[targetStatus];
  if (!expectedStatuses.includes(currentStatus)) return { kind: "conflict" };

  return { kind: "apply", expectedStatuses };
}

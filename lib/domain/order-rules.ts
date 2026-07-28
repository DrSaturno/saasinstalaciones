import type { OrderStatus, UserRole } from "@/types/database";
import { canTransition } from "@/lib/domain/transitions";

/**
 * Reglas de negocio de la orden, espejo EXACTO del trigger
 * `validate_order_transition` (migración 20260728000006).
 *
 * ⚠️ La DB es la fuente de verdad. Esto existe para no ofrecer en pantalla
 * botones que la base va a rechazar, y para dar un motivo entendible. Si se
 * cambia una regla, hay que cambiarla en los dos lados.
 */
export type OrderRuleBlock =
  | "invalidTransition"
  | "needsInstaller"
  | "needsSurvey"
  | "needsAcceptance"
  | "needsScheduledDate"
  | "onlyInstallerStarts"
  | "onlyInstallerReviews";

export type OrderRuleContext = {
  status: OrderStatus;
  assignedInstallerId: string | null;
  acceptedAt: string | null;
  hasSurvey: boolean;
  scheduledDate: string | null;
};

export type Actor = {
  id: string;
  role: UserRole;
};

/**
 * Devuelve el motivo por el que NO se puede pasar al estado destino, o `null`
 * si la transición es válida para ese actor.
 */
export function orderTransitionBlock(
  order: OrderRuleContext,
  to: OrderStatus,
  actor: Actor,
): OrderRuleBlock | null {
  if (!canTransition(order.status, to)) return "invalidTransition";

  // Cancelar está exento: se puede cancelar una orden que nunca se asignó.
  if (
    order.status === "pendiente" &&
    to !== "cancelada" &&
    !order.assignedInstallerId
  ) {
    return "needsInstaller";
  }

  // Sin fecha comprometida no hay plan: el instalador no sabría cuándo ir.
  if (to === "planificada" && !order.scheduledDate) {
    return "needsScheduledDate";
  }

  if (order.status === "relevamiento" && to === "planificada" && !order.hasSurvey) {
    return "needsSurvey";
  }

  if (order.status === "planificada" && to === "en_proceso") {
    if (!order.acceptedAt) return "needsAcceptance";
    // Sólo quien está en el punto sabe que empezó.
    if (actor.id !== order.assignedInstallerId) return "onlyInstallerStarts";
  }

  // Mandar a revisión es potestad del instalador asignado: el coordinador
  // aprueba y la empresa es última instancia, pero ninguno de los dos "envía".
  if (to === "en_revision" && actor.id !== order.assignedInstallerId) {
    return "onlyInstallerReviews";
  }

  return null;
}

/** Estados a los que este actor puede llevar la orden ahora mismo. */
export function allowedTransitions(
  order: OrderRuleContext,
  actor: Actor,
  candidates: readonly OrderStatus[],
): OrderStatus[] {
  return candidates.filter(
    (to) => orderTransitionBlock(order, to, actor) === null,
  );
}

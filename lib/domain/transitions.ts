import type { OrderStatus } from "@/types/database";

/**
 * Transiciones permitidas de la máquina de estados de órdenes.
 *
 * ⚠️ Espejo EXACTO del trigger `validate_order_transition` en la migración
 * inicial. La DB es la fuente de verdad (regla no negociable #4): si acá
 * mostramos una transición que la DB rechaza, el usuario ve un error feo.
 * Mantener ambos sincronizados.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pendiente: ["relevamiento", "planificada", "cancelada"],
  relevamiento: ["planificada", "cancelada"],
  planificada: ["en_proceso", "cancelada"],
  en_proceso: ["en_revision"],
  en_revision: ["finalizada", "en_proceso"],
  finalizada: [],
  cancelada: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Un estado es terminal si ya no admite transiciones. */
export function isTerminal(status: OrderStatus): boolean {
  return ORDER_TRANSITIONS[status]?.length === 0;
}

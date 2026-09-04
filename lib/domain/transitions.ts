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
  // `en_proceso` sigue siendo alcanzable directo desde `planificada`
  // (DEC-24-01): las órdenes que vienen de un flujo sin etapas de traslado, la
  // proyección desde `work_activities` y el trabajo que empieza sin viaje
  // dependen de ese salto. El camino largo es el que ofrece la UI.
  planificada: ["en_camino", "en_sitio", "en_proceso", "cancelada"],
  en_camino: ["en_sitio", "en_proceso", "cancelada"],
  en_sitio: ["en_proceso", "cancelada"],
  en_proceso: ["en_revision"],
  en_revision: ["finalizada", "en_proceso"],
  // Reabrir un trabajo ya aprobado (FLD-R6.4). Hasta el punto 24 `finalizada`
  // era terminal, y por eso `isTerminal` ahora sólo vale para `cancelada`.
  finalizada: ["en_proceso"],
  cancelada: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Un estado es terminal si ya no admite transiciones. */
export function isTerminal(status: OrderStatus): boolean {
  return ORDER_TRANSITIONS[status]?.length === 0;
}

/**
 * Un estado es "cerrado" si el trabajo terminó, se haya podido reabrir o no.
 *
 * Hasta el punto 24 esto coincidía con `isTerminal`, porque `finalizada` no
 * tenía salidas. Al hacerla reabrible los dos conceptos se separaron: una
 * orden finalizada ya no es terminal (admite `en_proceso`), pero sigue sin
 * pertenecer a la lista de trabajo pendiente de nadie. Las vistas que
 * preguntan "¿esto ya está?" tienen que usar esta, no `isTerminal`.
 */
export function isClosed(status: OrderStatus): boolean {
  return status === "finalizada" || status === "cancelada";
}

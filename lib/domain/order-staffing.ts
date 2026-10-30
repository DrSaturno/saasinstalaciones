/**
 * Cuántas personas tiene una orden frente a las que necesita (bloque 5).
 *
 * El responsable sigue en `work_orders.assigned_installer_id` y los ayudantes
 * activos en `work_order_team_members`, así que el plantel es «1 + ayudantes»
 * cuando hay responsable y 0 cuando no lo hay.
 */
export type OrderStaffing = {
  /** Personas asignadas hoy (responsable + ayudantes activos). */
  assigned: number;
  required: number;
  /** Cuántas faltan; nunca negativo aunque sobre gente. */
  missing: number;
  hasLead: boolean;
  /** Sin responsable, o con menos personas de las requeridas. */
  incomplete: boolean;
};

export function orderStaffing(input: {
  assignedInstallerId: string | null;
  requiredInstallers: number;
  activeHelpers: number;
}): OrderStaffing {
  const hasLead = Boolean(input.assignedInstallerId);
  const assigned = hasLead ? 1 + Math.max(0, input.activeHelpers) : 0;
  const required = Math.max(1, input.requiredInstallers);
  const missing = Math.max(0, required - assigned);
  return { assigned, required, missing, hasLead, incomplete: missing > 0 };
}

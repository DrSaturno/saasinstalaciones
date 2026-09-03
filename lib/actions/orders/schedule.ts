import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  type AssignmentGateCode,
  ASSIGNMENT_GATE_CODES,
} from "./assignment-gate";

export type OrderScheduleInput = {
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
};

export type ScheduleGateResult = {
  available: boolean;
  code: AssignmentGateCode;
  overrideAllowed: boolean;
};

function parseGateResult(data: unknown): ScheduleGateResult | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const row = data as Record<string, unknown>;
  if (row.available === true) return null;
  const code = ASSIGNMENT_GATE_CODES.includes(row.code as AssignmentGateCode)
    ? (row.code as AssignmentGateCode)
    : "SCHEDULE_CONFLICT";
  return {
    available: false,
    code,
    overrideAllowed: row.override_allowed === true,
  };
}

/**
 * Lleva el horario cargado en el formulario de la orden a su actividad.
 *
 * **Qué actividad.** La de ejecución, que es el trabajo en sí. Si la orden es
 * sólo relevamiento, esa. Un relevamiento que acompaña a una ejecución se
 * agenda aparte a propósito: el requisito del punto 17 es explícito en que la
 * fecha del relevamiento puede quedar pendiente, y forzarle la de la ejecución
 * sería inventarle un compromiso que nadie asumió.
 *
 * **Por qué pasa por la RPC y no por un update.** `set_activity_schedule` es la
 * única puerta que puede mover un horario —el trigger de la base lo exige— y
 * es donde en la Fase 3 van a vivir los controles de solapamiento, ausencia y
 * traslado. Escribir por afuera acá sería crear justamente el llamador suelto
 * que después habría que salir a cazar.
 *
 * No corta el alta si falla: una orden creada sin horario se corrige
 * editándola, mientras que un error después de haberla escrito deja al usuario
 * sin saber si la orden existe. Mismo criterio que las condiciones y las
 * actividades.
 *
 * **Si ya hay una asignación activa, el horario nuevo pasa por el mismo gate
 * que asignar** (ausencia, solapamiento, traslado — AG-R2/AG-R4/AG-R5):
 * reprogramar no puede ser la forma de esquivar el control que asignar sí
 * respeta. Cuando el gate bloquea, el horario no se escribe y se devuelve el
 * motivo para que el llamador avise, sin cortar el resto de la operación.
 */
export async function syncActivitySchedule(
  supabase: SupabaseClient<Database>,
  orderId: string,
  input: OrderScheduleInput,
  overrideReason?: string,
): Promise<ScheduleGateResult | null> {
  const { data: activities } = await supabase
    .from("work_activities")
    .select("id, activity_type")
    .eq("work_order_id", orderId);

  if (!activities || activities.length === 0) return null;

  const target =
    activities.find((activity) => activity.activity_type === "execution") ??
    (activities.length === 1 ? activities[0] : null);

  if (!target) return null;

  // `undefined` omite el parámetro y la función usa su default, que es null.
  // Es la forma de decir «no se cargó» sin que el tipo generado obligue a
  // inventar un valor.
  const { data } = await supabase.rpc("set_activity_schedule", {
    p_activity_id: target.id,
    p_date: input.date ?? undefined,
    p_start_time: input.startTime ?? undefined,
    p_end_time: input.endTime ?? undefined,
    p_duration_minutes: input.durationMinutes ?? undefined,
    p_override_reason: overrideReason,
  });

  return parseGateResult(data);
}

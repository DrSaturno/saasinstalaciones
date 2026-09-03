import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type OrderScheduleInput = {
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
};

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
 */
export async function syncActivitySchedule(
  supabase: SupabaseClient<Database>,
  orderId: string,
  input: OrderScheduleInput,
): Promise<void> {
  const { data: activities } = await supabase
    .from("work_activities")
    .select("id, activity_type")
    .eq("work_order_id", orderId);

  if (!activities || activities.length === 0) return;

  const target =
    activities.find((activity) => activity.activity_type === "execution") ??
    (activities.length === 1 ? activities[0] : null);

  if (!target) return;

  // `undefined` omite el parámetro y la función usa su default, que es null.
  // Es la forma de decir «no se cargó» sin que el tipo generado obligue a
  // inventar un valor.
  await supabase.rpc("set_activity_schedule", {
    p_activity_id: target.id,
    p_date: input.date ?? undefined,
    p_start_time: input.startTime ?? undefined,
    p_end_time: input.endTime ?? undefined,
    p_duration_minutes: input.durationMinutes ?? undefined,
  });
}

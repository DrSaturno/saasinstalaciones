import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, SchedulePrecision } from "@/types/database";
import { throwIfDataError } from "@/lib/data/errors";

export type OrderSchedule = {
  precision: SchedulePrecision;
  /** `HH:MM` en la zona horaria de la actividad, o vacío si no hay hora. */
  startTime: string;
  endTime: string;
  durationMinutes: number | null;
  timezone: string;
};

/**
 * El instante guardado, expresado como hora de reloj en la zona de la
 * actividad.
 *
 * Formatear no es lo mismo que componer: armar un instante a partir de fecha,
 * hora y huso se hace en SQL —`set_activity_schedule`— porque ahí está la
 * autoridad. Acá sólo se lee al revés para poder prellenar un campo, y para eso
 * `Intl` con la zona explícita es correcto y usa la base de husos del sistema.
 */
function clockTime(iso: string | null, timeZone: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(iso));
}

/**
 * La agenda de una orden, leída de la actividad que la representa.
 *
 * Misma elección que al escribir: la de ejecución es el trabajo en sí, y un
 * relevamiento que la acompaña tiene su propia fecha, que puede estar pendiente.
 */
export async function fetchOrderSchedule(
  supabase: SupabaseClient<Database>,
  orderId: string,
): Promise<OrderSchedule | null> {
  const { data: activities, error } = await supabase
    .from("work_activities")
    .select(
      "activity_type, schedule_precision, scheduled_start_at, scheduled_end_at, estimated_duration_minutes, timezone",
    )
    .eq("work_order_id", orderId);
  throwIfDataError("order.schedule", error);

  if (!activities || activities.length === 0) return null;

  const activity =
    activities.find((item) => item.activity_type === "execution") ??
    (activities.length === 1 ? activities[0] : null);

  if (!activity) return null;

  return {
    precision: activity.schedule_precision,
    startTime: clockTime(activity.scheduled_start_at, activity.timezone),
    endTime: clockTime(activity.scheduled_end_at, activity.timezone),
    durationMinutes: activity.estimated_duration_minutes,
    timezone: activity.timezone,
  };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ScheduledOrder } from "@/lib/domain/schedule-conflicts";
import { throwIfDataError } from "@/lib/data/errors";

export type PendingReschedule = {
  id: string;
  orderId: string;
  previousDate: string | null;
  previousEndDate: string | null;
  newDate: string;
  newEndDate: string | null;
  reason: string;
  notifiedAt: string;
  responseWindowDays: number;
  calendarCountry: string;
  calendarTimezone: string;
};

/**
 * La reprogramación vigente que espera respuesta de este instalador.
 *
 * "Vigente" excluye las superadas: si la empresa volvió a mover la fecha, la
 * pregunta anterior ya no es la que hay que contestar. Y exige `notified_at`
 * porque una reprogramación sin aviso persistido todavía no le corre plazo a
 * nadie — no tiene sentido mostrarle un reloj que no arrancó.
 */
export async function fetchPendingReschedule(
  supabase: SupabaseClient<Database>,
  orderId: string,
  installerId: string,
): Promise<PendingReschedule | null> {
  const { data, error } = await supabase
    .from("order_reschedules")
    .select(
      "id, order_id, previous_date, previous_end_date, new_date, new_end_date, reason, notified_at, response_window_days, calendar_country, calendar_timezone",
    )
    .eq("order_id", orderId)
    .eq("installer_id", installerId)
    .is("response", null)
    .is("superseded_at", null)
    .not("notified_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfDataError("reschedules.pending", error);

  if (!data || !data.notified_at) return null;
  return {
    id: data.id,
    orderId: data.order_id,
    previousDate: data.previous_date,
    previousEndDate: data.previous_end_date,
    newDate: data.new_date,
    newEndDate: data.new_end_date,
    reason: data.reason,
    notifiedAt: data.notified_at,
    responseWindowDays: data.response_window_days,
    calendarCountry: data.calendar_country,
    calendarTimezone: data.calendar_timezone,
  };
}

/**
 * Las otras órdenes vivas de este instalador, para poder decirle si la fecha
 * nueva le pisa algo que ya aceptó.
 *
 * Las canceladas y finalizadas se excluyen acá y no al comparar: una orden
 * cerrada no ocupa la agenda, y dejarla entrar obligaría a filtrarla en el
 * dominio, donde ya no se sabe por qué estaba.
 */
export async function fetchInstallerSchedule(
  supabase: SupabaseClient<Database>,
  installerId: string,
): Promise<ScheduledOrder[]> {
  const { data, error } = await supabase
    .from("work_orders")
    .select("id, order_number, title, scheduled_date, scheduled_end_date")
    .eq("assigned_installer_id", installerId)
    .not("status", "in", "(cancelada,finalizada)")
    .not("scheduled_date", "is", null);
  throwIfDataError("reschedules.installer_schedule", error);

  return (data ?? []).map((order) => ({
    id: order.id,
    orderNumber: order.order_number,
    title: order.title,
    scheduledDate: order.scheduled_date,
    scheduledEndDate: order.scheduled_end_date,
  }));
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  CANCELLATION_REASONS,
  type CancellationReason,
} from "@/lib/actions/orders/cancellation";

/**
 * El CHECK de la tabla ya limita los valores, pero el generador de tipos emite
 * `string` para esa columna. Se estrecha acá, en el borde, para que el resto
 * del código trabaje con la unión y no con texto libre.
 */
function toReason(value: string): CancellationReason {
  return (CANCELLATION_REASONS as readonly string[]).includes(value)
    ? (value as CancellationReason)
    : "other";
}

export type PendingCancellation = {
  id: string;
  orderId: string;
  installerId: string;
  installerName: string;
  reasonCode: CancellationReason;
  reasonNote: string;
  requestedAt: string;
  scheduledDateAtRequest: string | null;
};

/**
 * El pedido de baja que espera revisión en esta orden, si lo hay.
 *
 * Sólo trae los `pending`: los `auto_approved` entraron dentro del plazo y no
 * hay nada que decidir sobre ellos — el requisito es explícito en que no
 * generan penalización ni revisión.
 */
export async function fetchPendingCancellation(
  supabase: SupabaseClient<Database>,
  orderId: string,
): Promise<PendingCancellation | null> {
  const { data } = await supabase
    .from("order_cancellation_requests")
    .select(
      "id, order_id, installer_id, reason_code, reason_note, requested_at, scheduled_date_at_request",
    )
    .eq("order_id", orderId)
    .eq("status", "pending")
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", data.installer_id)
    .maybeSingle();

  return {
    id: data.id,
    orderId: data.order_id,
    installerId: data.installer_id,
    installerName: profile?.full_name ?? "",
    reasonCode: toReason(data.reason_code),
    reasonNote: data.reason_note,
    requestedAt: data.requested_at,
    scheduledDateAtRequest: data.scheduled_date_at_request,
  };
}

/** Si este instalador ya tiene un pedido abierto para esta orden. */
export async function hasOpenCancellationRequest(
  supabase: SupabaseClient<Database>,
  orderId: string,
  installerId: string,
): Promise<boolean> {
  const { count } = await supabase
    .from("order_cancellation_requests")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId)
    .eq("installer_id", installerId)
    .eq("status", "pending");
  return (count ?? 0) > 0;
}

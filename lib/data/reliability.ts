import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ReliabilityEvent, ReliabilityKind } from "@/lib/domain/reliability";

const KINDS: readonly ReliabilityKind[] = [
  "order_accepted",
  "order_completed",
  "cancel_in_notice",
  "cancel_late",
  "cancel_justified",
  "reschedule_accepted",
  "reschedule_declined",
  "reschedule_no_response",
];

/**
 * El CHECK de la tabla ya limita los valores; el generador de tipos emite
 * `string`. Se estrecha en el borde para que el dominio trabaje con la unión.
 */
function toKind(value: string): ReliabilityKind | null {
  return (KINDS as readonly string[]).includes(value)
    ? (value as ReliabilityKind)
    : null;
}

/**
 * Eventos de confiabilidad de un instalador.
 *
 * Trae también los revertidos: el dominio los descarta del cálculo, pero el
 * requisito pide poder explicar qué pasó — y "esto se revirtió" es parte de la
 * explicación. Filtrarlos acá los volvería invisibles.
 */
export async function fetchReliabilityEvents(
  supabase: SupabaseClient<Database>,
  installerId: string,
  windowDays: number,
): Promise<ReliabilityEvent[]> {
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const { data } = await supabase
    .from("installer_reliability_events")
    .select("id, kind, occurred_at, order_id, reverted_at")
    .eq("installer_id", installerId)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false });

  const events: ReliabilityEvent[] = [];
  for (const row of data ?? []) {
    const kind = toKind(row.kind);
    if (!kind) continue;
    events.push({
      id: row.id,
      kind,
      occurredAt: row.occurred_at,
      orderId: row.order_id,
      revertedAt: row.reverted_at,
    });
  }
  return events;
}

/** Números de orden para poder nombrar el trabajo relacionado a cada evento. */
export async function fetchOrderNumbers(
  supabase: SupabaseClient<Database>,
  orderIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const unique = [...new Set(orderIds)];
  if (unique.length === 0) return new Map();
  const { data } = await supabase
    .from("work_orders")
    .select("id, order_number")
    .in("id", unique);
  return new Map((data ?? []).map((o) => [o.id, o.order_number]));
}

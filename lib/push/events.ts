import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { logEvent } from "@/lib/observability";
import { INTERNAL_TIMEOUT_MS } from "@/lib/http/timeout";

export type PushEvent =
  | "broadcast_created"
  | "application_received"
  | "application_accepted"
  | "application_rejected"
  | "order_assigned"
  | "update_received"
  | "announcement"
  | "blocker_reported";

/**
 * Despacha el push como mejora progresiva. La notificación in-app ya fue
 * creada por la base, por lo que una Edge Function sin configurar nunca debe
 * hacer fallar la operación principal.
 */
export async function requestPushDelivery(
  supabase: SupabaseClient<Database>,
  event: PushEvent,
  resourceId: string,
  subjectId?: string,
): Promise<void> {
  try {
    // Con timeout: varias de estas invocaciones se esperan dentro del camino de
    // la petición (asignar orden, transicionar tarea), así que una función lenta
    // se traduce en latencia visible para quien está usando la app (OPS-12).
    const { error } = await supabase.functions.invoke("send-event-push", {
      body: { event, resourceId, subjectId },
      signal: AbortSignal.timeout(INTERNAL_TIMEOUT_MS),
    });

    // Web Push es opcional y NUNCA debe hacer fallar la operación principal,
    // pero fallar en silencio absoluto —como estaba— hacía que una caída del
    // 100% del push fuera invisible: sin log, sin métrica, sin nada (OPS-19).
    // Se registra y se sigue.
    if (error) {
      logEvent("warn", "push.delivery_failed", {
        push_event: event,
        resource_id: resourceId,
        reason: error.name,
      });
    }
  } catch (error) {
    logEvent("warn", "push.delivery_failed", {
      push_event: event,
      resource_id: resourceId,
      reason: error instanceof Error ? error.name : "unknown",
    });
  }
}

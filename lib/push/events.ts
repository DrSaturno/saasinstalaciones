import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type PushEvent =
  | "broadcast_created"
  | "application_received"
  | "application_accepted"
  | "application_rejected"
  | "order_assigned"
  | "update_received";

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
    await supabase.functions.invoke("send-event-push", {
      body: { event, resourceId, subjectId },
    });
  } catch {
    // Web Push es opcional; la bandeja in-app sigue siendo la fuente de verdad.
  }
}

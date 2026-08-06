import { createClient } from "@/lib/supabase/client";
import { syncInstallerTransition } from "@/lib/actions/tasks";
import { requestPushDelivery } from "@/lib/push/events";
import { logEvent } from "@/lib/observability";
import { db, type OutboxItem, type PendingPhoto } from "./db";

/** Encola una mutación (y sus fotos) para enviar ahora o al reconectar. */
export async function enqueue(
  item: Omit<OutboxItem, "createdAt" | "tries">,
  photos: PendingPhoto[] = [],
): Promise<void> {
  await db.transaction("rw", db.outbox, db.photos, async () => {
    for (const p of photos) await db.photos.put(p);
    await db.outbox.put({ ...item, createdAt: Date.now(), tries: 0 });
  });
}

/** Cantidad de operaciones pendientes de enviar. */
export async function pendingCount(): Promise<number> {
  return db.outbox.count();
}

let flushing = false;

/**
 * Procesa la cola en orden. Idempotente y seguro de llamar muchas veces:
 * un solo flush a la vez, y cada op se reintenta hasta lograrlo.
 * Devuelve cuántas operaciones se enviaron.
 */
export async function flush(): Promise<number> {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;
  let failed = 0;

  try {
    const supabase = createClient();

    // Sin sesión (token vencido, logout): no tiene sentido intentar.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return 0;

    const items = await db.outbox.orderBy("createdAt").toArray();

    for (const item of items) {
      if (item.blocked) continue;

      try {
        if (item.kind === "update") {
          // 1) Subir fotos pendientes de este update.
          const photoPaths: string[] = [];
          for (const photoId of item.photoIds ?? []) {
            const photo = await db.photos.get(photoId);
            if (!photo) continue;
            const path =
              photo.path ??
              `${photo.companyId}/${photo.orderId}/${photo.id}-${photo.fileName}`;
            if (!photo.path) {
              const { error } = await supabase.storage
                .from("evidence")
                .upload(path, photo.blob, { upsert: true });
              if (error) throw error;
              await db.photos.update(photoId, { path });
            }
            photoPaths.push(path);
          }

          // 2) Insertar el avance (upsert idempotente por id).
          const { error } = await supabase.from("order_updates").upsert(
            {
              id: item.id,
              order_id: item.orderId!,
              company_id: item.companyId!,
              installer_id: user.id,
              type: item.updateType!,
              note: item.note ?? "",
              photos: photoPaths,
              client_created_at: new Date(item.createdAt).toISOString(),
            },
            { onConflict: "id", ignoreDuplicates: true },
          );
          if (error) throw error;

          await requestPushDelivery(supabase, "update_received", item.id);

          // Limpieza: quitar blobs ya subidos.
          for (const photoId of item.photoIds ?? []) await db.photos.delete(photoId);
        } else if (item.kind === "transition") {
          if (!item.orderId || !item.toStatus) {
            await db.outbox.update(item.id, {
              blocked: true,
              tries: item.tries + 1,
              lastError: "invalid_offline_transition",
            });
            logEvent("error", "offline.sync.item_blocked", {
              kind: item.kind,
              reason: "invalid_offline_transition",
              tries: item.tries + 1,
            });
            continue;
          }

          const result = await syncInstallerTransition({
            operationId: item.id,
            orderId: item.orderId,
            toStatus: item.toStatus,
          });
          if (result.error) {
            if (result.retryable === false) {
              await db.outbox.update(item.id, {
                blocked: true,
                tries: item.tries + 1,
                lastError: result.error,
              });
              // El servidor rechazó la transición de forma definitiva: queda
              // para la bandeja de conflictos, no para otro reintento.
              logEvent("error", "offline.sync.item_blocked", {
                kind: item.kind,
                reason: result.error,
                tries: item.tries + 1,
              });
              continue;
            }
            throw new Error(result.error);
          }
        } else if (item.kind === "chat") {
          const { error } = await supabase.from("chat_messages").upsert(
            {
              id: item.messageId!,
              thread_id: item.threadId!,
              company_id: item.companyId!,
              sender_id: user.id,
              body: item.body ?? "",
              attachments: item.attachments ?? [],
              reply_to_id: item.replyToId ?? null,
              created_at: new Date(item.createdAt).toISOString(),
            },
            { onConflict: "id", ignoreDuplicates: true },
          );
          if (error) throw error;
        } else if (item.kind === "chat_read") {
          const { error } = await supabase.from("chat_message_reads").upsert({
            message_id: item.messageId!,
            company_id: item.companyId!,
            user_id: user.id,
            read_at: new Date(item.createdAt).toISOString(),
          });
          if (error) throw error;
        }

        await db.outbox.delete(item.id);
        sent++;
      } catch (e) {
        // Falló esta op: la dejamos en la cola para el próximo intento.
        await db.outbox.update(item.id, {
          tries: item.tries + 1,
          lastError: e instanceof Error ? e.message : String(e),
        });
        failed++;
        // Un elemento que se reintenta sin fin es invisible desde el servidor:
        // el contador de intentos es lo que distingue un corte de red pasajero
        // de una operación que nunca va a entrar.
        logEvent("warn", "offline.sync.item_failed", {
          kind: item.kind,
          tries: item.tries + 1,
          age_ms: Date.now() - item.createdAt,
          error: e,
        });
      }
    }
  } finally {
    flushing = false;
  }

  if (sent || failed) {
    logEvent(failed ? "warn" : "info", "offline.sync.flushed", {
      sent,
      failed,
      pending: await db.outbox.count(),
    });
  }

  return sent;
}

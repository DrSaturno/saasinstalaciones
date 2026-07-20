import { createClient } from "@/lib/supabase/client";
import type { OrderStatus } from "@/types/database";
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

  try {
    const supabase = createClient();

    // Sin sesión (token vencido, logout): no tiene sentido intentar.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return 0;

    const items = await db.outbox.orderBy("createdAt").toArray();

    for (const item of items) {
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
              order_id: item.orderId,
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

          // Limpieza: quitar blobs ya subidos.
          for (const photoId of item.photoIds ?? []) await db.photos.delete(photoId);
        } else if (item.kind === "transition") {
          // Leer estado actual: si ya está en destino, es no-op (idempotente).
          const { data: order } = await supabase
            .from("work_orders")
            .select("status, assigned_installer_id")
            .eq("id", item.orderId)
            .single();
          if (order && order.status !== item.toStatus) {
            const { error } = await supabase
              .from("work_orders")
              .update({ status: item.toStatus as OrderStatus })
              .eq("id", item.orderId);
            if (error) throw error;
          }
        }

        await db.outbox.delete(item.id);
        sent++;
      } catch (e) {
        // Falló esta op: la dejamos en la cola para el próximo intento.
        await db.outbox.update(item.id, {
          tries: item.tries + 1,
          lastError: e instanceof Error ? e.message : String(e),
        });
      }
    }
  } finally {
    flushing = false;
  }

  return sent;
}

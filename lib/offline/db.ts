import Dexie, { type EntityTable } from "dexie";
import type { InstallerTransitionTarget } from "@/lib/domain/installer-transition";

/**
 * Base local del instalador (IndexedDB via Dexie).
 *
 * - `outbox`: mutaciones pendientes de enviar. Cada una lleva un uuid propio;
 *   como las escrituras del server son idempotentes (upsert ignoreDuplicates /
 *   transición no-op si ya está en el estado), reenviar la cola nunca duplica.
 * - `photos`: blobs de fotos a subir; se guardan aparte porque pueden ser
 *   grandes y se suben antes que el `update` que las referencia.
 * - `tasks`: cache de las tareas asignadas, para verlas sin señal.
 */

export type OutboxKind = "update" | "transition" | "chat" | "chat_read";

export type OutboxItem = {
  id: string; // uuid de la operación (idempotencia)
  kind: OutboxKind;
  orderId?: string;
  // update: los cinco primeros son hitos operativos; "message" es un mensaje
  // libre del espacio de evidencia, que no mueve el estado de la orden.
  updateType?: "travel" | "checkin" | "progress" | "blocker" | "done" | "message";
  // Sólo los hitos que mueven el estado los traen; el resto van sin.
  fromStatus?: string;
  toStatusTrace?: string;
  note?: string;
  photoIds?: string[]; // referencias a la tabla photos
  companyId?: string;
  // transition:
  toStatus?: InstallerTransitionTarget;
  threadId?: string;
  messageId?: string;
  replyToId?: string | null;
  body?: string;
  attachments?: { path: string; name: string; mimeType: string }[];
  createdAt: number;
  tries: number;
  lastError?: string;
  /** Error terminal: se conserva para auditoría, pero no se reintenta. */
  blocked?: boolean;
};

export type PendingPhoto = {
  id: string; // uuid
  orderId: string;
  companyId: string;
  fileName: string;
  blob: Blob;
  path?: string; // se completa al subir
};

export type CachedTask = {
  id: string;
  data: unknown; // snapshot de la tarea para render offline
  cachedAt: number;
};

const db = new Dexie("instalapro-installer") as Dexie & {
  outbox: EntityTable<OutboxItem, "id">;
  photos: EntityTable<PendingPhoto, "id">;
  tasks: EntityTable<CachedTask, "id">;
};

db.version(1).stores({
  outbox: "id, orderId, createdAt",
  photos: "id, orderId",
  tasks: "id, cachedAt",
});

db.version(2).stores({
  outbox: "id, orderId, threadId, createdAt",
  photos: "id, orderId",
  tasks: "id, cachedAt",
});

/** Borra todo dato autenticado que la PWA mantiene en IndexedDB. */
export async function clearOfflineDatabase(): Promise<void> {
  await db.transaction("rw", db.outbox, db.photos, db.tasks, async () => {
    await Promise.all([
      db.outbox.clear(),
      db.photos.clear(),
      db.tasks.clear(),
    ]);
  });
}

export { db };

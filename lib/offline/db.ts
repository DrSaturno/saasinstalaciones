import Dexie, { type EntityTable } from "dexie";

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
  // update:
  updateType?: "checkin" | "progress" | "blocker" | "done";
  note?: string;
  photoIds?: string[]; // referencias a la tabla photos
  companyId?: string;
  // transition:
  toStatus?: string;
  threadId?: string;
  messageId?: string;
  body?: string;
  attachments?: { path: string; name: string; mimeType: string }[];
  createdAt: number;
  tries: number;
  lastError?: string;
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

export { db };

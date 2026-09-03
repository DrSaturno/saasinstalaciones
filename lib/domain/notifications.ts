import type { AnnouncementSeverity, Json } from "@/types/database";

/**
 * Qué tan urgente es un aviso. Sale de `notifications.data.severity`, que el
 * fan-out de anuncios ya venía escribiendo — no hay columna nueva ni se
 * infiere del `type`: el dato ya viajaba, sólo se estaba descartando al
 * leerlo.
 *
 * Lo que no trae severidad es informativo: una orden asignada o un mensaje
 * nuevo no son urgencias, son novedades.
 */
export type NotificationSeverity = AnnouncementSeverity;

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string;
  severity: NotificationSeverity;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
};

/** Qué vista de la bandeja se está mirando. */
export type NotificationFilter = "pending" | "archived" | "all";

export const NOTIFICATION_FILTERS: NotificationFilter[] = [
  "pending",
  "archived",
  "all",
];

export function parseNotificationFilter(value: unknown): NotificationFilter {
  return NOTIFICATION_FILTERS.includes(value as NotificationFilter)
    ? (value as NotificationFilter)
    : "pending";
}

function readObject(data: Json): Record<string, unknown> | null {
  return data && !Array.isArray(data) && typeof data === "object" ? data : null;
}

export function notificationHref(data: Json): string {
  const value = readObject(data)?.url;
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/";
}

export function notificationSeverity(data: Json): NotificationSeverity {
  const value = readObject(data)?.severity;
  return value === "critical" || value === "warning" ? value : "info";
}

/**
 * Archivar y descartar sólo aplican a lo ya leído (NOT-R2).
 *
 * Que algo pendiente pueda salir de la bandeja sin haberse visto es
 * justamente lo que el pedido pide evitar: "mantener visibles las
 * notificaciones pendientes".
 */
export function canArchiveNotification(item: {
  readAt: string | null;
  archivedAt: string | null;
}): boolean {
  return item.readAt !== null && item.archivedAt === null;
}

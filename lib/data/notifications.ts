import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  notificationHref,
  notificationSeverity,
  type NotificationFilter,
  type NotificationItem,
} from "@/lib/domain/notifications";
import type { Database } from "@/types/database";
import { throwIfDataError } from "@/lib/data/errors";

export type NotificationInbox = {
  items: NotificationItem[];
  unreadCount: number;
};

const COLUMNS =
  "id, type, title, body, data, read_at, archived_at, created_at";

type Row = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Database["public"]["Tables"]["notifications"]["Row"]["data"];
  read_at: string | null;
  archived_at: string | null;
  created_at: string;
};

function shape(row: Row): NotificationItem {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    href: notificationHref(row.data),
    severity: notificationSeverity(row.data),
    readAt: row.read_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
  };
}

/**
 * La campanita: lo pendiente de atender, nada archivado ni descartado.
 *
 * El contador de no leídas ignora lo descartado por la misma razón: si la
 * persona ya decidió que no lo quiere ver, no puede seguir pesando en el
 * badge rojo.
 */
export async function fetchNotificationInbox(
  supabase: SupabaseClient<Database>,
): Promise<NotificationInbox> {
  const [itemsResult, countResult] = await Promise.all([
    supabase
      .from("notifications")
      .select(COLUMNS)
      .is("dismissed_at", null)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(12)
      .overrideTypes<Row[]>(),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null)
      .is("dismissed_at", null),
  ]);
  throwIfDataError("notifications.inbox", itemsResult.error);
  throwIfDataError("notifications.unread_count", countResult.error);

  return {
    unreadCount: countResult.count ?? 0,
    items: (itemsResult.data ?? []).map(shape),
  };
}

const PAGE_SIZE = 50;

export type NotificationPage = {
  items: NotificationItem[];
  hasMore: boolean;
};

/**
 * La bandeja completa, con su filtro.
 *
 * Lo descartado no aparece en NINGUNA vista, ni siquiera en "todas": esa es
 * la diferencia con archivar, que sí es recuperable (NOT-R3).
 */
export async function fetchNotificationPage(
  supabase: SupabaseClient<Database>,
  filter: NotificationFilter,
  page = 0,
): Promise<NotificationPage> {
  let query = supabase
    .from("notifications")
    .select(COLUMNS)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  if (filter === "pending") query = query.is("archived_at", null);
  if (filter === "archived") query = query.not("archived_at", "is", null);

  const { data, error } = await query.overrideTypes<Row[]>();
  throwIfDataError("notifications.page", error);
  const rows = data ?? [];

  // Se pide uno de más para saber si hay página siguiente sin un count aparte.
  return {
    items: rows.slice(0, PAGE_SIZE).map(shape),
    hasMore: rows.length > PAGE_SIZE,
  };
}

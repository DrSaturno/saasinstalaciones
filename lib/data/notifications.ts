import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { notificationHref, type NotificationItem } from "@/lib/domain/notifications";
import type { Database } from "@/types/database";

export type NotificationInbox = {
  items: NotificationItem[];
  unreadCount: number;
};

export async function fetchNotificationInbox(
  supabase: SupabaseClient<Database>,
): Promise<NotificationInbox> {
  const [{ data }, { count }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, type, title, body, data, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
  ]);

  return {
    unreadCount: count ?? 0,
    items: (data ?? []).map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      href: notificationHref(row.data),
      readAt: row.read_at,
      createdAt: row.created_at,
    })),
  };
}

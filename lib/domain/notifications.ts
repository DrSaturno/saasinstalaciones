import type { Json } from "@/types/database";

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string;
  readAt: string | null;
  createdAt: string;
};

export function notificationHref(data: Json): string {
  if (!data || Array.isArray(data) || typeof data !== "object") return "/";
  const value = data.url;
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/";
}

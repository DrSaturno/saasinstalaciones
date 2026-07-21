"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellRing, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  markAllNotificationsRead,
  markNotificationRead,
  removePushSubscription,
  savePushSubscription,
} from "@/lib/actions/notifications";
import type { NotificationInbox } from "@/lib/data/notifications";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function NotificationMenu({
  userId,
  initialInbox,
  vapidPublicKey,
}: {
  userId: string;
  initialInbox: NotificationInbox;
  vapidPublicKey: string | null;
}) {
  const t = useTranslations("Notifications");
  const format = useFormatter();
  const [unreadCount, setUnreadCount] = useState(initialInbox.unreadCount);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => {
          setUnreadCount((count) => count + 1);
          router.refresh();
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [router, userId]);

  const openItem = (id: string, href: string, unread: boolean) => {
    if (unread) setUnreadCount((count) => Math.max(0, count - 1));
    startTransition(async () => {
      if (unread) await markNotificationRead(id);
      router.push(href);
    });
  };

  const markAll = () => {
    setUnreadCount(0);
    startTransition(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label={t("unread", { count: unreadCount })}>
          {unreadCount ? <BellRing /> : <Bell />}
          {unreadCount ? (
            <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 font-mono text-[10px] leading-4 text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(360px,calc(100vw-24px))] p-0">
        <div className="flex items-center justify-between px-3 py-2.5">
          <DropdownMenuLabel className="p-0 text-sm text-foreground">{t("title")}</DropdownMenuLabel>
          {unreadCount ? (
            <Button variant="ghost" size="xs" disabled={pending} onClick={markAll}>
              <CheckCheck /> {t("markRead")}
            </Button>
          ) : null}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-80 overflow-y-auto p-1">
          {initialInbox.items.length ? initialInbox.items.map((item) => (
            <DropdownMenuItem
              key={item.id}
              className="items-start gap-3 px-2.5 py-2.5"
              onSelect={() => openItem(item.id, item.href, !item.readAt)}
            >
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.readAt ? "bg-border" : "bg-primary"}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{item.title}</span>
                {item.body ? <span className="mt-0.5 block line-clamp-2 text-xs leading-5 text-muted-foreground">{item.body}</span> : null}
                <span className="mt-1 block font-mono text-[10px] text-muted-foreground">
                  {format.dateTime(new Date(item.createdAt), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </span>
            </DropdownMenuItem>
          )) : <p className="px-3 py-10 text-center text-sm text-muted-foreground">{t("empty")}</p>}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <PushPermissionControl vapidPublicKey={vapidPublicKey} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

function PushPermissionControl({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const t = useTranslations("Notifications");
  const [active, setActive] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.getRegistration().then(async (registration) => {
      const subscription = await registration?.pushManager.getSubscription();
      setActive(Boolean(subscription));
    }).catch(() => undefined);
  }, []);

  const toggle = () => startTransition(async () => {
    try {
      if (!vapidPublicKey || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        toast.error(t("pushUnavailable"));
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const current = await registration.pushManager.getSubscription();
      if (current) {
        await removePushSubscription(current.endpoint);
        await current.unsubscribe();
        setActive(false);
        toast.success(t("pushDisabled"));
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error(t("permissionDenied"));
        return;
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error(t("incomplete"));
      const result = await savePushSubscription({ endpoint: json.endpoint, keys: json.keys });
      if (result.error) throw new Error(result.error);
      setActive(true);
      toast.success(t("pushEnabled"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("pushError"));
    }
  });

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <div>
        <p className="text-xs font-medium">{t("browserAlerts")}</p>
        <p className="text-[11px] text-muted-foreground">{vapidPublicKey ? (active ? t("active") : t("inactive")) : t("pendingConfig")}</p>
      </div>
      <Button size="xs" variant="outline" disabled={!vapidPublicKey || pending} onClick={toggle}>
        {active ? t("disable") : t("enable")}
      </Button>
    </div>
  );
}

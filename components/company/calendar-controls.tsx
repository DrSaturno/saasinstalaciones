"use client";

import { useTransition } from "react";
import { RefreshCw, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { disconnectGoogleCalendar, syncGoogleCalendar } from "@/lib/actions/calendar";
import { Button } from "@/components/ui/button";

export function CalendarControls({ configured, connected }: { configured: boolean; connected: boolean }) {
  const t = useTranslations("Dashboard");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (!configured) return <p className="mt-4 text-xs text-muted-foreground">{t("calendarNeedsConfig")}</p>;
  if (!connected) return <Button asChild size="sm" className="mt-4"><a href="/api/google-calendar/connect">{t("connectCalendar")}</a></Button>;
  const sync = () => startTransition(async () => { const result = await syncGoogleCalendar(); if (result.error) { toast.error(result.error); return; } toast.success(t("calendarSynced", { count: result.synced ?? 0 })); router.refresh(); });
  const disconnect = () => startTransition(async () => { if (!window.confirm(t("disconnectConfirm"))) return; const result = await disconnectGoogleCalendar(); if (result.error) { toast.error(result.error); return; } toast.success(t("calendarDisconnected")); router.refresh(); });
  return <div className="mt-4 flex flex-wrap gap-2"><Button type="button" size="sm" onClick={sync} disabled={pending}><RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} />{t("syncNow")}</Button><Button type="button" size="sm" variant="ghost" onClick={disconnect} disabled={pending}><Unplug className="size-3.5" />{t("disconnect")}</Button></div>;
}

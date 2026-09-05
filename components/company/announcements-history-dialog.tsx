"use client";

import { History } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { PublishedAnnouncement } from "@/lib/data/announcements";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const SEVERITY_LABEL = {
  info: "severityInfo",
  warning: "severityWarning",
  critical: "severityCritical",
} as const;

/**
 * Lo que la empresa ya publicó, para poder controlar qué se mandó.
 *
 * Se publicaba a ciegas: el aviso salía y no quedaba forma de revisar el texto
 * ni a cuántos había llegado. Muestra el público real de cada uno, que es lo
 * que suele generar la duda ("¿esto lo vieron todos o sólo Córdoba?").
 */
export function AnnouncementsHistoryDialog({
  announcements,
}: {
  announcements: PublishedAnnouncement[];
}) {
  const t = useTranslations("Announcements");
  const format = useFormatter();

  const audience = (item: PublishedAnnouncement) =>
    item.audienceType === "all"
      ? t("audienceAll")
      : `${item.audienceType === "zone" ? t("audienceZone") : t("audienceProject")}: ${item.audienceRef}`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <History className="size-3.5" aria-hidden="true" />
          {t("historyTrigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("historyTitle")}</DialogTitle>
          <DialogDescription>{t("historyDescription")}</DialogDescription>
        </DialogHeader>
        {announcements.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("historyEmpty")}</p>
        ) : (
          <div className="divide-y">
            {announcements.map((item) => (
              <article key={item.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">{item.title}</p>
                  <span className="font-mono text-caption text-muted-foreground">
                    {format.dateTime(new Date(item.createdAt), { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{item.body}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant={item.severity === "critical" ? "destructive" : "outline"}>
                    {t(SEVERITY_LABEL[item.severity])}
                  </Badge>
                  <span className="text-caption text-muted-foreground">{audience(item)}</span>
                  <span className="font-mono text-caption text-muted-foreground">
                    {t("historyRecipients", { count: item.recipients })}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

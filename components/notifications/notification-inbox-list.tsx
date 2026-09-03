"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  CircleAlert,
  Info,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import {
  archiveNotification,
  dismissNotification,
  markNotificationRead,
  unarchiveNotification,
} from "@/lib/actions/notifications";
import {
  canArchiveNotification,
  type NotificationFilter,
  type NotificationItem,
  type NotificationSeverity,
} from "@/lib/domain/notifications";
import { Button } from "@/components/ui/button";

/**
 * Prioridad: color, ícono Y palabra.
 *
 * El color solo no alcanza — quien no lo distingue tiene que poder leer de
 * qué se trata (REQ-13.2). Por eso cada nivel trae las tres cosas y el
 * `Badge` nunca se queda mudo.
 */
const SEVERITY: Record<
  NotificationSeverity,
  { icon: LucideIcon; chip: string; dot: string }
> = {
  critical: {
    icon: CircleAlert,
    chip: "border-destructive/30 bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
  warning: {
    icon: TriangleAlert,
    chip: "border-amber-300 bg-amber-50 text-amber-900",
    dot: "bg-warning",
  },
  info: {
    icon: Info,
    chip: "border-border bg-muted/60 text-muted-foreground",
    dot: "bg-border",
  },
};

export function NotificationInboxList({
  items,
  filter,
}: {
  items: NotificationItem[];
  filter: NotificationFilter;
}) {
  const t = useTranslations("Notifications");
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<void>) =>
    startTransition(async () => {
      await action();
      router.refresh();
    });

  if (items.length === 0) {
    return (
      <div className="rounded-xl border bg-card py-16 text-center">
        <p className="text-sm text-muted-foreground">{t(`emptyStates.${filter}`)}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {items.map((item) => {
        const severity = SEVERITY[item.severity];
        const Icon = severity.icon;
        const unread = item.readAt === null;

        return (
          <li key={item.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {unread ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft/50 px-2 py-0.5 text-[11px] font-medium text-primary">
                    <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                    {t("unreadLabel")}
                  </span>
                ) : null}
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${severity.chip}`}
                >
                  <Icon className="size-3" aria-hidden="true" />
                  {t(`severity.${item.severity}`)}
                </span>
              </div>

              <Link
                href={item.href}
                onClick={() => {
                  if (unread) void markNotificationRead(item.id);
                }}
                className="mt-2 block font-medium hover:text-primary"
              >
                {item.title}
              </Link>
              {item.body ? (
                <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              ) : null}
              <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                {format.dateTime(new Date(item.createdAt), {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>

            <div className="flex shrink-0 gap-1.5">
              {item.archivedAt ? (
                <Button
                  variant="outline"
                  size="xs"
                  disabled={pending}
                  onClick={() => run(() => unarchiveNotification(item.id))}
                >
                  <ArchiveRestore /> {t("unarchive")}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="xs"
                  disabled={pending || !canArchiveNotification(item)}
                  // Sin leer no se archiva: lo pendiente no puede
                  // desaparecer sin que nadie lo haya visto.
                  title={canArchiveNotification(item) ? undefined : t("archiveNeedsRead")}
                  onClick={() => run(() => archiveNotification(item.id))}
                >
                  <Archive /> {t("archive")}
                </Button>
              )}
              <Button
                variant="ghost"
                size="xs"
                disabled={pending || item.readAt === null}
                title={item.readAt === null ? t("archiveNeedsRead") : t("dismiss")}
                aria-label={t("dismiss")}
                onClick={() => run(() => dismissNotification(item.id))}
              >
                <X />
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

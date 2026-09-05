"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";
import { useSync } from "@/lib/offline/use-sync";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Barra fina que muestra el estado de conexión y cuántos avances quedan por
 * sincronizar. Sólo se muestra cuando hay algo que comunicar (offline o cola
 * pendiente), para no molestar en el caso normal.
 */
export function SyncIndicator({ userId }: { userId: string }) {
  const t = useTranslations("SyncIndicator");
  const format = useFormatter();
  const {
    online,
    pending,
    blocked,
    issues,
    syncing,
    retryIssue,
    discardIssue,
  } = useSync(userId);

  if (online && pending === 0) return null;

  const hasIssues = issues.length > 0;
  const bg = blocked > 0
    ? "bg-destructive/10 text-destructive"
    : online
      ? "bg-[var(--warning)]/15"
      : "bg-muted";
  const dot = blocked > 0
    ? "bg-destructive"
    : online
      ? "bg-[var(--warning)]"
      : "bg-muted-foreground";

  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-2 px-4 py-1.5 text-xs ${bg}`}
      role={blocked > 0 ? "alert" : "status"}
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {blocked > 0 ? (
        <span>{t("blocked", { count: blocked })}</span>
      ) : !online ? (
        <span>
          {t("offline")}
          {pending > 0
            ? ` · ${t("notSent", { count: pending })}`
            : ` · ${t("keepWorking")}`}
        </span>
      ) : syncing ? (
        <span>{t("syncing")}</span>
      ) : (
        <span>{t("pending", { count: pending })}</span>
      )}
      {hasIssues ? (
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 underline underline-offset-2"
            >
              {t("review")}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("issuesTitle")}</DialogTitle>
              <DialogDescription>{t("issuesDescription")}</DialogDescription>
            </DialogHeader>

            <ul className="max-h-[55vh] space-y-2 overflow-y-auto">
              {issues.map((issue) => (
                <li key={issue.id} className="rounded-lg border p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      className={issue.blocked ? "mt-0.5 size-4 text-destructive" : "mt-0.5 size-4 text-[var(--warning)]"}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {t(`kinds.${issue.kind}`)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {issue.blocked
                          ? t("rejectedItem")
                          : t("retryingItem", { count: issue.tries })}
                      </p>
                      {issue.reason ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("reason", { reason: issue.reason })}
                        </p>
                      ) : null}
                      <p className="mt-1 font-mono text-caption text-muted-foreground">
                        {format.dateTime(new Date(issue.createdAt), {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    {issue.orderId ? (
                      <Button asChild variant="outline" size="sm" className="min-h-11">
                        <Link href={`/tasks/${issue.orderId}`}>{t("openTask")}</Link>
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      disabled={!online || syncing}
                      onClick={() => void retryIssue(issue.id)}
                    >
                      <RefreshCw aria-hidden="true" />
                      {t("retry")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-11"
                      disabled={syncing}
                      onClick={() => {
                        if (!window.confirm(t("discardConfirm"))) return;
                        void discardIssue(issue.id);
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                      {t("discard")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <DialogFooter showCloseButton />
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { CalendarClock, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { respondToReschedule } from "@/lib/actions/orders/reschedule-response";
import type { ScheduledOrder } from "@/lib/domain/schedule-conflicts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Answer = "accepted" | "declined";

/**
 * Lo primero que ve el instalador cuando le movieron la fecha.
 *
 * El texto es el del requisito, casi palabra por palabra, porque la claridad
 * acá no es estética: de esta pantalla depende que después se pueda decir que
 * el aviso fue claro antes de que el silencio tenga consecuencia.
 *
 * Los choques con sus otras órdenes se muestran ANTES de los botones. Pedirle
 * que se comprometa sin decirle que esa fecha le pisa otro trabajo sería
 * exactamente la trampa que el requisito quiere evitar.
 */
export function RescheduleResponse({
  rescheduleId,
  newDate,
  newEndDate,
  deadline,
  businessDaysLeft,
  expired,
  reason,
  conflicts,
}: {
  rescheduleId: string;
  newDate: string;
  newEndDate: string | null;
  deadline: string;
  businessDaysLeft: number;
  expired: boolean;
  reason: string;
  conflicts: ScheduledOrder[];
}) {
  const t = useTranslations("RescheduleResponse");
  const format = useFormatter();
  const router = useRouter();
  // Cuál de los dos botones se apretó: sin esto ambos mostrarían "Enviando…".
  const [sending, setSending] = useState<Answer | null>(null);
  const [pending, startTransition] = useTransition();

  const day = (value: string) =>
    format.dateTime(new Date(`${value}T12:00:00`), { dateStyle: "long" });

  const answer = (response: Answer) => {
    setSending(response);
    startTransition(async () => {
      const result = await respondToReschedule({ rescheduleId, response });
      setSending(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(response === "accepted" ? t("keptToast") : t("leftToast"));
      router.refresh();
    });
  };

  return (
    <Card className="mt-4 border-[var(--warning)]/50 bg-cream/30">
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <CalendarClock
            className="mt-0.5 size-5 shrink-0 text-[var(--warning)]"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{t("title")}</h2>

            <dl className="mt-3 grid gap-1 text-sm">
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-muted-foreground">{t("newDate")}</dt>
                <dd className="font-medium">
                  {newEndDate && newEndDate !== newDate
                    ? t("range", { from: day(newDate), to: day(newEndDate) })
                    : day(newDate)}
                </dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-muted-foreground">{t("until")}</dt>
                <dd className="font-medium">{day(deadline)}</dd>
              </div>
            </dl>

            <p className="mt-2 text-xs text-muted-foreground">
              {expired
                ? t("expiredHint", { date: day(deadline) })
                : t("remaining", { days: businessDaysLeft })}
            </p>

            {reason ? (
              <p className="mt-3 rounded-lg border bg-surface p-3 text-sm">
                <span className="text-muted-foreground">{t("reason")} </span>
                {reason}
              </p>
            ) : null}

            {conflicts.length > 0 ? (
              <div className="mt-3 rounded-lg border border-[var(--destructive)]/40 bg-surface p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <TriangleAlert
                    className="size-4 text-[var(--destructive)]"
                    aria-hidden="true"
                  />
                  {t("conflictTitle", { count: conflicts.length })}
                </p>
                <ul className="mt-2 grid gap-1">
                  {conflicts.map((conflict) => (
                    <li key={conflict.id} className="text-xs text-muted-foreground">
                      <span className="font-mono">{conflict.orderNumber}</span>
                      {" · "}
                      {conflict.title}
                      {conflict.scheduledDate ? ` · ${day(conflict.scheduledDate)}` : ""}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("conflictHint")}
                </p>
              </div>
            ) : null}

            <p className="mt-4 text-sm font-medium">{t("question")}</p>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={() => answer("accepted")}
                disabled={pending}
                className="sm:flex-1"
              >
                {sending === "accepted" ? t("sending") : t("keep")}
              </Button>
              <Button
                variant="outline"
                onClick={() => answer("declined")}
                disabled={pending}
                className="sm:flex-1"
              >
                {sending === "declined" ? t("sending") : t("leave")}
              </Button>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {t("noPenaltyNote")}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

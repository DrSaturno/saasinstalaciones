"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { transitionOrder, assignInstaller, rescheduleOrder } from "@/lib/actions/orders";
import { ORDER_TRANSITIONS, isTerminal } from "@/lib/domain/transitions";
import { ORDER_STATUS } from "@/lib/domain/status";
import { Button } from "@/components/ui/button";
import { RatingDialog } from "@/components/company/rating-dialog";
import { StarRating } from "@/components/shared/star-rating";
import type { OrderStatus } from "@/types/database";

type Props = {
  orderId: string;
  status: OrderStatus;
  installerId: string | null;
  scheduledDate: string | null;
  scheduledEndDate: string | null;
  roster: {
    id: string;
    name: string;
    ratingAvg: number;
    ratingCount: number;
  }[];
  rating: { stars: number; comment: string | null } | null;
};

export function OrderActions({
  orderId,
  status,
  installerId,
  scheduledDate,
  scheduledEndDate,
  roster,
  rating,
}: Props) {
  const t = useTranslations("OrderActions");
  const statusT = useTranslations("Status");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [startDate, setStartDate] = useState(scheduledDate ?? "");
  const [endDate, setEndDate] = useState(scheduledEndDate ?? "");
  const targets = ORDER_TRANSITIONS[status] ?? [];

  const doTransition = (to: OrderStatus) => {
    startTransition(async () => {
      const res = await transitionOrder(orderId, to);
      if (res.error) toast.error(res.error);
      else {
        toast.success(t("transitioned", { status: statusT(ORDER_STATUS[to].key) }));
        router.refresh();
      }
    });
  };

  const doAssign = (value: string) => {
    const id = value === "" ? null : value;
    startTransition(async () => {
      const res = await assignInstaller(orderId, id);
      if (res.error) toast.error(res.error);
      else {
        toast.success(id ? t("assigned") : t("unassignedToast"));
        router.refresh();
      }
    });
  };

  const doReschedule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const res = await rescheduleOrder({ orderId, scheduledDate: startDate, scheduledEndDate: endDate });
      if (res.error) toast.error(res.error);
      else {
        toast.success(t("rescheduledToast"));
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Asignación */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground">{t("installer")}</h3>
        {roster.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("emptyRoster")}
          </p>
        ) : (
          <select
            value={installerId ?? ""}
            disabled={pending}
            onChange={(e) => doAssign(e.target.value)}
            className="mt-2 h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm disabled:opacity-50"
          >
            <option value="">{t("unassigned")}</option>
            {roster.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.ratingCount > 0
                  ? ` · ★ ${r.ratingAvg.toFixed(1)} (${r.ratingCount})`
                  : ` · ${t("noRatings")}`}
              </option>
            ))}
          </select>
        )}
      </div>

      <form onSubmit={doReschedule} className="border-t pt-5">
        <h3 className="text-sm font-medium text-muted-foreground">{t("schedule")}</h3>
        <div className="mt-2 grid gap-2">
          <label className="grid gap-1 text-xs text-muted-foreground">{t("startDate")}<input type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm" /></label>
          <label className="grid gap-1 text-xs text-muted-foreground">{t("endDate")}<input type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm" /></label>
          <Button type="submit" size="sm" variant="outline" disabled={pending || !startDate}>{t("saveSchedule")}</Button>
        </div>
      </form>

      {/* Transiciones */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground">{t("changeStatus")}</h3>
        {isTerminal(status) ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("terminal", {
              status: statusT(ORDER_STATUS[status].key).toLocaleLowerCase(),
            })}
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {targets.map((to) => (
              to === "finalizada" && installerId ? (
                <RatingDialog key={to} orderId={orderId} mode="finalize" />
              ) : (
                <Button
                  key={to}
                  variant={to === "cancelada" ? "outline" : "default"}
                  disabled={pending}
                  onClick={() => doTransition(to)}
                  className="justify-start"
                >
                  {t(`transition.${to}`)}
                </Button>
              )
            ))}
          </div>
        )}
      </div>

      {status === "finalizada" && installerId ? (
        <div className="border-t pt-5">
          <h3 className="text-sm font-medium text-muted-foreground">
            {t("rating")}
          </h3>
          {rating ? (
            <div className="mt-2">
              <StarRating value={rating.stars} size="sm" />
              {rating.comment ? (
                <p className="mt-2 text-sm leading-relaxed">{rating.comment}</p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("noComment")}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-2">
              <p className="mb-3 text-sm text-muted-foreground">
                {t("notRated")}
              </p>
              <RatingDialog orderId={orderId} mode="rate" />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

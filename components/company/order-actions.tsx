"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { assignInstaller, rescheduleOrder } from "@/lib/actions/orders/assignment";
import { transitionOrder } from "@/lib/actions/orders/lifecycle";
import { ORDER_TRANSITIONS } from "@/lib/domain/transitions";
import { ORDER_STATUS } from "@/lib/domain/status";
import { Button } from "@/components/ui/button";
import { RatingDialog } from "@/components/company/rating-dialog";
import { StarRating } from "@/components/shared/star-rating";
import type { OrderStatus } from "@/types/database";

type Props = {
  orderId: string;
  orderNumber: string;
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
  orderNumber,
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
  const [reason, setReason] = useState("");
  // El gerente nunca "envía a revisión": eso lo hace el instalador asignado.
  // Él aprueba desde revisión, y puede reabrir o cancelar.
  //
  // Traslado y llegada quedan fuera por el mismo motivo: son hechos que sólo
  // sabe quien se está moviendo, y el trigger los rechaza para cualquier otro
  // (FLD-R1.2). Ofrecerlos acá sería ofrecer un botón condenado a fallar.
  //
  // La reapertura de una orden ya finalizada también sale de esta lista: pide
  // motivo obligatorio (FLD-R6.4) y va por su propio diálogo, no por el botón
  // genérico de cambio de estado.
  const targets = (ORDER_TRANSITIONS[status] ?? []).filter(
    (to) =>
      to !== "en_revision" &&
      to !== "en_camino" &&
      to !== "en_sitio" &&
      !(status === "finalizada" && to === "en_proceso"),
  );

  const doTransition = (to: OrderStatus) => {
    if (
      to === "cancelada" &&
      !window.confirm(t("cancelConfirm", { order: orderNumber }))
    ) {
      return;
    }

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
    if (id === installerId) return;

    const installer = id
      ? (roster.find((member) => member.id === id)?.name ?? "")
      : (roster.find((member) => member.id === installerId)?.name ?? "");
    const confirmed = window.confirm(
      id
        ? t("assignConfirm", { installer, order: orderNumber })
        : t("unassignConfirm", { installer, order: orderNumber }),
    );
    if (!confirmed) return;

    startTransition(async () => {
      const res = await assignInstaller(orderId, id);
      if (res.error) {
        toast.error(res.error);
      }
      else {
        toast.success(id ? t("assigned") : t("unassignedToast"));
        router.refresh();
      }
    });
  };

  const doReschedule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    startTransition(async () => {
      const res = await rescheduleOrder({ orderId, scheduledDate: startDate, scheduledEndDate: endDate, reason });
      if (res.error) toast.error(res.error);
      else {
        toast.success(t("rescheduledToast"));
        setReason("");
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
            onChange={(event) => {
              const value = event.target.value;
              // La asignación se confirma antes de persistir; mientras tanto
              // el selector conserva el valor que el servidor reconoce.
              event.currentTarget.value = installerId ?? "";
              doAssign(value);
            }}
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
          <label className="grid gap-1 text-xs text-muted-foreground">{t("rescheduleReason")}<input type="text" maxLength={600} value={reason} placeholder={t("rescheduleReasonPlaceholder")} onChange={(event) => setReason(event.target.value)} className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm" /></label>
          <p className="rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">{t("rescheduleNotice")}</p>
          <Button type="submit" size="sm" variant="outline" disabled={pending || !startDate}>{t("saveSchedule")}</Button>
        </div>
      </form>

      {/* Transiciones */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground">{t("changeStatus")}</h3>
        {/* Se pregunta por los destinos que quedan, no por `isTerminal`: una
            orden finalizada ya no es terminal (se puede reabrir) pero su
            reapertura va por otro camino, así que acá no queda ninguno. */}
        {targets.length === 0 ? (
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

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { recordSurvey, transitionOrder } from "@/lib/actions/orders/lifecycle";
import { allowedTransitions } from "@/lib/domain/order-rules";
import { ORDER_STATUS } from "@/lib/domain/status";
import { ORDER_TRANSITIONS } from "@/lib/domain/transitions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { OrderStatus } from "@/types/database";

/**
 * Acciones del coordinador sobre una orden, desde su ficha.
 *
 * Los botones se derivan de `allowedTransitions`, que espeja el trigger de la
 * base: si una regla bloquea el paso, el botón directamente no aparece.
 */
export function CoordinationOrderActions({
  orderId,
  orderNumber,
  status,
  assignedInstallerId,
  acceptedAt,
  hasSurvey,
  scheduledDate,
  viewerId,
}: {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  assignedInstallerId: string | null;
  acceptedAt: string | null;
  hasSurvey: boolean;
  scheduledDate: string | null;
  viewerId: string;
}) {
  const t = useTranslations("Coordination");
  const statusT = useTranslations("Status");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");

  const context = {
    status,
    assignedInstallerId,
    acceptedAt,
    hasSurvey,
    scheduledDate,
  };
  const actor = { id: viewerId };
  const options = allowedTransitions(context, actor, ORDER_TRANSITIONS[status]);

  const move = (to: OrderStatus) => {
    if (to === "cancelada" && !window.confirm(t("cancelConfirm", { number: orderNumber }))) {
      return;
    }
    startTransition(async () => {
      const res = await transitionOrder(orderId, to);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("moved", { number: orderNumber, status: statusT(ORDER_STATUS[to].key) }));
      router.refresh();
    });
  };

  const saveSurvey = () => {
    startTransition(async () => {
      const res = await recordSurvey({ orderId, note });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("surveySaved", { number: orderNumber }));
      setNote("");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {status === "relevamiento" && !hasSurvey ? (
        <div className="rounded-lg border border-dashed p-3">
          <p className="text-xs font-medium">{t("surveyTitle")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("surveyHelp")}</p>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            className="mt-2"
            placeholder={t("surveyPlaceholder")}
            disabled={pending}
          />
          <Button
            size="sm"
            className="mt-2"
            onClick={saveSurvey}
            disabled={pending || note.trim().length < 3}
          >
            {t("surveySave")}
          </Button>
        </div>
      ) : null}

      {options.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {options.map((to) => (
            <Button
              key={to}
              size="sm"
              variant={to === "finalizada" ? "default" : to === "cancelada" ? "ghost" : "outline"}
              onClick={() => move(to)}
              disabled={pending}
            >
              {t(`to.${to}`)}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("noActions")}</p>
      )}
    </div>
  );
}

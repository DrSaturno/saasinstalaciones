"use client";

import { useState, useTransition } from "react";
import { ClipboardCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { reviewOrderDelivery } from "@/lib/actions/orders/review";
import {
  availableDecisions,
  MIN_REASON_LENGTH,
  reviewNeedsReason,
  type ReviewDecision,
} from "@/lib/domain/review-decision";
import type { OrderStatus } from "@/types/database";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Las cuatro decisiones del coordinador, en un solo lugar.
 *
 * El motivo aparece sólo cuando hace falta: pedirlo para aprobar sería
 * fricción sin destinatario, y esconderlo en las otras tres dejaría al
 * instalador adivinando qué corregir.
 */
export function ReviewDeliveryDialog({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatus;
}) {
  const t = useTranslations("Review");
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  // Aprobar NO se ofrece acá: ya existe `RatingDialog mode="finalize"`, que
  // aprueba y además pide la calificación del instalador. Duplicar el cierre
  // habría dado dos botones que hacen casi lo mismo, y el que menos hace
  // —éste— se saltearía la calificación sin que nadie lo note. Este diálogo
  // aporta las tres decisiones que no existían: pedir evidencia, pedir
  // correcciones y reabrir.
  const decisions = availableDecisions(status).filter((option) => option !== "approve");
  if (decisions.length === 0) return null;

  const needsReason = decision ? reviewNeedsReason(decision) : false;
  const reasonReady = !needsReason || reason.trim().length >= MIN_REASON_LENGTH;

  const submit = () => {
    if (!decision) return;
    startTransition(async () => {
      const result = await reviewOrderDelivery({ orderId, decision, reason });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(t("returned"));
      setOpen(false);
      setDecision(null);
      setReason("");
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ClipboardCheck className="size-3.5" aria-hidden="true" />
          {t("title")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t("description")}</p>

        <fieldset className="mt-2 flex flex-col gap-2" disabled={pending}>
          <legend className="mb-1 text-sm font-medium">{t("decisionLabel")}</legend>
          {decisions.map((option) => (
            <label
              key={option}
              className={`flex cursor-pointer flex-col rounded-xl border px-3 py-2 transition-colors ${
                decision === option ? "border-primary bg-primary/5" : "hover:border-primary/40"
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="decision"
                  value={option}
                  checked={decision === option}
                  onChange={() => setDecision(option)}
                  className="accent-primary"
                />
                {t(option)}
              </span>
              <span className="pl-6 text-xs text-muted-foreground">{t(`${option}Help`)}</span>
            </label>
          ))}
        </fieldset>

        {needsReason ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="review-reason">{t("reasonLabel")}</Label>
            <Textarea
              id="review-reason"
              rows={3}
              maxLength={2000}
              placeholder={t("reasonPlaceholder")}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={pending}
            />
            {reason.trim().length > 0 && !reasonReady ? (
              <p className="text-xs text-muted-foreground">
                {t("reasonTooShort", { min: MIN_REASON_LENGTH })}
              </p>
            ) : null}
          </div>
        ) : null}

        <Button onClick={submit} disabled={pending || !decision || !reasonReady}>
          {pending ? t("submitting") : t("submit")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

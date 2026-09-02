"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CircleOff } from "lucide-react";
import { toast } from "sonner";
import { requestOrderCancellation } from "@/lib/actions/orders/cancellation";
import {
  CANCELLATION_REASONS,
  type CancellationReason,
} from "@/lib/domain/cancellation-reasons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const selectClass =
  "h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20";

/**
 * Pedir la baja de un trabajo.
 *
 * Se le dice de antemano si su pedido entra en plazo o va a revisión, porque
 * el requisito hace de esa diferencia toda la cuestión — y enterarse después
 * de haber apretado sería exactamente la sorpresa que busca evitar.
 *
 * El cartel es una **vista previa**: el plazo real lo recalcula el servidor al
 * guardar. Si alguna vez discreparan, manda el servidor; por eso el texto dice
 * qué va a pasar, no promete un resultado.
 */
export function RequestCancellationDialog({
  orderId,
  withinNotice,
  businessDaysLeft,
}: {
  orderId: string;
  withinNotice: boolean;
  businessDaysLeft: number;
}) {
  const t = useTranslations("RequestCancellation");
  const [open, setOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState<CancellationReason>("personal_emergency");
  const [reasonNote, setReasonNote] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const submit = () => {
    startTransition(async () => {
      const result = await requestOrderCancellation({ orderId, reasonCode, reasonNote });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(withinNotice ? t("doneInTime") : t("doneForReview"));
      setOpen(false);
      setReasonNote("");
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CircleOff className="size-3.5" aria-hidden="true" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <p
            className={
              withinNotice
                ? "rounded-lg border border-[var(--success)]/40 bg-surface p-3 text-sm leading-relaxed"
                : "rounded-lg border border-[var(--warning)]/50 bg-cream/40 p-3 text-sm leading-relaxed"
            }
          >
            {withinNotice
              ? t("inTime", { days: businessDaysLeft })
              : t("lateNotice")}
          </p>

          <div className="grid gap-2">
            <Label htmlFor={`cancel-reason-${orderId}`}>{t("reason")}</Label>
            <select
              id={`cancel-reason-${orderId}`}
              value={reasonCode}
              onChange={(event) =>
                setReasonCode(event.target.value as CancellationReason)
              }
              className={selectClass}
              disabled={pending}
            >
              {CANCELLATION_REASONS.map((code) => (
                <option key={code} value={code}>
                  {t(`reasons.${code}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`cancel-note-${orderId}`}>
              {withinNotice ? t("noteOptional") : t("noteRequired")}
            </Label>
            <textarea
              id={`cancel-note-${orderId}`}
              value={reasonNote}
              onChange={(event) => setReasonNote(event.target.value)}
              maxLength={600}
              rows={3}
              placeholder={t("notePlaceholder")}
              disabled={pending}
              className="w-full rounded-lg border border-input bg-transparent p-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
            {!withinNotice ? (
              <p className="text-xs text-muted-foreground">{t("noteHelp")}</p>
            ) : null}
          </div>

          <Button
            onClick={submit}
            disabled={pending || (!withinNotice && reasonNote.trim().length < 10)}
          >
            {pending ? t("sending") : t("submit")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { ShieldQuestion } from "lucide-react";
import { toast } from "sonner";
import { reviewOrderCancellation } from "@/lib/actions/orders/cancellation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

type Decision = "approved" | "rejected";

/**
 * Revisión de un pedido de baja fuera de plazo. Sólo lo ve el gerente.
 *
 * "Aprobar" y "justificada" son dos preguntas distintas y por eso son dos
 * controles: la empresa puede aceptar la baja sin considerarla justificada (la
 * deja ir, pero el incumplimiento existió) o rechazarla reconociendo que el
 * motivo era real. Colapsarlas en un botón perdería la diferencia, que es
 * justamente la que después decide si el evento pesa en la confiabilidad.
 *
 * El motivo se muestra tal cual lo escribió el instalador y no sale de esta
 * pantalla: es información sensible — salud, emergencias — y el requisito pide
 * minimizarla.
 */
export function CancellationReview({
  requestId,
  installerName,
  reasonLabel,
  reasonNote,
  requestedAt,
  scheduledDateAtRequest,
}: {
  requestId: string;
  installerName: string;
  reasonLabel: string;
  reasonNote: string;
  requestedAt: string;
  scheduledDateAtRequest: string | null;
}) {
  const t = useTranslations("CancellationReview");
  const format = useFormatter();
  const router = useRouter();
  const [justified, setJustified] = useState(true);
  const [note, setNote] = useState("");
  // Cuál de los dos botones se apretó, para no poner ambos en "Guardando…".
  const [sending, setSending] = useState<Decision | null>(null);
  const [pending, startTransition] = useTransition();

  const resolve = (decision: Decision) => {
    setSending(decision);
    startTransition(async () => {
      const result = await reviewOrderCancellation({
        requestId,
        decision,
        justified,
        note,
      });
      setSending(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(decision === "approved" ? t("approvedToast") : t("rejectedToast"));
      router.refresh();
    });
  };

  return (
    <Card className="border-[var(--warning)]/50 bg-cream/30">
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <ShieldQuestion
            className="mt-0.5 size-5 shrink-0 text-[var(--warning)]"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{t("title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("subtitle", { name: installerName })}
            </p>

            <dl className="mt-3 grid gap-1 text-sm">
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-muted-foreground">{t("reason")}</dt>
                <dd className="font-medium">{reasonLabel}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-muted-foreground">{t("requestedAt")}</dt>
                <dd>
                  {format.dateTime(new Date(requestedAt), { dateStyle: "long" })}
                </dd>
              </div>
              {scheduledDateAtRequest ? (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-muted-foreground">{t("scheduledThen")}</dt>
                  <dd>
                    {format.dateTime(
                      new Date(`${scheduledDateAtRequest}T12:00:00`),
                      { dateStyle: "long" },
                    )}
                  </dd>
                </div>
              ) : null}
            </dl>

            {reasonNote ? (
              <p className="mt-3 whitespace-pre-wrap rounded-lg border bg-surface p-3 text-sm">
                {reasonNote}
              </p>
            ) : null}

            <label className="mt-4 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={justified}
                onChange={(event) => setJustified(event.target.checked)}
                disabled={pending}
                className="mt-0.5 size-4 rounded border-input"
              />
              <span>
                {t("justified")}
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {t("justifiedHelp")}
                </span>
              </span>
            </label>

            <div className="mt-4 grid gap-2">
              <Label htmlFor={`review-note-${requestId}`}>{t("note")}</Label>
              <textarea
                id={`review-note-${requestId}`}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
                rows={2}
                placeholder={t("notePlaceholder")}
                disabled={pending}
                className="w-full rounded-lg border border-input bg-surface p-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={() => resolve("approved")}
                disabled={pending}
                className="sm:flex-1"
              >
                {sending === "approved" ? t("saving") : t("approve")}
              </Button>
              <Button
                variant="outline"
                onClick={() => resolve("rejected")}
                disabled={pending}
                className="sm:flex-1"
              >
                {sending === "rejected" ? t("saving") : t("reject")}
              </Button>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {t("privacyNote")}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

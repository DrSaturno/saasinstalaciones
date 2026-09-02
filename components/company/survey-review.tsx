"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { decideSurveySubmission } from "@/lib/actions/orders/survey";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

type Decision = "approved" | "changes_requested";

/**
 * La revisión del relevamiento. La ve el coordinador del proyecto (DEC-15).
 *
 * **Un solo campo de motivo, no cinco botones.** El requisito enumera cinco
 * cosas que el coordinador puede hacer: aprobar, pedir más información, pedir
 * nuevas fotos, pedir mediciones, o pedir otra visita. Las cuatro últimas son
 * la misma decisión —"esto no alcanza"— con distinto motivo. Cinco botones le
 * darían al instalador una etiqueta; un motivo escrito le dice qué falta, que
 * es lo que necesita para no volver a equivocarse.
 *
 * Cuando decide el gerente porque el proyecto no tiene coordinador, se dice.
 * Es una excepción, y una excepción que no se nombra deja de parecerlo.
 */
export function SurveyReview({
  submissionId,
  version,
  notes,
  submittedAt,
  authority,
}: {
  submissionId: string;
  version: number;
  notes: string;
  submittedAt: string | null;
  authority: "coordinator" | "manager_fallback";
}) {
  const t = useTranslations("SurveyReview");
  const format = useFormatter();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState<Decision | null>(null);
  const [pending, startTransition] = useTransition();

  const decide = (decision: Decision) => {
    setSending(decision);
    startTransition(async () => {
      const result = await decideSurveySubmission({
        submissionId,
        decision,
        reason,
      });
      setSending(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        decision === "approved" ? t("approvedToast") : t("changesToast"),
      );
      setReason("");
      router.refresh();
    });
  };

  const needsReason = reason.trim().length < 3;

  return (
    <Card className="border-[var(--warning)]/50 bg-cream/30">
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <ClipboardCheck
            className="mt-0.5 size-5 shrink-0 text-[var(--warning)]"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{t("title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("subtitle", { version })}
              {submittedAt
                ? ` · ${format.dateTime(new Date(submittedAt), { dateStyle: "medium" })}`
                : ""}
            </p>

            {authority === "manager_fallback" ? (
              <p className="mt-3 rounded-lg border border-primary/30 bg-primary-soft/30 p-3 text-xs leading-relaxed">
                {t("managerFallback")}
              </p>
            ) : null}

            {notes ? (
              <p className="mt-3 whitespace-pre-wrap rounded-lg border bg-surface p-3 text-sm">
                {notes}
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">{t("noNotes")}</p>
            )}

            <div className="mt-4 grid gap-2">
              <Label htmlFor={`survey-reason-${submissionId}`}>
                {t("reason")}
              </Label>
              <textarea
                id={`survey-reason-${submissionId}`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={1000}
                rows={3}
                placeholder={t("reasonPlaceholder")}
                disabled={pending}
                className="w-full rounded-lg border border-input bg-surface p-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
              <p className="text-xs text-muted-foreground">{t("reasonHelp")}</p>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={() => decide("approved")}
                disabled={pending}
                className="sm:flex-1"
              >
                {sending === "approved" ? t("saving") : t("approve")}
              </Button>
              <Button
                variant="outline"
                onClick={() => decide("changes_requested")}
                disabled={pending || needsReason}
                className="sm:flex-1"
              >
                {sending === "changes_requested" ? t("saving") : t("requestChanges")}
              </Button>
            </div>
            {needsReason ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("reasonRequired")}
              </p>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ClipboardList, CircleCheck, MessageSquareWarning } from "lucide-react";
import { toast } from "sonner";
import { submitSurvey } from "@/lib/actions/orders/survey";
import type { SurveyState } from "@/lib/data/surveys";
import {
  hasEnoughToSubmit,
  splitAnswers,
  type SurveyAnswers,
} from "@/lib/domain/survey-template";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

/**
 * El relevamiento visto por quien lo hace.
 *
 * Lo que más importa acá es el estado `changes_requested`: el instalador tiene
 * que ver **qué le pidieron**, textual, no un cartel que diga "rechazado".
 * Sin el motivo a la vista, la corrección es adivinanza y va a volver a
 * rebotar.
 *
 * Enviar y reenviar son el mismo botón. El servidor calcula la versión, y si
 * el contenido no cambió devuelve la que ya había en vez de crear otra: un
 * reintento no le hace creer al coordinador que hubo una corrección.
 */
export function SurveyPanel({ survey }: { survey: SurveyState }) {
  const t = useTranslations("SurveyPanel");
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [pending, startTransition] = useTransition();

  const setAnswer = (key: string, value: string | boolean) =>
    setAnswers((current) => ({ ...current, [key]: value }));

  const send = () => {
    // El reparto por tipo lo hace el dominio, que es donde está probado. El
    // componente sólo junta lo que la persona escribió.
    const { checklist, measurements, formData } = splitAnswers(
      survey.fields,
      answers,
    );
    startTransition(async () => {
      const result = await submitSurvey({
        activityId: survey.activityId,
        notes,
        checklist,
        measurements,
        formData,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(t("sentToast"));
      setNotes("");
      setAnswers({});
      router.refresh();
    });
  };

  const canWrite = survey.status === "none" || survey.status === "changes_requested";

  return (
    <Card
      className={
        survey.status === "approved"
          ? "mt-4 border-[var(--success)]/40"
          : survey.status === "changes_requested"
            ? "mt-4 border-[var(--warning)]/50 bg-cream/30"
            : "mt-4"
      }
    >
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          {survey.status === "approved" ? (
            <CircleCheck
              className="mt-0.5 size-5 shrink-0 text-[var(--success)]"
              aria-hidden="true"
            />
          ) : survey.status === "changes_requested" ? (
            <MessageSquareWarning
              className="mt-0.5 size-5 shrink-0 text-[var(--warning)]"
              aria-hidden="true"
            />
          ) : (
            <ClipboardList
              className="mt-0.5 size-5 shrink-0 text-primary"
              aria-hidden="true"
            />
          )}

          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{t("title")}</h2>

            {survey.status === "approved" ? (
              <p className="mt-1 text-sm text-muted-foreground">{t("approved")}</p>
            ) : survey.status === "submitted" ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {t("waiting", { version: survey.version })}
              </p>
            ) : survey.status === "changes_requested" ? (
              <>
                <p className="mt-1 text-sm font-medium">{t("changesTitle")}</p>
                {/* El motivo textual, no una etiqueta: es lo que le dice qué
                    corregir para no volver a rebotar. */}
                <p className="mt-2 whitespace-pre-wrap rounded-lg border bg-surface p-3 text-sm">
                  {survey.lastDecisionReason || t("noReason")}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">{t("empty")}</p>
            )}

            {canWrite ? (
              <div className="mt-4 grid gap-4">
                {/* Los campos vienen de la plantilla congelada en la actividad:
                    son los mismos que había cuando se creó el trabajo, así que
                    nadie queda respondiendo un formulario que le cambiaron
                    mientras estaba en el punto. */}
                {survey.fields.map((field) => (
                  <div key={field.key} className="grid gap-2">
                    {field.type === "check" ? (
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={answers[field.key] === true}
                          onChange={(event) =>
                            setAnswer(field.key, event.target.checked)
                          }
                          disabled={pending}
                          className="mt-0.5 size-4 rounded border-input"
                        />
                        <span>{field.label}</span>
                      </label>
                    ) : (
                      <>
                        <Label htmlFor={`f-${survey.activityId}-${field.key}`}>
                          {field.label}
                          {field.unit ? (
                            <span className="ml-1 text-muted-foreground">
                              ({field.unit})
                            </span>
                          ) : null}
                        </Label>
                        {field.type === "measure" ? (
                          <input
                            id={`f-${survey.activityId}-${field.key}`}
                            type="text"
                            inputMode="decimal"
                            value={String(answers[field.key] ?? "")}
                            onChange={(event) =>
                              setAnswer(field.key, event.target.value)
                            }
                            disabled={pending}
                            className="h-10 w-full rounded-lg border border-input bg-transparent px-3 font-mono text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
                          />
                        ) : (
                          <textarea
                            id={`f-${survey.activityId}-${field.key}`}
                            value={String(answers[field.key] ?? "")}
                            onChange={(event) =>
                              setAnswer(field.key, event.target.value)
                            }
                            maxLength={2000}
                            rows={2}
                            disabled={pending}
                            className="w-full rounded-lg border border-input bg-transparent p-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
                          />
                        )}
                      </>
                    )}
                  </div>
                ))}

                <div className="grid gap-2">
                  <Label htmlFor={`survey-notes-${survey.activityId}`}>
                    {survey.status === "changes_requested"
                      ? t("notesAgain")
                      : t("notes")}
                  </Label>
                  <textarea
                    id={`survey-notes-${survey.activityId}`}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    maxLength={4000}
                    rows={3}
                    placeholder={t("notesPlaceholder")}
                    disabled={pending}
                    className="w-full rounded-lg border border-input bg-transparent p-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
                  />
                </div>

                <Button
                  onClick={send}
                  disabled={
                    pending ||
                    (!hasEnoughToSubmit(survey.fields, answers) &&
                      notes.trim().length < 3)
                  }
                >
                  {pending
                    ? t("sending")
                    : survey.status === "changes_requested"
                      ? t("sendAgain")
                      : t("send")}
                </Button>
                <p className="text-xs text-muted-foreground">{t("minimum")}</p>
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";
import { waivePrerequisite } from "@/lib/actions/orders/survey";
import type { PrerequisiteState } from "@/lib/data/surveys";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

/**
 * Por qué la ejecución no puede arrancar todavía.
 *
 * La regla ya estaba enforced en la base desde agosto, pero lo único que
 * llegaba a la persona era `PREREQUISITE_SURVEY_NOT_APPROVED` al chocar contra
 * ella. Un código de error no le dice a nadie qué tiene que pasar para poder
 * avanzar; este cartel sí.
 *
 * `canWaive` lo decide el servidor (DEC-15) y se pasa como dato: si lo
 * dedujéramos acá, alguien vería un botón que siempre falla.
 */
export function PrerequisiteNotice({
  state,
  canWaive,
}: {
  state: PrerequisiteState;
  canWaive: boolean;
}) {
  const t = useTranslations("Prerequisite");
  const format = useFormatter();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const waive = () => {
    startTransition(async () => {
      const result = await waivePrerequisite({
        activityId: state.executionActivityId,
        reason,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(t("waivedToast"));
      setOpen(false);
      setReason("");
      router.refresh();
    });
  };

  // Ya dispensado: se muestra el motivo, que es el punto de haberlo pedido.
  if (state.waivedAt) {
    return (
      <Card className="border-[var(--warning)]/50 bg-cream/30">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <LockOpen
              className="mt-0.5 size-5 shrink-0 text-[var(--warning)]"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <h2 className="text-base font-semibold">{t("waivedTitle")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {format.dateTime(new Date(state.waivedAt), { dateStyle: "long" })}
              </p>
              <p className="mt-3 whitespace-pre-wrap rounded-lg border bg-surface p-3 text-sm">
                {state.waivedReason}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!state.blocked) return null;

  return (
    <Card className="border-[var(--warning)]/50 bg-cream/30">
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <Lock
            className="mt-0.5 size-5 shrink-0 text-[var(--warning)]"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{t("title")}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {t("explanation")}
            </p>

            {canWaive ? (
              open ? (
                <div className="mt-4 grid gap-2">
                  <Label htmlFor={`waive-${state.executionActivityId}`}>
                    {t("reason")}
                  </Label>
                  <textarea
                    id={`waive-${state.executionActivityId}`}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={500}
                    rows={3}
                    placeholder={t("reasonPlaceholder")}
                    disabled={pending}
                    className="w-full rounded-lg border border-input bg-surface p-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
                  />
                  <p className="text-xs text-muted-foreground">{t("reasonHelp")}</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      onClick={waive}
                      disabled={pending || reason.trim().length < 10}
                      className="sm:flex-1"
                    >
                      {pending ? t("saving") : t("confirmWaive")}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setOpen(false)}
                      disabled={pending}
                    >
                      {t("cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => setOpen(true)}
                >
                  {t("waive")}
                </Button>
              )
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

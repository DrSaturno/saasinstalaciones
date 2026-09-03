"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { CalendarClock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  addGlobalAbsence,
  cancelGlobalAbsence,
  saveGlobalWeeklyAvailability,
} from "@/lib/actions/global-availability";
import type { GlobalAvailability } from "@/lib/data/global-availability";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

type Row = { startsAt: string; endsAt: string };

/**
 * La disponibilidad propia del instalador, la que vale en todas las empresas.
 *
 * **Va arriba de la disponibilidad por empresa a propósito.** El orden en
 * pantalla cuenta la regla: primero lo que la persona decide, después lo que
 * cada empresa prefiere dentro de eso. Una empresa puede pedir menos horas de
 * las que alguien ofrece, nunca más (AG-R9).
 *
 * **Y esto no lo ve ninguna empresa.** Es lo que permite que la plataforma
 * sepa que alguien no está disponible sin contarle a una empresa que otra le
 * ocupó el martes.
 */
export function GlobalAvailabilityCard({
  availability,
}: {
  availability: GlobalAvailability;
}) {
  const t = useTranslations("GlobalAvailability");
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [rows, setRows] = useState<Record<number, Row>>(() => {
    const initial: Record<number, Row> = {};
    for (const day of WEEKDAYS) {
      const found = availability.weekly.find((item) => item.weekday === day);
      initial[day] = {
        startsAt: found?.startsAt ?? "",
        endsAt: found?.endsAt ?? "",
      };
    }
    return initial;
  });

  const [absence, setAbsence] = useState({ startsAt: "", endsAt: "", reason: "" });

  const setRow = (day: number, patch: Partial<Row>) =>
    setRows((current) => ({ ...current, [day]: { ...current[day], ...patch } }));

  const saveWeekly = () => {
    // Un día sin ninguna de las dos horas es «no trabajo ese día», y por eso no
    // viaja: la ausencia de ventana ES la respuesta.
    const entries = WEEKDAYS.flatMap((day) => {
      const row = rows[day];
      if (!row.startsAt || !row.endsAt) return [];
      return [{ weekday: day, startsAt: row.startsAt, endsAt: row.endsAt }];
    });

    startTransition(async () => {
      const result = await saveGlobalWeeklyAvailability(entries);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(t("weeklySaved"));
      router.refresh();
    });
  };

  const submitAbsence = () => {
    startTransition(async () => {
      const result = await addGlobalAbsence(absence);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setAbsence({ startsAt: "", endsAt: "", reason: "" });
      toast.success(t("absenceSaved"));
      router.refresh();
    });
  };

  const remove = (id: string) => {
    startTransition(async () => {
      const result = await cancelGlobalAbsence(id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(t("absenceRemoved"));
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-4 text-primary" />
          {t("title")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="text-sm font-medium">{t("weeklyTitle")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("weeklyHelp")}</p>
          <div className="mt-3 grid gap-2">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-xl border px-3 py-2"
              >
                <span className="text-sm">{t(`weekdays.${day}`)}</span>
                <Input
                  type="time"
                  aria-label={t("from")}
                  value={rows[day].startsAt}
                  onChange={(event) => setRow(day, { startsAt: event.target.value })}
                  disabled={pending}
                  className="w-32"
                />
                <Input
                  type="time"
                  aria-label={t("to")}
                  value={rows[day].endsAt}
                  onChange={(event) => setRow(day, { endsAt: event.target.value })}
                  disabled={pending}
                  className="w-32"
                />
              </div>
            ))}
          </div>
          <Button type="button" className="mt-3" onClick={saveWeekly} disabled={pending}>
            {t("saveWeekly")}
          </Button>
        </div>

        <div>
          <h3 className="text-sm font-medium">{t("absencesTitle")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("absencesHelp")}</p>

          {availability.absences.length > 0 ? (
            <ul className="mt-3 divide-y rounded-xl border">
              {availability.absences.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <div>
                    <p className="text-sm">
                      {format.dateTime(new Date(item.startsAt), {
                        dateStyle: "medium",
                      })}
                      {" → "}
                      {format.dateTime(new Date(item.endsAt), {
                        dateStyle: "medium",
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground">{item.reason}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(item.id)}
                    disabled={pending}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    {t("removeAbsence")}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">{t("noAbsences")}</p>
          )}

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="grid gap-1">
              <Label htmlFor="absence-from">{t("from")}</Label>
              <Input
                id="absence-from"
                type="date"
                value={absence.startsAt}
                onChange={(event) =>
                  setAbsence((current) => ({ ...current, startsAt: event.target.value }))
                }
                disabled={pending}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="absence-to">{t("to")}</Label>
              <Input
                id="absence-to"
                type="date"
                value={absence.endsAt}
                onChange={(event) =>
                  setAbsence((current) => ({ ...current, endsAt: event.target.value }))
                }
                disabled={pending}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="absence-reason">{t("reason")}</Label>
              <Input
                id="absence-reason"
                maxLength={500}
                value={absence.reason}
                onChange={(event) =>
                  setAbsence((current) => ({ ...current, reason: event.target.value }))
                }
                disabled={pending}
              />
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={submitAbsence}
            disabled={
              pending || !absence.startsAt || !absence.endsAt || absence.reason.trim().length < 2
            }
          >
            {t("addAbsence")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

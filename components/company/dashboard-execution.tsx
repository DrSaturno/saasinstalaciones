"use client";

import { useState } from "react";
import { CalendarRange, Gauge, TimerReset, Users } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { DashboardOverview } from "@/lib/data/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Ventanas de la agenda. Los datos siempre traen 15; acá se recorta. */
const AGENDA_RANGES = [7, 15] as const;

export function DashboardAgenda({ agenda }: Pick<DashboardOverview, "agenda">) {
  const t = useTranslations("Dashboard");
  const format = useFormatter();
  // Arranca en 7 días: es el horizonte con el que se planifica la semana. Los
  // 15 quedan a un click para ver si lo que viene después ya está cargado.
  const [days, setDays] = useState<number>(7);
  const visible = agenda.slice(0, days);

  return (
    <Card className="flex flex-col">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2"><CalendarRange className="size-4 text-primary" aria-hidden="true" /><CardTitle>{t("agendaTitle", { days })}</CardTitle></div>
          <div className="flex items-center gap-1">
            {AGENDA_RANGES.map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setDays(range)}
                aria-pressed={days === range}
                className={`rounded-full border px-2.5 py-1 text-caption font-medium transition-colors ${days === range ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                {t("agendaRange", { days: range })}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t("agendaDescription")}</p>
      </CardHeader>
      <CardContent className="flex-1 p-3">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {visible.map((day) => {
            const tone = day.load > 100
              ? "border-destructive/30 bg-red-50"
              : day.load >= 80
                ? "border-warning/40 bg-amber-50"
                : "border-border bg-muted/25";
            const bar = day.load > 100 ? "bg-destructive" : day.load >= 80 ? "bg-warning" : "bg-primary";
            return (
              <div key={day.date} className={`rounded-lg border p-2.5 ${tone}`}>
                <div className="flex items-baseline justify-between gap-1">
                  <p className="text-caption font-medium capitalize">{format.dateTime(new Date(`${day.date}T12:00:00Z`), { weekday: "short" })}</p>
                  <p className="font-mono text-caption text-muted-foreground">{format.dateTime(new Date(`${day.date}T12:00:00Z`), { day: "2-digit", month: "2-digit" })}</p>
                </div>
                <p className="mt-1.5 font-mono text-xl font-semibold leading-none">{day.total}</p>
                <p className="text-caption text-muted-foreground">{t("agendaJobs")}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, day.load)}%` }} />
                </div>
                <p className="mt-1 font-mono text-caption text-muted-foreground">{t("agendaLoad", { load: day.load, capacity: day.capacity })}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardCapacity({
  capacity,
  coordination,
  sla,
}: Pick<DashboardOverview, "capacity" | "coordination" | "sla">) {
  const t = useTranslations("Dashboard");

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
      <Card>
        <CardHeader className="border-b"><div className="flex items-center gap-2"><Gauge className="size-4 text-primary" aria-hidden="true" /><CardTitle>{t("capacityTitle")}</CardTitle></div></CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Instaladores: los únicos que consumen agenda, porque son los
              únicos a los que se les puede asignar una orden. */}
          <div>
            <p className="mb-2 text-caption font-medium uppercase tracking-wide text-muted-foreground">{t("capacityInstallers")}</p>
            <div className="grid grid-cols-2 gap-4">
              <Data label={t("availableToday")} value={`${capacity.availableToday}/${capacity.total}`} />
              <Data label={t("weeklyAssignments")} value={capacity.weeklyAssignments} />
              <Data label={t("freeSlots")} value={capacity.freeSlots} />
              <Data label={t("overloadedDays")} value={capacity.overloadedDays} danger={capacity.overloadedDays > 0} />
            </div>
          </div>
          {/* Coordinación: se mide por cobertura de proyectos, no por jornadas. */}
          <div className="border-t pt-4">
            <p className="mb-2 flex items-center gap-1.5 text-caption font-medium uppercase tracking-wide text-muted-foreground">
              <Users className="size-3" aria-hidden="true" />
              {t("capacityCoordinators")}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Data label={t("coordinatorsActive")} value={`${coordination.withProjects}/${coordination.total}`} />
              <Data label={t("coordinatedProjects")} value={coordination.projects} />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="border-b"><div className="flex items-center gap-2"><TimerReset className="size-4 text-primary" aria-hidden="true" /><CardTitle>{t("slaTitle")}</CardTitle></div></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <Data label={t("onTimeRate")} value={`${sla.onTimeRate}%`} />
          <Data label={t("averageAssignment")} value={t("hoursValue", { value: sla.averageAssignmentHours })} />
          <Data label={t("averageCompletion")} value={t("daysValue", { value: sla.averageCompletionDays })} />
          <Data label={t("averageDelay")} value={t("daysValue", { value: sla.averageDelayDays })} danger={sla.averageDelayDays > 0} />
          <Data label={t("rescheduled")} value={sla.rescheduled} />
          <div>
            <p className="font-mono text-lg font-semibold">{sla.completionChange === null ? t("newComparison") : `${sla.completionChange >= 0 ? "+" : ""}${sla.completionChange}%`}</p>
            <p className="text-caption text-muted-foreground">{t("monthComparison")}</p>
          </div>
          <Data label={t("cancelledLabel")} value={sla.cancelled} danger={sla.cancelled > 0} />
        </CardContent>
      </Card>
    </div>
  );
}

function Data({ label, value, danger = false }: { label: string; value: string | number; danger?: boolean }) {
  return (
    <div>
      <p className={`font-mono text-lg font-semibold ${danger ? "text-destructive" : ""}`}>{value}</p>
      <p className="text-caption leading-tight text-muted-foreground">{label}</p>
    </div>
  );
}

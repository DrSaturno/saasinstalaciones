import { CalendarRange, Gauge, TimerReset } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { DashboardOverview } from "@/lib/data/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DashboardAgenda({ agenda }: Pick<DashboardOverview, "agenda">) {
  const t = useTranslations("Dashboard");
  const format = useFormatter();

  return (
    <Card className="flex flex-col">
      <CardHeader className="border-b">
        <div className="flex items-center gap-2"><CalendarRange className="size-4 text-primary" aria-hidden="true" /><CardTitle>{t("agendaTitle")}</CardTitle></div>
        <p className="text-xs text-muted-foreground">{t("agendaDescription")}</p>
      </CardHeader>
      <CardContent className="flex-1 p-3">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {agenda.map((day) => {
            const tone = day.load > 100
              ? "border-destructive/30 bg-red-50"
              : day.load >= 80
                ? "border-warning/40 bg-amber-50"
                : "border-border bg-muted/25";
            const bar = day.load > 100 ? "bg-destructive" : day.load >= 80 ? "bg-warning" : "bg-primary";
            return (
              <div key={day.date} className={`rounded-lg border p-2.5 ${tone}`}>
                <div className="flex items-baseline justify-between gap-1">
                  <p className="text-[11px] font-medium capitalize">{format.dateTime(new Date(`${day.date}T12:00:00Z`), { weekday: "short" })}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{format.dateTime(new Date(`${day.date}T12:00:00Z`), { day: "2-digit", month: "2-digit" })}</p>
                </div>
                <p className="mt-1.5 font-mono text-xl font-semibold leading-none">{day.total}</p>
                <p className="text-[10px] text-muted-foreground">{t("agendaJobs")}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, day.load)}%` }} />
                </div>
                <p className="mt-1 font-mono text-[9px] text-muted-foreground">{t("agendaLoad", { load: day.load, capacity: day.capacity })}</p>
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
  sla,
}: Pick<DashboardOverview, "capacity" | "sla">) {
  const t = useTranslations("Dashboard");

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
      <Card>
        <CardHeader className="border-b"><div className="flex items-center gap-2"><Gauge className="size-4 text-primary" aria-hidden="true" /><CardTitle>{t("capacityTitle")}</CardTitle></div></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <Data label={t("availableToday")} value={`${capacity.availableToday}/${capacity.total}`} />
          <Data label={t("weeklyAssignments")} value={capacity.weeklyAssignments} />
          <Data label={t("freeSlots")} value={capacity.freeSlots} />
          <Data label={t("overloadedDays")} value={capacity.overloadedDays} danger={capacity.overloadedDays > 0} />
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
            <p className="text-[11px] text-muted-foreground">{t("monthComparison")}</p>
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
      <p className="text-[11px] leading-tight text-muted-foreground">{label}</p>
    </div>
  );
}

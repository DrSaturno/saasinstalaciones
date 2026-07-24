import { CalendarRange, Gauge, TimerReset } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { DashboardOverview } from "@/lib/data/dashboard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DashboardExecution({
  agenda,
  capacity,
  sla,
}: Pick<DashboardOverview, "agenda" | "capacity" | "sla">) {
  const t = useTranslations("Dashboard");
  const format = useFormatter();

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2"><CalendarRange className="size-4 text-primary" aria-hidden="true" /><CardTitle>{t("agendaTitle")}</CardTitle></div>
          <p className="text-xs text-muted-foreground">{t("agendaDescription")}</p>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <div className="grid min-w-[680px] grid-cols-7 divide-x">
            {agenda.map((day) => (
              <div key={day.date} className={`p-3 ${day.load > 100 ? "bg-red-50" : day.load >= 80 ? "bg-amber-50" : ""}`}>
                <p className="text-xs font-medium capitalize">{format.dateTime(new Date(`${day.date}T12:00:00Z`), { weekday: "short" })}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{format.dateTime(new Date(`${day.date}T12:00:00Z`), { day: "2-digit", month: "2-digit" })}</p>
                <p className="mt-4 font-mono text-2xl font-semibold">{day.total}</p>
                <p className="text-[11px] text-muted-foreground">{t("agendaJobs")}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${day.load > 100 ? "bg-destructive" : day.load >= 80 ? "bg-warning" : "bg-primary"}`} style={{ width: `${Math.min(100, day.load)}%` }} />
                </div>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">{t("agendaLoad", { load: day.load, capacity: day.capacity })}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

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
              {sla.cancelled > 0 ? <Badge variant="outline" className="mt-2">{t("cancelledCount", { count: sla.cancelled })}</Badge> : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
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

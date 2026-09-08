import {
  CalendarDays,
  ChartNoAxesCombined,
  CircleCheck,
  ClipboardClock,
  FolderKanban,
  Gauge,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { DashboardOverview } from "@/lib/data/dashboard";
import { Metric } from "@/components/shared/metric";

export function DashboardMetrics({ metrics }: { metrics: DashboardOverview["metrics"] }) {
  const t = useTranslations("Dashboard");

  // Donde el número se interpreta contra otro, ese otro va en `hint`. Un
  // «completadas: 3» no dice nada; «3 · de 12 hoy» sí.
  const items = [
    {
      label: t("jobsToday"),
      value: metrics.jobsToday,
      icon: CalendarDays,
    },
    {
      label: t("completedToday"),
      value: metrics.completedToday,
      icon: CircleCheck,
      hint: t("outOfToday", { total: metrics.jobsToday }),
      tone:
        metrics.jobsToday > 0 && metrics.completedToday >= metrics.jobsToday
          ? ("success" as const)
          : ("neutral" as const),
    },
    { label: t("pendingOrders"), value: metrics.pendingOrders, icon: ClipboardClock },
    { label: t("activeProjects"), value: metrics.activeProjects, icon: FolderKanban },
    { label: t("dailyRate"), value: `${metrics.dailyRate}%`, icon: Gauge },
    {
      label: t("overallRate"),
      value: `${metrics.overallRate}%`,
      icon: ChartNoAxesCombined,
    },
  ];

  // Seis tarjetas iguales en una sola fila: es el bloque que abre el tablero y
  // se lee de un barrido horizontal, sin que ninguna robe el foco.
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {items.map((item) => (
        <Metric
          key={item.label}
          label={item.label}
          value={item.value}
          hint={item.hint}
          icon={item.icon}
          tone={item.tone}
        />
      ))}
    </div>
  );
}

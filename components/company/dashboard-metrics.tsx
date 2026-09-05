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

  // «Trabajos de hoy» es la métrica que decide el día de quien coordina, así
  // que es la única destacada: seis números del mismo tamaño no tienen punto
  // focal, y eso era parte de por qué el tablero se veía plano.
  //
  // Donde el número se interpreta contra otro, ese otro va en `hint`. Un
  // «completadas: 3» no dice nada; «3 · de 12 hoy» sí.
  const items = [
    {
      label: t("jobsToday"),
      value: metrics.jobsToday,
      icon: CalendarDays,
      emphasis: true,
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

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {items.map((item, index) => (
        <Metric
          key={item.label}
          label={item.label}
          value={item.value}
          hint={item.hint}
          icon={item.icon}
          tone={item.tone}
          emphasis={item.emphasis}
          // La principal ocupa el doble de ANCHO, no de alto: estirarla a dos
          // filas la dejaba casi vacía y el punto focal pasaba a ser el hueco.
          className={index === 0 ? "col-span-2" : undefined}
        />
      ))}
    </div>
  );
}

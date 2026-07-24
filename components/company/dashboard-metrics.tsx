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
import { Card, CardContent } from "@/components/ui/card";

const metricIcons = [FolderKanban, ClipboardClock, CalendarDays, CircleCheck, Gauge, ChartNoAxesCombined];

export function DashboardMetrics({ metrics }: { metrics: DashboardOverview["metrics"] }) {
  const t = useTranslations("Dashboard");
  const items = [
    { label: t("activeProjects"), value: metrics.activeProjects },
    { label: t("pendingOrders"), value: metrics.pendingOrders },
    { label: t("jobsToday"), value: metrics.jobsToday },
    { label: t("completedToday"), value: metrics.completedToday },
    { label: t("dailyRate"), value: `${metrics.dailyRate}%` },
    { label: t("overallRate"), value: `${metrics.overallRate}%` },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
      {items.map((item, index) => {
        const Icon = metricIcons[index];
        return (
          <Card key={item.label} className="min-h-28 justify-between py-4 sm:min-h-32">
            <CardContent className="flex h-full flex-col justify-between gap-4 px-4">
              <Icon className="size-4 text-primary" aria-hidden="true" />
              <div>
                <p className="font-mono text-2xl font-semibold tracking-tight">{item.value}</p>
                <p className="mt-1 text-xs leading-tight text-muted-foreground">{item.label}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

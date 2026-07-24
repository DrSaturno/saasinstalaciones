import { MapPinned, Timer, UsersRound } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { DashboardOverview } from "@/lib/data/dashboard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DashboardInsights({ regions, installers }: Pick<DashboardOverview, "regions" | "installers">) {
  const t = useTranslations("Dashboard");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="border-b"><div className="flex items-center gap-2"><MapPinned className="size-4 text-primary" aria-hidden="true" /><CardTitle>{t("regionsTitle")}</CardTitle></div></CardHeader>
        <CardContent className="max-h-[520px] overflow-y-auto px-0">
          {regions.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("emptyRegions")}</p> : regions.map((region) => (
            <div key={region.name} className="border-b px-4 py-3 last:border-b-0">
              <div className="flex items-center justify-between"><p className="font-mono text-sm font-semibold">{region.name}</p><p className="font-mono text-xs text-muted-foreground">{region.progress}%</p></div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${region.progress}%` }} /></div>
              <p className="mt-2 text-xs text-muted-foreground">{t("regionSites", { done: region.completedSites, total: region.sites })}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="border-b"><div className="flex items-center gap-2"><UsersRound className="size-4 text-primary" aria-hidden="true" /><CardTitle>{t("installersTitle")}</CardTitle></div></CardHeader>
        <CardContent className="px-0">
          {installers.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("emptyInstallers")}</p> : installers.map((installer) => (
            <div key={installer.id} className="border-b px-4 py-3 last:border-b-0">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0"><Link href={`/messages/${installer.id}`} className="truncate font-medium hover:text-primary">{installer.name}</Link><p className="truncate text-xs text-muted-foreground">{installer.reason ?? t("installerOrders", { count: installer.openOrders })}</p></div>
                <div className="flex shrink-0 items-center gap-2"><span className="font-mono text-xs text-muted-foreground">★ {installer.rating.toFixed(1)}</span><Badge variant={installer.available ? "default" : "outline"}>{installer.available ? t("available") : t("unavailable")}</Badge></div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-muted/45 p-2 text-center">
                <div><p className="font-mono text-xs font-semibold">{installer.completed}</p><p className="text-[10px] text-muted-foreground">{t("installerCompleted")}</p></div>
                <div><p className="font-mono text-xs font-semibold">{installer.onTimeRate}%</p><p className="text-[10px] text-muted-foreground">{t("installerOnTime")}</p></div>
                <div><p className="font-mono text-xs font-semibold">{installer.firstResolutionRate}%</p><p className="text-[10px] text-muted-foreground">{t("installerFirstTime")}</p></div>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><Timer className="size-3" aria-hidden="true" />{t("installerAverage", { value: installer.averageDays })}</span>
                <span>{t("installerRescheduled", { count: installer.rescheduled })}</span>
                <span>{t("installerIncidents", { count: installer.incidents })}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

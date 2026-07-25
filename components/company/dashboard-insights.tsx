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
        <CardContent className="max-h-[580px] overflow-y-auto px-0">
          {installers.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("emptyInstallers")}</p> : installers.map((installer) => (
            <div key={installer.id} className="border-b px-4 py-3 last:border-b-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Link href={`/messages/${installer.id}`} className="truncate text-[15px] font-semibold hover:text-primary">{installer.name}</Link>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">★ {installer.rating.toFixed(1)}</span>
                </div>
                <Badge variant={installer.available ? "default" : "outline"} className="shrink-0">{installer.available ? t("available") : t("unavailable")}</Badge>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">{installer.reason ?? t("installerOrders", { count: installer.openOrders })}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <Stat value={installer.completed} label={t("installerCompleted")} />
                <Stat value={`${installer.onTimeRate}%`} label={t("installerOnTime")} />
                <Stat value={`${installer.firstResolutionRate}%`} label={t("installerFirstTime")} />
                <span className="flex items-center gap-1.5"><Timer className="size-3.5 shrink-0" aria-hidden="true" />{t("installerAverage", { value: installer.averageDays })}</span>
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

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <span className="whitespace-nowrap"><b className="font-mono text-sm font-semibold text-foreground">{value}</b> {label}</span>
  );
}

import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CircleCheck, CloudRainWind } from "lucide-react";
import { useTranslations } from "next-intl";
import type { DashboardOverview } from "@/lib/data/dashboard";
import type { ZoneForecast } from "@/lib/weather/forecast";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DashboardPulse({
  alerts,
  forecasts,
}: {
  alerts: DashboardOverview["alerts"];
  forecasts: ZoneForecast[];
}) {
  const t = useTranslations("Dashboard");
  const weatherAlerts = forecasts.filter((item) => item.severity !== "ok");
  const total = alerts.length + weatherAlerts.length;

  return (
    <Card className="overflow-hidden border-primary/25">
      <CardHeader className="border-b bg-[linear-gradient(100deg,color-mix(in_oklab,var(--primary)_10%,var(--card)),var(--card)_60%)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <span className="absolute inset-0 animate-ping rounded-full bg-primary/25 motion-reduce:hidden" />
              <AlertTriangle className="relative size-3.5" aria-hidden="true" />
            </span>
            <div>
              <CardTitle>{t("pulseTitle")}</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("pulseDescription")}</p>
            </div>
          </div>
          <Badge variant={total ? "outline" : "default"} className={total ? "border-amber-300 bg-amber-50 text-amber-900" : ""}>
            {total ? t("pulseCount", { count: total }) : t("pulseClear")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {total === 0 ? (
          <div className="flex items-center gap-3 px-5 py-5 text-sm">
            <CircleCheck className="size-5 text-success" aria-hidden="true" />
            <p>{t("pulseEmpty")}</p>
          </div>
        ) : (
          <div className="grid divide-y lg:grid-cols-2 lg:divide-x lg:divide-y-0">
            <div className="divide-y">
              {alerts.map((alert) => (
                <Link key={alert.id} href={alert.href} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                  <span className={`size-2 shrink-0 rounded-full ${alert.severity === "danger" ? "bg-destructive" : "bg-warning"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{t(`alerts.${alert.kind}`, { count: alert.count })}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">{alert.subject}</p>
                  </div>
                  <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              ))}
            </div>
            <div className="divide-y">
              {weatherAlerts.map((forecast) => (
                <div key={forecast.name} className="flex items-center gap-3 px-4 py-3">
                  <CloudRainWind className="size-4 shrink-0 text-warning" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{t("weatherRisk", { zone: forecast.name })}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{t("weatherRiskDetail", { rain: forecast.rain, wind: Math.round(forecast.wind) })}</p>
                  </div>
                  <Badge variant={forecast.severity === "danger" ? "destructive" : "outline"}>{t(`weatherSeverity.${forecast.severity}`)}</Badge>
                </div>
              ))}
              {weatherAlerts.length === 0 ? <p className="px-4 py-5 text-sm text-muted-foreground">{t("weatherNoRisk")}</p> : null}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


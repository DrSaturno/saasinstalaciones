import { CalendarClock, CloudSun, CloudSunRain, Wind } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ZoneForecast } from "@/lib/weather/forecast";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarControls } from "@/components/company/calendar-controls";

export function DashboardOperations({ forecasts, calendarEmail, calendarConfigured }: { forecasts: ZoneForecast[]; calendarEmail: string | null; calendarConfigured: boolean }) {
  const t = useTranslations("Dashboard");

  return (
    <section className="grid gap-3 lg:grid-cols-[1fr_340px]" aria-label={t("operationalStrip")}>
      <Card className="border-primary/20 bg-[linear-gradient(135deg,var(--card),color-mix(in_oklab,var(--primary)_7%,var(--card)))]">
        <CardHeader className="border-b">
          <div className="flex items-center gap-2"><CloudSun className="size-4 text-primary" aria-hidden="true" /><CardTitle>{t("weatherTitle")}</CardTitle></div>
          <p className="text-xs text-muted-foreground">{t("weatherDescription")}</p>
        </CardHeader>
        <CardContent>
          {forecasts.length === 0 ? <p className="py-4 text-sm text-muted-foreground">{t("weatherEmpty")}</p> : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {forecasts.map((forecast) => (
                <div key={forecast.name} className="rounded-xl border bg-background/80 p-3">
                  <div className="flex items-center justify-between gap-2"><p className="font-mono text-xs font-semibold">{forecast.name}</p><Badge variant={forecast.severity === "danger" ? "destructive" : "outline"} className={forecast.severity === "warning" ? "border-amber-300 bg-amber-50 text-amber-800" : ""}>{t(`weatherSeverity.${forecast.severity}`)}</Badge></div>
                  <p className="mt-3 font-mono text-xl font-semibold">{Math.round(forecast.max)}° <span className="text-sm font-normal text-muted-foreground">/ {Math.round(forecast.min)}°</span></p>
                  <div className="mt-2 flex gap-3 text-[11px] text-muted-foreground"><span className="flex items-center gap-1"><CloudSunRain className="size-3" aria-hidden="true" />{forecast.rain}%</span><span className="flex items-center gap-1"><Wind className="size-3" aria-hidden="true" />{Math.round(forecast.wind)} km/h</span></div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="border-b"><div className="flex items-center gap-2"><CalendarClock className="size-4 text-primary" aria-hidden="true" /><CardTitle>{t("calendarTitle")}</CardTitle></div></CardHeader>
        <CardContent>
          <Badge variant={calendarEmail ? "default" : "outline"}>{calendarEmail ? t("connected") : t("notConnected")}</Badge>
          <p className="mt-3 text-sm font-medium">{calendarEmail ?? t("calendarPending")}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("calendarDescription")}</p>
          <CalendarControls configured={calendarConfigured} connected={Boolean(calendarEmail)} />
        </CardContent>
      </Card>
    </section>
  );
}

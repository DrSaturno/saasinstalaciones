import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarOff,
  CalendarRange,
  ClipboardList,
  Megaphone,
  Navigation,
  Wrench,
} from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { getCurrentUser, ROLE_HOME } from "@/lib/auth";
import { fetchInstallerHome } from "@/lib/data/installer-home";
import { createClient } from "@/lib/supabase/server";
import { fetchZoneForecasts } from "@/lib/weather/forecast";
import { googleMapsHref } from "@/lib/domain/sites";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Fecha local del instalador; el dominio opera en AR/BR. */
function localDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function InstallerHomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "installer") redirect(ROLE_HOME[user.role]);

  const [t, format, supabase] = await Promise.all([
    getTranslations("InstallerHome"),
    getFormatter(),
    createClient(),
  ]);
  const today = localDate();
  const home = await fetchInstallerHome(supabase, today);
  const forecasts = await fetchZoneForecasts(home.zones);
  const firstName = user.fullName.split(" ")[0] || user.fullName;
  const maps = home.nextJob
    ? googleMapsHref({
        lat: home.nextJob.lat,
        lng: home.nextJob.lng,
        address: home.nextJob.address,
        city: home.nextJob.city,
      })
    : null;

  return (
    <div className="mx-auto max-w-2xl">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t("greeting", { name: firstName })}</h1>
        <p className="mt-1 text-sm capitalize text-muted-foreground">
          {format.dateTime(new Date(`${today}T12:00:00Z`), {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <Stat label={t("assigned")} value={home.stats.assigned} />
        <Stat label={t("inProgress")} value={home.stats.inProgress} highlight />
        <Stat label={t("doneToday")} value={home.stats.doneToday} />
        <Stat label={t("pending")} value={home.stats.pending} />
      </div>

      <Card className="mt-4">
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <Navigation className="size-4 text-primary" aria-hidden="true" />
            <CardTitle>{t("nextJob")}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {home.nextJob ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/tasks/${home.nextJob.id}`}
                    className="font-medium hover:text-primary"
                  >
                    {home.nextJob.title}
                  </Link>
                  <p className="font-mono text-xs text-muted-foreground">
                    {home.nextJob.orderNumber}
                  </p>
                </div>
                <StatusBadge status={home.nextJob.status} kind="order" />
              </div>
              <p className="text-sm text-muted-foreground">
                {[home.nextJob.siteName, home.nextJob.address, home.nextJob.city]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {home.nextJob.scheduledDate ? (
                <p className="font-mono text-xs text-muted-foreground">
                  {format.dateTime(new Date(`${home.nextJob.scheduledDate}T12:00:00Z`), {
                    dateStyle: "medium",
                  })}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link href={`/tasks/${home.nextJob.id}`}>{t("openJob")}</Link>
                </Button>
                {maps ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={maps} target="_blank" rel="noreferrer">
                      {t("directions")}
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("noNextJob")}</p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <CalendarRange className="size-4 text-primary" aria-hidden="true" />
            <CardTitle>{t("week")}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-7 gap-1.5">
          {home.week.map((day, index) => (
            <div
              key={day.date}
              className={`rounded-lg border p-1.5 text-center ${
                index === 0 ? "border-primary/40 bg-primary-soft/25" : ""
              }`}
            >
              <p className="text-[10px] capitalize text-muted-foreground">
                {format.dateTime(new Date(`${day.date}T12:00:00Z`), { weekday: "narrow" })}
              </p>
              <p className="font-mono text-base font-semibold leading-tight">{day.total}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {forecasts.length ? (
        <Card className="mt-4">
          <CardHeader className="border-b">
            <CardTitle>{t("weather")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {forecasts.map((zone) => (
              <div key={zone.name} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium">{zone.name}</span>
                <span
                  className={`font-mono text-xs ${
                    zone.severity === "danger"
                      ? "text-destructive"
                      : zone.severity === "warning"
                        ? "text-amber-700"
                        : "text-muted-foreground"
                  }`}
                >
                  {Math.round(zone.max)}° / {Math.round(zone.min)}° · {Math.round(zone.wind)} km/h
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <Megaphone className="size-4 text-primary" aria-hidden="true" />
            <CardTitle>{t("announcements")}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {home.announcements.length ? (
            home.announcements.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl border p-3 ${
                  item.severity === "critical"
                    ? "border-destructive/30 bg-destructive/5"
                    : item.severity === "warning"
                      ? "border-warning/40 bg-amber-50/60"
                      : ""
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-medium">{item.title}</p>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {format.relativeTime(new Date(item.createdAt))}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  {item.body}
                </p>
                {item.companyName ? (
                  <p className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                    {item.companyName}
                  </p>
                ) : null}
              </div>
            ))
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t("noAnnouncements")}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <CalendarOff className="size-4 text-primary" aria-hidden="true" />
            <CardTitle>{t("absences")}</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground">{t("absencesHelp")}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {home.unavailability.length ? (
            home.unavailability.map((item) => (
              <div key={item.id} className="rounded-xl border px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-sm">{item.reason}</p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                      item.status === "approved"
                        ? "bg-success/15 text-green-700"
                        : item.status === "rejected"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-warning/15 text-amber-700"
                    }`}
                  >
                    {t(`absenceStatus.${item.status}`)}
                  </span>
                </div>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {format.dateTime(new Date(item.startsAt), { dateStyle: "short" })} →{" "}
                  {format.dateTime(new Date(item.endsAt), { dateStyle: "short" })}
                </p>
                {item.reviewNote ? (
                  <p className="mt-1 text-[11px] italic text-muted-foreground">{item.reviewNote}</p>
                ) : null}
              </div>
            ))
          ) : (
            <p className="py-2 text-sm text-muted-foreground">{t("noAbsences")}</p>
          )}
          <Button asChild variant="outline" size="sm" className="mt-1 sm:self-start">
            <Link href="/profile">{t("declareAbsence")}</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button asChild variant="outline">
          <Link href="/tasks">
            <ClipboardList className="size-4" aria-hidden="true" />
            {t("myOrders")}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/jobs">
            <Wrench className="size-4" aria-hidden="true" />
            {t("findJobs")}
          </Link>
        </Button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-card p-3 shadow-premium ${
        highlight && value > 0 ? "border-primary/40 bg-primary-soft/20" : ""
      }`}
    >
      <p className="font-mono text-2xl font-semibold leading-none">{value}</p>
      <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{label}</p>
    </div>
  );
}

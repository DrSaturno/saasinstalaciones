import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DashboardInsights } from "@/components/company/dashboard-insights";
import { DashboardExecution } from "@/components/company/dashboard-execution";
import { DashboardFinancePulse } from "@/components/company/dashboard-finance-pulse";
import { DashboardMap } from "@/components/company/dashboard-map";
import { DashboardMetrics } from "@/components/company/dashboard-metrics";
import { DashboardOperations } from "@/components/company/dashboard-operations";
import { DashboardPulse } from "@/components/company/dashboard-pulse";
import { DashboardProjects } from "@/components/company/dashboard-projects";
import { DashboardQuality } from "@/components/company/dashboard-quality";
import { DashboardQuickActions } from "@/components/company/dashboard-quick-actions";
import { DashboardTodayOrders } from "@/components/company/dashboard-today-orders";
import { Button } from "@/components/ui/button";
import { fetchDashboardOverview } from "@/lib/data/dashboard";
import { createClient } from "@/lib/supabase/server";
import { fetchZoneForecasts } from "@/lib/weather/forecast";
import { googleCalendarConfigured } from "@/lib/google-calendar/config";
import type { Country } from "@/types/database";

export default async function CompanyDashboard() {
  const [t, supabase] = await Promise.all([
    getTranslations("Dashboard"),
    createClient(),
  ]);
  const [{ data: company }, { data: calendar }] = await Promise.all([
    supabase.from("companies").select("country").limit(1).maybeSingle(),
    supabase.from("calendar_connections").select("google_email").limit(1).maybeSingle(),
  ]);
  const overview = await fetchDashboardOverview(supabase, (company?.country ?? "AR") as Country);
  const forecasts = await fetchZoneForecasts(overview.weatherZones);

  return (
    <main className="mx-auto max-w-[1480px] space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t("eyebrow")}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <Button asChild variant="outline"><Link href="/orders">{t("viewOrders")}</Link></Button>
      </header>

      <DashboardMetrics metrics={overview.metrics} />
      <DashboardPulse alerts={overview.alerts} forecasts={forecasts} />
      <DashboardQuickActions />
      <DashboardOperations forecasts={forecasts} calendarEmail={calendar?.google_email ?? null} calendarConfigured={googleCalendarConfigured()} />
      <DashboardExecution agenda={overview.agenda} capacity={overview.capacity} sla={overview.sla} />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <DashboardProjects projects={overview.projects} />
        <DashboardTodayOrders orders={overview.todayOrders} />
      </section>

      <DashboardInsights regions={overview.regions} installers={overview.installers} />
      <DashboardQuality quality={overview.quality} incidents={overview.incidents} />
      <DashboardMap sites={overview.mapSites} availableInstallers={overview.capacity.availableToday} />
      <DashboardFinancePulse finances={overview.finances} />
    </main>
  );
}

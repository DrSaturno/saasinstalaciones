import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AnnouncementComposer } from "@/components/company/announcement-composer";
import { DashboardInsights } from "@/components/company/dashboard-insights";
import { DashboardAgenda, DashboardCapacity } from "@/components/company/dashboard-execution";
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
import { CreateProjectDialog } from "@/components/company/create-project-dialog";
import { CreateBroadcastDialog } from "@/components/company/create-broadcast-dialog";
import { CreateOrderDialog } from "@/components/company/create-order-dialog";
import { fetchBroadcastBoard } from "@/lib/data/broadcasts";
import { DashboardOrderAction } from "@/components/company/dashboard-order-actions";
import { fetchClients } from "@/lib/data/clients";
import { fetchCoordinators } from "@/lib/data/team";
import { fetchActiveRoster, fetchAllOrders } from "@/lib/data/orders";
import { fetchCompanyCurrency, fetchOrderFormProjects } from "@/lib/data/order-form";

export default async function CompanyDashboard() {
  const [t, supabase] = await Promise.all([
    getTranslations("Dashboard"),
    createClient(),
  ]);
  const [{ data: company }, { data: calendar }] = await Promise.all([
    supabase.from("companies").select("country").limit(1).maybeSingle(),
    supabase.from("calendar_connections").select("google_email").limit(1).maybeSingle(),
  ]);
  const [overview, clients, coordinators, roster, orders, projects, currency, board] =
    await Promise.all([
      fetchDashboardOverview(supabase, (company?.country ?? "AR") as Country),
      fetchClients(supabase),
      fetchCoordinators(supabase),
      fetchActiveRoster(supabase),
      fetchAllOrders(supabase),
      fetchOrderFormProjects(supabase),
      fetchCompanyCurrency(supabase),
      fetchBroadcastBoard(supabase),
    ]);
  const forecasts = await fetchZoneForecasts(overview.weatherZones);

  return (
    <main className="mx-auto max-w-[1480px] space-y-6">
      <header>
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t("eyebrow")}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </header>

      <DashboardMetrics metrics={overview.metrics} />
      <DashboardQuickActions
        newProject={
          <CreateProjectDialog
            clients={clients.map(({ id, name }) => ({ id, name }))}
            coordinators={coordinators}
            canManageFinance
            trigger={<Button variant="outline">{t("quickActions.newProject")}</Button>}
          />
        }
        urgentOrder={
          <CreateOrderDialog
            projects={projects}
            roster={roster}
            currency={currency}
            canManageFinance
            trigger={<Button variant="outline">{t("quickActions.urgentOrder")}</Button>}
          />
        }
        assignPending={<DashboardOrderAction mode="assign" orders={orders.filter((order) => !order.installer_id && !["finalizada", "cancelada"].includes(order.status))} roster={roster} />}
        reschedule={<DashboardOrderAction mode="reschedule" orders={orders.filter((order) => order.scheduled_date && !["finalizada", "cancelada"].includes(order.status))} roster={roster} />}
        approve={<DashboardOrderAction mode="approve" orders={orders.filter((order) => order.status === "en_revision")} roster={roster} />}
        viewOrders={<Button asChild variant="outline"><Link href="/orders">{t("quickActions.viewOrders")}</Link></Button>}
        postJob={
          <CreateBroadcastDialog
            projects={board.projects}
            zones={board.zones}
            canManageFinance
            trigger={<Button variant="outline">{t("quickActions.postJob")}</Button>}
          />
        }
        myJobs={<Button asChild variant="outline"><Link href="/broadcasts?filter=open">{t("quickActions.myJobs")}</Link></Button>}
        applications={<Button asChild variant="outline"><Link href="/broadcasts?filter=applications">{t("quickActions.applications")}</Link></Button>}
      />
      <AnnouncementComposer
        zones={overview.regions.map((region) => region.name)}
        projects={projects.map(({ id, name }) => ({ id, name }))}
      />
      <DashboardPulse alerts={overview.alerts} forecasts={forecasts} />
      <DashboardOperations forecasts={forecasts} calendarEmail={calendar?.google_email ?? null} calendarConfigured={googleCalendarConfigured()} />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.85fr)]">
        <DashboardAgenda agenda={overview.agenda} />
        <DashboardTodayOrders orders={overview.todayOrders} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
        <DashboardProjects projects={overview.projects} />
        <DashboardCapacity capacity={overview.capacity} sla={overview.sla} />
      </section>

      <DashboardInsights regions={overview.regions} installers={overview.installers} />
      <DashboardQuality quality={overview.quality} incidents={overview.incidents} />
      <DashboardMap sites={overview.mapSites} availableInstallers={overview.capacity.availableToday} />
    </main>
  );
}

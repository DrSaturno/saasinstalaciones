import { getTranslations } from "next-intl/server";
import { AnnouncementComposer } from "@/components/company/announcement-composer";
import { DashboardApplicationsPeek } from "@/components/company/dashboard-applications-peek";
import { DashboardFinancePulse } from "@/components/company/dashboard-finance-pulse";
import { DashboardInsights } from "@/components/company/dashboard-insights";
import { DashboardJobsPeek } from "@/components/company/dashboard-jobs-peek";
import { DashboardOrdersPeek } from "@/components/company/dashboard-orders-peek";
import { DashboardAgenda, DashboardCapacity } from "@/components/company/dashboard-execution";
import { DashboardMap } from "@/components/company/dashboard-map";
import { DashboardMetrics } from "@/components/company/dashboard-metrics";
import { DashboardOperations } from "@/components/company/dashboard-operations";
import { DashboardPulse } from "@/components/company/dashboard-pulse";
import { DashboardProjects } from "@/components/company/dashboard-projects";
import { DashboardQuality } from "@/components/company/dashboard-quality";
import { DashboardQuickActions } from "@/components/company/dashboard-quick-actions";
import { DashboardSection } from "@/components/company/dashboard-section";
import { DashboardTodayOrders } from "@/components/company/dashboard-today-orders";
import { Button } from "@/components/ui/button";
import { fetchPublishedAnnouncements, fetchRosterZones } from "@/lib/data/announcements";
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
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
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
  const country = (company?.country ?? "AR") as Country;
  const [overview, clients, coordinators, roster, orders, projects, currency, board, announcements, rosterZones] =
    await Promise.all([
      fetchDashboardOverview(supabase, country),
      fetchClients(supabase),
      fetchCoordinators(supabase),
      fetchActiveRoster(supabase),
      fetchAllOrders(supabase),
      fetchOrderFormProjects(supabase),
      fetchCompanyCurrency(supabase),
      fetchBroadcastBoard(supabase),
      fetchPublishedAnnouncements(supabase),
      fetchRosterZones(supabase),
    ]);
  const forecasts = await fetchZoneForecasts(overview.weatherZones);

  return (
    <PageContainer asChild>
      <main className="space-y-6">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

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
        viewOrders={<DashboardOrdersPeek orders={orders.filter((order) => !["finalizada", "cancelada"].includes(order.status))} />}
        postJob={
          <CreateBroadcastDialog
            projects={board.projects}
            clients={board.clients}
            zones={board.zones}
            canManageFinance
            trigger={<Button variant="outline">{t("quickActions.postJob")}</Button>}
          />
        }
        myJobs={<DashboardJobsPeek broadcasts={board.broadcasts.filter((broadcast) => broadcast.status === "open")} />}
        applications={<DashboardApplicationsPeek broadcasts={board.broadcasts} />}
      />
      {/* Las zonas salen del roster, no de dónde hay obra: el fan-out matchea
          contra `installers.zones`, así que ofrecer provincias sin gente era
          ofrecer publicar a cero personas. */}
      <AnnouncementComposer
        zones={rosterZones}
        projects={projects.map(({ id, name }) => ({ id, name }))}
        history={announcements}
      />

      <DashboardSection title={t("sections.generalTitle")} description={t("sections.generalDescription")}>
        <DashboardMetrics metrics={overview.metrics} />
        <DashboardQuality quality={overview.quality} incidents={overview.incidents} />
        <DashboardFinancePulse finances={overview.finances} />
      </DashboardSection>

      <DashboardSection title={t("sections.performanceTitle")} description={t("sections.performanceDescription")}>
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
          <DashboardProjects projects={overview.projects} />
          <DashboardCapacity capacity={overview.capacity} coordination={overview.coordination} sla={overview.sla} />
        </section>
        <DashboardInsights regions={overview.regions} installers={overview.installers} country={country} />
      </DashboardSection>

      <DashboardSection title={t("sections.regionalTitle")} description={t("sections.regionalDescription")}>
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.85fr)]">
          <DashboardAgenda agenda={overview.agenda} />
          <DashboardTodayOrders orders={overview.todayOrders} />
        </section>
        <DashboardMap sites={overview.mapSites} availableInstallers={overview.capacity.availableToday} />
      </DashboardSection>

      <DashboardSection title={t("sections.alertsTitle")} description={t("sections.alertsDescription")}>
        <DashboardPulse alerts={overview.alerts} forecasts={forecasts} weatherZones={overview.weatherZones} roster={roster} />
        <DashboardOperations forecasts={forecasts} calendarEmail={calendar?.google_email ?? null} calendarConfigured={googleCalendarConfigured()} />
      </DashboardSection>
      </main>
    </PageContainer>
  );
}

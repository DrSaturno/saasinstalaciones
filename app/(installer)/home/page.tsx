import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  coordinatorCompanies,
  getCurrentUser,
  installerCompanies,
  isInstallerArea,
  operationalTimezone,
  ROLE_HOME,
} from "@/lib/auth";
import {
  emptyCoordinationHome,
  fetchCoordinationHome,
} from "@/lib/data/coordination-home";
import {
  fetchInstallerHome,
  type InstallerStats as InstallerStatsData,
} from "@/lib/data/installer-home";
import { ORDER_STATUS, ORDER_STATUS_ORDER } from "@/lib/domain/status";
import { createClient } from "@/lib/supabase/server";
import { fetchZoneForecasts } from "@/lib/weather/forecast";
import { AbsencesCard } from "@/components/installer/home/absences-card";
import { AnnouncementsCard } from "@/components/installer/home/announcements-card";
import { CoordinationStats } from "@/components/installer/home/coordination-stats";
import { InstallerStats } from "@/components/installer/home/installer-stats";
import { MembershipBlock } from "@/components/installer/home/membership-block";
import { NextJobCard } from "@/components/installer/home/next-job-card";
import { QuickActions } from "@/components/installer/home/quick-actions";
import { WeatherCard } from "@/components/installer/home/weather-card";
import { WeekGrid } from "@/components/installer/home/week-grid";
import { Card, CardContent } from "@/components/ui/card";
import type { OrderStatus } from "@/types/database";
import { dateKeyInTimeZone } from "@/lib/domain/reschedule";

const EMPTY_INSTALLER: InstallerStatsData = {
  assigned: 0,
  inProgress: 0,
  doneToday: 0,
  pending: 0,
};

export default async function InstallerHomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isInstallerArea(user)) redirect(ROLE_HOME[user.role]);

  const [t, statusT, format, supabase] = await Promise.all([
    getTranslations("InstallerHome"),
    getTranslations("Status"),
    getFormatter(),
    createClient(),
  ]);
  const timeZone = operationalTimezone(user);
  const today = dateKeyInTimeZone(new Date().toISOString(), timeZone);
  const home = await fetchInstallerHome(supabase, user.id, today, timeZone);
  const [coordination, forecasts] = await Promise.all([
    coordinatorCompanies(user).length
      ? fetchCoordinationHome(supabase, user.id, today)
      : Promise.resolve([]),
    fetchZoneForecasts(home.zones),
  ]);

  const memberships = [
    ...coordinatorCompanies(user),
    ...installerCompanies(user),
  ].sort(
    (a, b) =>
      (a.role === b.role ? 0 : a.role === "coordinator" ? -1 : 1) ||
      a.companyName.localeCompare(b.companyName),
  );
  const showCompany = memberships.length > 1;
  const statsByCompany = new Map(
    home.statsByCompany.map((item) => [item.companyId, item.stats]),
  );
  const coordinationByCompany = new Map(
    coordination.map((item) => [item.companyId, item]),
  );
  const firstName = user.fullName.split(" ")[0] || user.fullName;
  const statusLabels = Object.fromEntries(
    ORDER_STATUS_ORDER.map((status) => [
      status,
      statusT(ORDER_STATUS[status].key),
    ]),
  ) as Record<OrderStatus, string>;

  return (
    <div className="mx-auto w-full max-w-[1480px]">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("greeting", { name: firstName })}
        </h1>
        <p className="mt-1 text-sm capitalize text-muted-foreground">
          {format.dateTime(new Date(`${today}T12:00:00Z`), {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
      </header>

      <NextJobCard
        job={home.nextJob}
        formattedDate={
          home.nextJob?.scheduledDate
            ? format.dateTime(
                new Date(`${home.nextJob.scheduledDate}T12:00:00Z`),
                { dateStyle: "medium" },
              )
            : null
        }
        showCompany={showCompany}
        labels={{
          title: t("nextJob"),
          empty: t("noNextJob"),
          open: t("openJob"),
          directions: t("directions"),
        }}
      />

      <WeekGrid
        title={t("week")}
        subtitle={showCompany ? t("weekAllCompanies") : undefined}
        days={home.week.map((day) => ({
          ...day,
          label: format.dateTime(new Date(`${day.date}T12:00:00Z`), {
            weekday: "narrow",
          }),
        }))}
      />

      <div className="mt-4 space-y-4">
        {memberships.map((membership) => {
          const title =
            membership.role === "coordinator"
              ? showCompany
                ? t("blockCoordinator", { company: membership.companyName })
                : t("coordinationTitle")
              : showCompany
                ? t("blockInstaller", { company: membership.companyName })
                : t("asInstaller");

          return (
            <MembershipBlock
              key={`${membership.companyId}:${membership.role}`}
              kind={membership.role}
              title={title}
              subtitle={
                membership.role === "coordinator"
                  ? t("coordinationSubtitle", {
                      count:
                        coordinationByCompany.get(membership.companyId)
                          ?.projects ?? 0,
                    })
                  : t("asInstallerHelp")
              }
            >
              {membership.role === "coordinator" ? (
                <CoordinationStats
                  data={
                    coordinationByCompany.get(membership.companyId) ??
                    emptyCoordinationHome(membership.companyId)
                  }
                  labels={{
                    pendingReview: t("coordPendingReview"),
                    unassigned: t("coordUnassigned"),
                    doneToday: t("coordDoneToday"),
                    total: t("coordTotal"),
                    byStatus: t("coordByStatus"),
                    open: t("coordinationOpen"),
                  }}
                  statusLabels={statusLabels}
                />
              ) : (
                <InstallerStats
                  stats={
                    statsByCompany.get(membership.companyId) ?? EMPTY_INSTALLER
                  }
                  labels={{
                    assigned: t("assigned"),
                    inProgress: t("inProgress"),
                    doneToday: t("doneToday"),
                    pending: t("pending"),
                  }}
                />
              )}
            </MembershipBlock>
          );
        })}

        {!memberships.length ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              {t("noMemberships")}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <AnnouncementsCard
        title={t("announcements")}
        empty={t("noAnnouncements")}
        items={home.announcements.map((item) => ({
          ...item,
          relativeTime: format.relativeTime(new Date(item.createdAt)),
        }))}
      />
      <AbsencesCard
        title={t("absences")}
        help={t("absencesHelp")}
        empty={t("noAbsences")}
        declare={t("declareAbsence")}
        showCompany={showCompany}
        items={home.unavailability.map((item) => ({
          ...item,
          statusLabel: t(`absenceStatus.${item.status}`),
          dateRange: `${format.dateTime(new Date(item.startsAt), {
            dateStyle: "short",
          })} → ${format.dateTime(new Date(item.endsAt), {
            dateStyle: "short",
          })}`,
        }))}
      />
      <WeatherCard title={t("weather")} forecasts={forecasts} />
      <QuickActions myOrders={t("myOrders")} findJobs={t("findJobs")} />
    </div>
  );
}

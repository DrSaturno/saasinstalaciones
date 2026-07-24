import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isInstallerAvailableAt } from "@/lib/domain/availability";
import { buildFinancialOverview } from "@/lib/domain/finance";
import {
  firstResolutionSummary,
  type DashboardProjectHealth,
  percentage,
  plannedProjectProgress,
  projectHealth,
  weeklyRequirement,
  workload,
} from "@/lib/domain/manager-dashboard";
import type {
  BillingMode,
  Country,
  Database,
  IncidentCategory,
  IncidentSeverity,
  IncidentStatus,
  OrderCurrency,
  OrderStatus,
  ProjectStatus,
} from "@/types/database";

const PAGE = 1000;
const DAY = 86_400_000;

type Project = {
  id: string; company_id: string; name: string; client_name: string;
  planned_installations: number; country: Country; status: ProjectStatus;
  starts_at: string | null; ends_at: string | null; billing_mode: BillingMode;
  contract_amount: number | null; currency: OrderCurrency;
};
type Site = {
  id: string; project_id: string; name: string; address: string; zone: string;
  city: string; lat: number | null; lng: number | null; status: string;
  archived_at: string | null;
};
type Order = {
  id: string; project_id: string; site_id: string; order_number: string;
  title: string; status: OrderStatus; scheduled_date: string | null;
  scheduled_end_date: string | null; finalized_at: string | null;
  assigned_installer_id: string | null; assigned_at: string | null;
  original_scheduled_date: string | null; reschedule_count: number;
  visit_count: number; amount: number | null; currency: OrderCurrency;
  created_at: string;
};
type Incident = {
  id: string; order_id: string; category: IncidentCategory;
  severity: IncidentSeverity; description: string; requires_revisit: boolean;
  status: IncidentStatus; created_at: string;
};

export type DashboardAlertKind =
  | "overdue" | "unassigned" | "projectRisk" | "unavailable"
  | "approval" | "criticalIncident";
export type DashboardOverview = {
  metrics: { activeProjects: number; pendingOrders: number; jobsToday: number; completedToday: number; dailyRate: number; overallRate: number };
  alerts: { id: string; kind: DashboardAlertKind; severity: "warning" | "danger"; count: number; subject: string; href: string }[];
  projects: { id: string; name: string; clientName: string; completed: number; total: number; progress: number; plannedProgress: number; variance: number; health: DashboardProjectHealth; forecastDate: string | null; requiredPerWeek: number }[];
  todayOrders: { id: string; number: string; title: string; projectName: string; siteName: string; zone: string; status: OrderStatus }[];
  regions: { name: string; sites: number; completedSites: number; progress: number }[];
  installers: { id: string; name: string; available: boolean; reason: string | null; openOrders: number; rating: number; completed: number; onTimeRate: number; firstResolutionRate: number; rescheduled: number; incidents: number; averageDays: number }[];
  weatherZones: { name: string; lat: number | null; lng: number | null }[];
  agenda: { date: string; total: number; assigned: number; completed: number; capacity: number; load: number }[];
  capacity: { availableToday: number; total: number; unavailable: number; weeklyAssignments: number; overloadedDays: number; freeSlots: number };
  sla: { onTimeRate: number; averageAssignmentHours: number; averageCompletionDays: number; rescheduled: number; cancelled: number; averageDelayDays: number; completionChange: number | null };
  quality: { firstResolutionRate: number; finalized: number; repeatVisits: number };
  incidents: { id: string; orderId: string; number: string; title: string; siteName: string; category: IncidentCategory; severity: IncidentSeverity; description: string; requiresRevisit: boolean; status: IncidentStatus; createdAt: string }[];
  mapSites: { orderId: string; number: string; siteName: string; address: string; zone: string; status: OrderStatus; lat: number | null; lng: number | null; scheduledDate: string | null }[];
  finances: { currency: OrderCurrency; contracted: number; completed: number; pending: number; projectedMonth: number; growth: number | null }[];
};

function localDate(country: Country, value = new Date()) {
  const timeZone = country === "BR" ? "America/Sao_Paulo" : "America/Argentina/Buenos_Aires";
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

function addDays(date: string, days: number) {
  return new Date(new Date(`${date}T12:00:00Z`).getTime() + days * DAY).toISOString().slice(0, 10);
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

async function fetchPaged<T>(fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>) {
  const result: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error || !data) break;
    result.push(...data);
    if (data.length < PAGE) break;
  }
  return result;
}

export async function fetchDashboardOverview(supabase: SupabaseClient<Database>, country: Country): Promise<DashboardOverview> {
  const [projects, sites, orders, incidents, rosterResult] = await Promise.all([
    fetchPaged<Project>(async (from, to) => supabase.from("projects").select("id, company_id, name, client_name, planned_installations, country, status, starts_at, ends_at, billing_mode, contract_amount, currency").in("status", ["active", "paused"]).range(from, to).overrideTypes<Project[]>()),
    fetchPaged<Site>(async (from, to) => supabase.from("sites").select("id, project_id, name, address, zone, city, lat, lng, status, archived_at").is("archived_at", null).range(from, to).overrideTypes<Site[]>()),
    fetchPaged<Order>(async (from, to) => supabase.from("work_orders").select("id, project_id, site_id, order_number, title, status, scheduled_date, scheduled_end_date, finalized_at, assigned_installer_id, assigned_at, original_scheduled_date, reschedule_count, visit_count, amount, currency, created_at").range(from, to).overrideTypes<Order[]>()),
    fetchPaged<Incident>(async (from, to) => supabase.from("order_incidents").select("id, order_id, category, severity, description, requires_revisit, status, created_at").range(from, to).overrideTypes<Incident[]>()),
    supabase.from("company_installers").select("company_id, installer_id").eq("status", "active"),
  ]);

  const roster = rosterResult.data ?? [];
  const installerIds = roster.map((item) => item.installer_id);
  const companyId = roster[0]?.company_id ?? projects[0]?.company_id;
  const [{ data: profiles }, { data: installerRows }, { data: weekly }, { data: exceptions }] = installerIds.length && companyId ? await Promise.all([
    supabase.from("profiles").select("id, full_name").in("id", installerIds),
    supabase.from("installers").select("id, available, rating_avg").in("id", installerIds),
    supabase.from("installer_weekly_availability").select("installer_id, weekday, starts_at, ends_at, timezone").eq("company_id", companyId).in("installer_id", installerIds),
    supabase.from("installer_unavailability").select("installer_id, starts_at, ends_at, reason").eq("company_id", companyId).in("installer_id", installerIds).gte("ends_at", new Date().toISOString()),
  ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const projectIds = new Set(projects.map((project) => project.id));
  const activeSites = sites.filter((site) => projectIds.has(site.project_id));
  const relevantOrders = orders.filter((order) => projectIds.has(order.project_id));
  const liveOrders = relevantOrders.filter((order) => order.status !== "cancelada");
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const siteById = new Map(activeSites.map((site) => [site.id, site]));
  const orderById = new Map(relevantOrders.map((order) => [order.id, order]));
  const today = localDate(country);
  const weekDates = Array.from({ length: 7 }, (_, index) => addDays(today, index));
  const todayOrders = liveOrders.filter((order) => order.scheduled_date && order.scheduled_date <= today && (order.scheduled_end_date ?? order.scheduled_date) >= today);
  const finalized = liveOrders.filter((order) => order.status === "finalizada");
  const completedToday = todayOrders.filter((order) => order.status === "finalizada").length;
  const revisitOrders = new Set(incidents.filter((item) => item.requires_revisit).map((item) => item.order_id));
  const openIncidents = incidents.filter((item) => item.status === "open");

  const installerSchedule = new Map(installerIds.map((id) => [id, {
    weekly: (weekly ?? []).filter((item) => item.installer_id === id).map((item) => ({ weekday: item.weekday, startsAt: item.starts_at.slice(0, 5), endsAt: item.ends_at.slice(0, 5), timezone: item.timezone })),
    exceptions: (exceptions ?? []).filter((item) => item.installer_id === id).map((item) => ({ startsAt: item.starts_at, endsAt: item.ends_at, reason: item.reason })),
  }]));
  const installerInfo = new Map((installerRows ?? []).map((item) => [item.id, item]));
  const availabilityAt = (id: string, date: string) => isInstallerAvailableAt({
    enabled: installerInfo.get(id)?.available ?? false,
    ...(installerSchedule.get(id) ?? { weekly: [], exceptions: [] }),
    at: new Date(`${date}T15:00:00Z`),
  });

  const agenda = weekDates.map((date) => {
    const daily = liveOrders.filter((order) => order.scheduled_date && order.scheduled_date <= date && (order.scheduled_end_date ?? order.scheduled_date) >= date);
    const capacity = installerIds.filter((id) => availabilityAt(id, date).available).length;
    return { date, total: daily.length, assigned: daily.filter((order) => order.assigned_installer_id).length, completed: daily.filter((order) => order.status === "finalizada").length, capacity, load: workload(daily.length, capacity) };
  });

  const projectRows = projects.map((project) => {
    const rows = liveOrders.filter((order) => order.project_id === project.id);
    const completed = rows.filter((order) => order.status === "finalizada").length;
    const progress = percentage(completed, rows.length);
    const start = project.starts_at ? new Date(`${project.starts_at}T12:00:00Z`).getTime() : null;
    const now = new Date(`${today}T12:00:00Z`).getTime();
    const plannedProgress = plannedProjectProgress(project.starts_at, project.ends_at, today);
    const health = projectHealth({ status: project.status, endDate: project.ends_at, today, progress, plannedProgress });
    const elapsedWeeks = start && now > start ? Math.max(1, (now - start) / (7 * DAY)) : 1;
    const weeklyRate = completed / elapsedWeeks;
    const forecastDate = weeklyRate > 0 && completed < rows.length ? new Date(now + ((rows.length - completed) / weeklyRate) * 7 * DAY).toISOString().slice(0, 10) : completed === rows.length && rows.length ? today : null;
    return { id: project.id, name: project.name, clientName: project.client_name, completed, total: rows.length, progress, plannedProgress, variance: progress - plannedProgress, health, forecastDate, requiredPerWeek: weeklyRequirement(rows.length - completed, project.ends_at, today) };
  }).sort((a, b) => ({ delayed: 0, atRisk: 1, paused: 2, onTrack: 3 })[a.health] - ({ delayed: 0, atRisk: 1, paused: 2, onTrack: 3 })[b.health]);

  const profileNames = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
  const installerRowsView = installerIds.map((id) => {
    const assigned = liveOrders.filter((order) => order.assigned_installer_id === id);
    const done = assigned.filter((order) => order.status === "finalizada" && order.finalized_at);
    const onTime = done.filter((order) => !order.scheduled_end_date || order.finalized_at!.slice(0, 10) <= order.scheduled_end_date).length;
    const firstTime = done.filter((order) => order.visit_count <= 1 && !revisitOrders.has(order.id)).length;
    const status = availabilityAt(id, today);
    return { id, name: profileNames.get(id) ?? "Instalador", available: status.available, reason: status.reason, openOrders: assigned.filter((order) => order.status !== "finalizada").length, rating: Number(installerInfo.get(id)?.rating_avg ?? 0), completed: done.length, onTimeRate: percentage(onTime, done.length), firstResolutionRate: percentage(firstTime, done.length), rescheduled: assigned.filter((order) => order.reschedule_count > 0).length, incidents: incidents.filter((item) => orderById.get(item.order_id)?.assigned_installer_id === id).length, averageDays: Math.round(average(done.map((order) => (new Date(order.finalized_at!).getTime() - new Date(order.created_at).getTime()) / DAY)) * 10) / 10 };
  }).sort((a, b) => Number(b.available) - Number(a.available) || b.openOrders - a.openOrders);

  const overdue = liveOrders.filter((order) => order.status !== "finalizada" && order.scheduled_end_date && order.scheduled_end_date < today);
  const unassigned = liveOrders.filter((order) => !order.assigned_installer_id && order.scheduled_date && order.scheduled_date <= weekDates[6]);
  const approvals = liveOrders.filter((order) => order.status === "en_revision");
  const unavailable = installerRowsView.filter((item) => !item.available);
  const riskyProjects = projectRows.filter((project) => project.health === "delayed" || project.health === "atRisk");
  const criticalIncidents = openIncidents.filter((item) => item.severity === "critical" || item.severity === "high");
  const alerts: DashboardOverview["alerts"] = [
    overdue.length ? { id: "overdue", kind: "overdue", severity: "danger", count: overdue.length, subject: overdue[0].order_number, href: `/orders/${overdue[0].id}` } : null,
    unassigned.length ? { id: "unassigned", kind: "unassigned", severity: "warning", count: unassigned.length, subject: unassigned[0].order_number, href: `/orders/${unassigned[0].id}` } : null,
    riskyProjects.length ? { id: "projects", kind: "projectRisk", severity: riskyProjects.some((item) => item.health === "delayed") ? "danger" : "warning", count: riskyProjects.length, subject: riskyProjects[0].name, href: `/projects/${riskyProjects[0].id}` } : null,
    unavailable.length ? { id: "unavailable", kind: "unavailable", severity: "warning", count: unavailable.length, subject: unavailable[0].name, href: "/team" } : null,
    approvals.length ? { id: "approval", kind: "approval", severity: "warning", count: approvals.length, subject: approvals[0].order_number, href: `/orders/${approvals[0].id}` } : null,
    criticalIncidents.length ? { id: "incidents", kind: "criticalIncident", severity: "danger", count: criticalIncidents.length, subject: orderById.get(criticalIncidents[0].order_id)?.order_number ?? "", href: `/orders/${criticalIncidents[0].order_id}` } : null,
  ].filter((item): item is DashboardOverview["alerts"][number] => item !== null);

  const completedAssignmentHours = relevantOrders.filter((order) => order.assigned_at).map((order) => (new Date(order.assigned_at!).getTime() - new Date(order.created_at).getTime()) / 3_600_000);
  const completedDays = finalized.filter((order) => order.finalized_at).map((order) => (new Date(order.finalized_at!).getTime() - new Date(order.created_at).getTime()) / DAY);
  const delayedDays = finalized.filter((order) => order.finalized_at && order.scheduled_end_date && order.finalized_at.slice(0, 10) > order.scheduled_end_date).map((order) => (new Date(order.finalized_at!).getTime() - new Date(`${order.scheduled_end_date}T23:59:59Z`).getTime()) / DAY);
  const onTime = finalized.filter((order) => !order.scheduled_end_date || (order.finalized_at && order.finalized_at.slice(0, 10) <= order.scheduled_end_date)).length;
  const monthStart = `${today.slice(0, 7)}-01`;
  const previousMonthDate = new Date(`${monthStart}T12:00:00Z`); previousMonthDate.setUTCMonth(previousMonthDate.getUTCMonth() - 1);
  const previousStart = previousMonthDate.toISOString().slice(0, 10);
  const currentCompletions = finalized.filter((order) => (order.finalized_at?.slice(0, 10) ?? "") >= monthStart).length;
  const previousCompletions = finalized.filter((order) => order.finalized_at && order.finalized_at.slice(0, 10) >= previousStart && order.finalized_at.slice(0, 10) < monthStart).length;
  const completionChange = previousCompletions ? Math.round(((currentCompletions - previousCompletions) / previousCompletions) * 100) : currentCompletions ? null : 0;

  const finance = buildFinancialOverview(
    projects.map((item) => ({ id: item.id, name: item.name, billingMode: item.billing_mode, contractAmount: item.contract_amount, currency: item.currency })),
    relevantOrders.map((item) => ({ id: item.id, projectId: item.project_id, siteId: item.site_id, status: item.status, amount: item.amount, currency: item.currency, installerId: item.assigned_installer_id, finalizedAt: item.finalized_at, scheduledDate: item.scheduled_date })),
    { siteZones: new Map(activeSites.map((site) => [site.id, site.zone])), installerNames: profileNames },
  );
  const daysElapsed = Number(today.slice(8, 10));
  const daysInMonth = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate();
  const finances = finance.currencies.map((row) => {
    const monthCompleted = finance.months
      .filter((item) => item.month === today.slice(0, 7) && item.currency === row.currency)
      .reduce((sum, item) => sum + item.value, 0);
    return { ...row, projectedMonth: daysElapsed ? Math.round((monthCompleted / daysElapsed) * daysInMonth) : monthCompleted };
  });

  const regions = new Map<string, { sites: number; completedSites: number }>();
  for (const site of activeSites) {
    const name = site.zone || "Sin zona";
    const value = regions.get(name) ?? { sites: 0, completedSites: 0 };
    value.sites++;
    if (site.status === "finalizada") value.completedSites++;
    regions.set(name, value);
  }
  const weatherSource = todayOrders.length ? todayOrders.map((order) => siteById.get(order.site_id)).filter(Boolean) as Site[] : activeSites;
  const firstResolution = firstResolutionSummary(finalized.map((order) => ({ id: order.id, visitCount: order.visit_count })), revisitOrders);

  return {
    metrics: { activeProjects: projects.filter((item) => item.status === "active").length, pendingOrders: liveOrders.length - finalized.length, jobsToday: todayOrders.length, completedToday, dailyRate: percentage(completedToday, todayOrders.length), overallRate: percentage(finalized.length, liveOrders.length) },
    alerts,
    projects: projectRows,
    todayOrders: todayOrders.map((order) => ({ id: order.id, number: order.order_number, title: order.title, projectName: projectById.get(order.project_id)?.name ?? "—", siteName: siteById.get(order.site_id)?.name ?? "—", zone: siteById.get(order.site_id)?.zone ?? "", status: order.status })),
    regions: [...regions.entries()].map(([name, value]) => ({ name, ...value, progress: percentage(value.completedSites, value.sites) })).sort((a, b) => b.sites - a.sites),
    installers: installerRowsView,
    weatherZones: [...new Map(weatherSource.filter((site) => site.zone).map((site) => [site.zone, { name: site.zone, lat: site.lat, lng: site.lng }])).values()].slice(0, 4),
    agenda,
    capacity: { availableToday: installerRowsView.filter((item) => item.available).length, total: installerIds.length, unavailable: unavailable.length, weeklyAssignments: agenda.reduce((sum, day) => sum + day.assigned, 0), overloadedDays: agenda.filter((day) => day.load > 100).length, freeSlots: agenda.reduce((sum, day) => sum + Math.max(0, day.capacity - day.total), 0) },
    sla: { onTimeRate: percentage(onTime, finalized.length), averageAssignmentHours: Math.round(average(completedAssignmentHours) * 10) / 10, averageCompletionDays: Math.round(average(completedDays) * 10) / 10, rescheduled: relevantOrders.filter((order) => order.reschedule_count > 0).length, cancelled: relevantOrders.filter((order) => order.status === "cancelada").length, averageDelayDays: Math.round(average(delayedDays) * 10) / 10, completionChange },
    quality: { firstResolutionRate: firstResolution.rate, finalized: finalized.length, repeatVisits: firstResolution.repeats },
    incidents: incidents.map((item) => { const order = orderById.get(item.order_id); const site = order ? siteById.get(order.site_id) : null; return { id: item.id, orderId: item.order_id, number: order?.order_number ?? "—", title: order?.title ?? "—", siteName: site?.name ?? "—", category: item.category, severity: item.severity, description: item.description, requiresRevisit: item.requires_revisit, status: item.status, createdAt: item.created_at }; }).sort((a, b) => Number(a.status === "resolved") - Number(b.status === "resolved") || b.createdAt.localeCompare(a.createdAt)),
    mapSites: liveOrders.filter((order) => order.scheduled_date && order.scheduled_date <= weekDates[6] && (order.scheduled_end_date ?? order.scheduled_date) >= today).map((order) => { const site = siteById.get(order.site_id); return { orderId: order.id, number: order.order_number, siteName: site?.name ?? "—", address: [site?.address, site?.city].filter(Boolean).join(", "), zone: site?.zone ?? "", status: order.status, lat: site?.lat ?? null, lng: site?.lng ?? null, scheduledDate: order.scheduled_date }; }),
    finances,
  };
}

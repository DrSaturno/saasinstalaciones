import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isInstallerAvailableAt } from "@/lib/domain/availability";
import type { Country, Database, OrderStatus } from "@/types/database";

const PAGE = 1000;

type Project = { id: string; name: string; client_name: string; planned_installations: number; country: Country };
type Site = { id: string; project_id: string; name: string; zone: string; city: string; lat: number | null; lng: number | null; status: string; archived_at: string | null };
type Order = { id: string; project_id: string; site_id: string; order_number: string; title: string; status: OrderStatus; scheduled_date: string | null; scheduled_end_date: string | null; finalized_at: string | null; assigned_installer_id: string | null };

export type DashboardOverview = {
  metrics: { activeProjects: number; pendingOrders: number; jobsToday: number; completedToday: number; dailyRate: number; overallRate: number };
  projects: { id: string; name: string; clientName: string; completed: number; total: number; progress: number }[];
  todayOrders: { id: string; number: string; title: string; projectName: string; siteName: string; zone: string; status: OrderStatus }[];
  regions: { name: string; sites: number; completedSites: number; progress: number }[];
  installers: { id: string; name: string; available: boolean; reason: string | null; openOrders: number; rating: number }[];
  weatherZones: { name: string; lat: number | null; lng: number | null }[];
};

function todayInCountry(country: Country) {
  const timeZone = country === "BR" ? "America/Sao_Paulo" : "America/Argentina/Buenos_Aires";
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
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
  const [projects, sites, orders, rosterResult] = await Promise.all([
    fetchPaged<Project>(async (from, to) => supabase.from("projects").select("id, name, client_name, planned_installations, country").eq("status", "active").range(from, to).overrideTypes<Project[]>()),
    fetchPaged<Site>(async (from, to) => supabase.from("sites").select("id, project_id, name, zone, city, lat, lng, status, archived_at").is("archived_at", null).range(from, to).overrideTypes<Site[]>()),
    fetchPaged<Order>(async (from, to) => supabase.from("work_orders").select("id, project_id, site_id, order_number, title, status, scheduled_date, scheduled_end_date, finalized_at, assigned_installer_id").range(from, to).overrideTypes<Order[]>()),
    supabase.from("company_installers").select("company_id, installer_id").eq("status", "active"),
  ]);

  const roster = rosterResult.data ?? [];
  const installerIds = roster.map((item) => item.installer_id);
  const companyId = roster[0]?.company_id;
  const [{ data: profiles }, { data: installerRows }, { data: weekly }, { data: exceptions }] = installerIds.length && companyId ? await Promise.all([
    supabase.from("profiles").select("id, full_name").in("id", installerIds),
    supabase.from("installers").select("id, available, rating_avg").in("id", installerIds),
    supabase.from("installer_weekly_availability").select("installer_id, weekday, starts_at, ends_at, timezone").eq("company_id", companyId).in("installer_id", installerIds),
    supabase.from("installer_unavailability").select("installer_id, starts_at, ends_at, reason").eq("company_id", companyId).in("installer_id", installerIds).gte("ends_at", new Date().toISOString()),
  ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const activeProjectIds = new Set(projects.map((project) => project.id));
  const activeSites = sites.filter((site) => activeProjectIds.has(site.project_id));
  const activeOrders = orders.filter((order) => activeProjectIds.has(order.project_id));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const todayByCountry = new Map<Country, string>([["AR", todayInCountry("AR")], ["BR", todayInCountry("BR")]]);
  const liveOrders = activeOrders.filter((order) => order.status !== "cancelada");
  const todayOrders = liveOrders.filter((order) => {
    if (!order.scheduled_date) return false;
    const today = todayByCountry.get(projectById.get(order.project_id)?.country ?? country) ?? todayInCountry(country);
    return order.scheduled_date <= today && (order.scheduled_end_date ?? order.scheduled_date) >= today;
  });
  const completedToday = todayOrders.filter((order) => order.status === "finalizada").length;
  const completedAll = liveOrders.filter((order) => order.status === "finalizada").length;
  const siteById = new Map(activeSites.map((site) => [site.id, site]));

  const projectStats = new Map<string, { total: number; completed: number }>();
  for (const order of liveOrders) {
    const value = projectStats.get(order.project_id) ?? { total: 0, completed: 0 };
    value.total++;
    if (order.status === "finalizada") value.completed++;
    projectStats.set(order.project_id, value);
  }

  const regions = new Map<string, { sites: number; completedSites: number }>();
  for (const site of activeSites) {
    const name = site.zone || "Sin zona";
    const value = regions.get(name) ?? { sites: 0, completedSites: 0 };
    value.sites++;
    if (site.status === "finalizada") value.completedSites++;
    regions.set(name, value);
  }

  const profileNames = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
  const installerInfo = new Map((installerRows ?? []).map((installer) => [installer.id, installer]));
  const openByInstaller = new Map<string, number>();
  for (const order of liveOrders) if (order.assigned_installer_id && order.status !== "finalizada") openByInstaller.set(order.assigned_installer_id, (openByInstaller.get(order.assigned_installer_id) ?? 0) + 1);

  const weatherSource = todayOrders.length ? todayOrders.map((order) => siteById.get(order.site_id)).filter(Boolean) as Site[] : activeSites;
  const weatherZones = [...new Map(weatherSource.filter((site) => site.zone).map((site) => [site.zone, { name: site.zone, lat: site.lat, lng: site.lng }])).values()].slice(0, 4);

  return {
    metrics: {
      activeProjects: projects.length,
      pendingOrders: liveOrders.length - completedAll,
      jobsToday: todayOrders.length,
      completedToday,
      dailyRate: todayOrders.length ? Math.round((completedToday / todayOrders.length) * 100) : 0,
      overallRate: liveOrders.length ? Math.round((completedAll / liveOrders.length) * 100) : 0,
    },
    projects: projects.map((project) => {
      const stats = projectStats.get(project.id) ?? { total: 0, completed: 0 };
      return { id: project.id, name: project.name, clientName: project.client_name, ...stats, progress: stats.total ? Math.round((stats.completed / stats.total) * 100) : 0 };
    }).sort((a, b) => b.progress - a.progress),
    todayOrders: todayOrders.map((order) => ({ id: order.id, number: order.order_number, title: order.title, projectName: projectById.get(order.project_id)?.name ?? "—", siteName: siteById.get(order.site_id)?.name ?? "—", zone: siteById.get(order.site_id)?.zone ?? "", status: order.status })),
    regions: [...regions.entries()].map(([name, value]) => ({ name, ...value, progress: value.sites ? Math.round((value.completedSites / value.sites) * 100) : 0 })).sort((a, b) => b.sites - a.sites),
    installers: installerIds.map((id) => {
      const info = installerInfo.get(id);
      const status = isInstallerAvailableAt({ enabled: info?.available ?? false, weekly: (weekly ?? []).filter((item) => item.installer_id === id).map((item) => ({ weekday: item.weekday, startsAt: item.starts_at.slice(0, 5), endsAt: item.ends_at.slice(0, 5), timezone: item.timezone })), exceptions: (exceptions ?? []).filter((item) => item.installer_id === id).map((item) => ({ startsAt: item.starts_at, endsAt: item.ends_at, reason: item.reason })) });
      return { id, name: profileNames.get(id) ?? "Instalador", available: status.available, reason: status.reason, openOrders: openByInstaller.get(id) ?? 0, rating: Number(info?.rating_avg ?? 0) };
    }).sort((a, b) => Number(b.available) - Number(a.available) || b.openOrders - a.openOrders),
    weatherZones,
  };
}

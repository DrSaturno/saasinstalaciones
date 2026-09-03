import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, OrderStatus, SchedulePrecision } from "@/types/database";

export type AgendaActivityType = "survey" | "execution";

export type AgendaRow = {
  activityId: string;
  orderId: string;
  orderNumber: string;
  orderTitle: string;
  orderStatus: OrderStatus;
  activityType: AgendaActivityType;
  date: string;
  startTime: string | null;
  endTime: string | null;
  siteName: string;
  siteCity: string;
  siteZone: string;
  projectId: string;
  projectName: string;
  installerId: string | null;
  installerName: string | null;
  companyId: string;
  companyName: string | null;
};

type RawActivity = {
  id: string;
  activity_type: string;
  schedule_precision: SchedulePrecision;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  legacy_scheduled_date: string | null;
  timezone: string;
};

type RawOrder = {
  id: string;
  order_number: string;
  title: string;
  status: OrderStatus;
  project_id: string;
  company_id: string;
  assigned_installer_id: string | null;
  sites: { name: string; city: string; zone: string } | null;
  projects: { name: string } | null;
  work_activities: RawActivity[];
};

function isAgendaActivityType(value: string): value is AgendaActivityType {
  return value === "survey" || value === "execution";
}

/** La hora de reloj (`HH:MM`) de un instante, en la zona de la actividad. */
function clockTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(iso));
}

/** La fecha (`YYYY-MM-DD`) de un instante, en la zona de la actividad. */
function dateInTZ(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
}

/**
 * La fecha efectiva de una actividad, o `null` si no tiene ninguna todavía.
 *
 * Con precisión `exact` se deriva del instante guardado; con `day`, ya viene
 * como fecha. Con `unknown` no hay nada que mostrar — no se le inventa una
 * franja a una actividad sin agendar sólo para que aparezca en algún lado
 * (AC-11-C, AG-R1): directamente no entra a la agenda.
 */
function resolveSchedule(
  activity: RawActivity,
): { date: string; startTime: string | null; endTime: string | null } | null {
  if (activity.schedule_precision === "exact" && activity.scheduled_start_at) {
    return {
      date: dateInTZ(activity.scheduled_start_at, activity.timezone),
      startTime: clockTime(activity.scheduled_start_at, activity.timezone),
      endTime: activity.scheduled_end_at
        ? clockTime(activity.scheduled_end_at, activity.timezone)
        : null,
    };
  }
  if (activity.schedule_precision === "day" && activity.legacy_scheduled_date) {
    return { date: activity.legacy_scheduled_date, startTime: null, endTime: null };
  }
  return null;
}

function flatten(
  orders: RawOrder[],
  installerNames: Map<string, string>,
  companyNames: Map<string, string>,
): AgendaRow[] {
  const rows: AgendaRow[] = [];
  for (const order of orders) {
    for (const activity of order.work_activities ?? []) {
      if (!isAgendaActivityType(activity.activity_type)) continue;
      const schedule = resolveSchedule(activity);
      if (!schedule) continue;
      rows.push({
        activityId: activity.id,
        orderId: order.id,
        orderNumber: order.order_number,
        orderTitle: order.title,
        orderStatus: order.status,
        activityType: activity.activity_type,
        date: schedule.date,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        siteName: order.sites?.name ?? "—",
        siteCity: order.sites?.city ?? "",
        siteZone: order.sites?.zone ?? "",
        projectId: order.project_id,
        projectName: order.projects?.name ?? "—",
        installerId: order.assigned_installer_id,
        installerName: order.assigned_installer_id
          ? (installerNames.get(order.assigned_installer_id) ?? null)
          : null,
        companyId: order.company_id,
        companyName: companyNames.get(order.company_id) ?? null,
      });
    }
  }
  return rows.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.startTime ?? "").localeCompare(b.startTime ?? "");
  });
}

const PAGE = 1000;
const SELECT =
  "id, order_number, title, status, project_id, company_id, assigned_installer_id, sites(name, city, zone), projects(name), work_activities(id, activity_type, schedule_precision, scheduled_start_at, scheduled_end_at, legacy_scheduled_date, timezone)";

/**
 * La agenda de la empresa: toda actividad ya agendada (hora exacta o al
 * menos día) de sus órdenes, con instalador, punto y proyecto.
 *
 * RLS filtra por tenant, igual que `fetchAllOrders` — no hace falta acotar
 * por `company_id` acá.
 */
export async function fetchCompanyAgenda(
  supabase: SupabaseClient<Database>,
): Promise<AgendaRow[]> {
  const raw: RawOrder[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("work_orders")
      .select(SELECT)
      .range(from, from + PAGE - 1)
      .overrideTypes<RawOrder[]>();
    if (error || !data) break;
    raw.push(...data);
    if (data.length < PAGE) break;
  }

  const installerIds = [
    ...new Set(raw.map((order) => order.assigned_installer_id).filter(Boolean)),
  ] as string[];
  const installerNames = new Map<string, string>();
  if (installerIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", installerIds);
    for (const profile of profiles ?? []) installerNames.set(profile.id, profile.full_name);
  }

  return flatten(raw, installerNames, new Map());
}

/**
 * La agenda del instalador: sus compromisos en TODAS las empresas donde
 * trabaja — es el único que la ve completa (REQ-11.2).
 *
 * El filtro por `assigned_installer_id` va explícito y no se delega en RLS:
 * mismo motivo que `fetchInstallerHome` — las policies se combinan con OR, y
 * un coordinador recibiría acá el trabajo que sólo coordina como si fuera
 * propio.
 */
export async function fetchInstallerAgenda(
  supabase: SupabaseClient<Database>,
  installerId: string,
): Promise<AgendaRow[]> {
  const raw: RawOrder[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("work_orders")
      .select(SELECT)
      .eq("assigned_installer_id", installerId)
      .range(from, from + PAGE - 1)
      .overrideTypes<RawOrder[]>();
    if (error || !data) break;
    raw.push(...data);
    if (data.length < PAGE) break;
  }

  const companyIds = [...new Set(raw.map((order) => order.company_id))];
  const companyNames = new Map<string, string>();
  if (companyIds.length > 0) {
    const { data: companies } = await supabase
      .from("companies")
      .select("id, name")
      .in("id", companyIds);
    for (const company of companies ?? []) companyNames.set(company.id, company.name);
  }

  return flatten(raw, new Map(), companyNames);
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AnnouncementSeverity,
  Database,
  OrderStatus,
  UnavailabilityStatus,
} from "@/types/database";

export type InstallerHome = {
  stats: { assigned: number; inProgress: number; doneToday: number; pending: number };
  nextJob: {
    id: string;
    orderNumber: string;
    title: string;
    siteName: string;
    address: string;
    city: string;
    zone: string;
    lat: number | null;
    lng: number | null;
    scheduledDate: string | null;
    status: OrderStatus;
  } | null;
  week: { date: string; total: number }[];
  announcements: {
    id: string;
    title: string;
    body: string;
    severity: AnnouncementSeverity;
    companyName: string;
    createdAt: string;
  }[];
  zones: { name: string; lat: number | null; lng: number | null }[];
  /** Ausencias próximas declaradas por el instalador, con su estado de revisión. */
  unavailability: {
    id: string;
    startsAt: string;
    endsAt: string;
    reason: string;
    status: UnavailabilityStatus;
    reviewNote: string;
  }[];
};

const DAY = 86_400_000;
/** Estados en los que el trabajo todavía está vivo para el instalador. */
const OPEN: OrderStatus[] = ["pendiente", "relevamiento", "planificada", "en_proceso", "en_revision"];

function addDays(date: string, days: number) {
  return new Date(new Date(`${date}T12:00:00Z`).getTime() + days * DAY)
    .toISOString()
    .slice(0, 10);
}

/**
 * Resumen del día para el instalador logueado.
 *
 * RLS ya limita `work_orders` a sus asignaciones y `announcements` a las
 * empresas donde está activo, así que no hace falta filtrar por usuario acá.
 */
export async function fetchInstallerHome(
  supabase: SupabaseClient<Database>,
  today: string,
): Promise<InstallerHome> {
  const [{ data: orders }, { data: announcements }, { data: companies }, { data: absences }] = await Promise.all([
    supabase
      .from("work_orders")
      .select(
        "id, order_number, title, status, scheduled_date, finalized_at, sites(name, address, city, zone, lat, lng)",
      )
      .order("scheduled_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("announcements")
      .select("id, company_id, title, body, severity, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("companies").select("id, name"),
    supabase
      .from("installer_unavailability")
      .select("id, starts_at, ends_at, reason, status, review_note")
      .gte("ends_at", new Date().toISOString())
      .order("starts_at")
      .limit(5),
  ]);

  type Row = {
    id: string;
    order_number: string;
    title: string;
    status: OrderStatus;
    scheduled_date: string | null;
    finalized_at: string | null;
    sites: { name: string; address: string; city: string; zone: string; lat: number | null; lng: number | null } | null;
  };
  const rows = (orders ?? []) as unknown as Row[];
  const live = rows.filter((order) => order.status !== "cancelada");
  const open = live.filter((order) => OPEN.includes(order.status));

  const upcoming = open
    .filter((order) => order.status !== "en_revision")
    .sort((a, b) => {
      // Lo de hoy o vencido primero; después por fecha; lo sin fecha al final.
      const da = a.scheduled_date ?? "9999-12-31";
      const db = b.scheduled_date ?? "9999-12-31";
      if (a.status === "en_proceso" && b.status !== "en_proceso") return -1;
      if (b.status === "en_proceso" && a.status !== "en_proceso") return 1;
      return da.localeCompare(db);
    });
  const next = upcoming[0] ?? null;

  const week = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(today, index);
    return {
      date,
      total: open.filter((order) => order.scheduled_date === date).length,
    };
  });

  const companyNames = new Map((companies ?? []).map((row) => [row.id, row.name]));
  const zones = [
    ...new Map(
      open
        .map((order) => order.sites)
        .filter((site): site is NonNullable<Row["sites"]> => Boolean(site?.zone))
        .map((site) => [site.zone, { name: site.zone, lat: site.lat, lng: site.lng }]),
    ).values(),
  ].slice(0, 3);

  return {
    stats: {
      assigned: open.length,
      inProgress: open.filter((order) => order.status === "en_proceso").length,
      doneToday: live.filter(
        (order) => order.status === "finalizada" && order.finalized_at?.slice(0, 10) === today,
      ).length,
      pending: open.filter((order) => order.status === "pendiente").length,
    },
    nextJob: next
      ? {
          id: next.id,
          orderNumber: next.order_number,
          title: next.title,
          siteName: next.sites?.name ?? "—",
          address: next.sites?.address ?? "",
          city: next.sites?.city ?? "",
          zone: next.sites?.zone ?? "",
          lat: next.sites?.lat ?? null,
          lng: next.sites?.lng ?? null,
          scheduledDate: next.scheduled_date,
          status: next.status,
        }
      : null,
    week,
    announcements: (announcements ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      severity: row.severity,
      companyName: companyNames.get(row.company_id) ?? "",
      createdAt: row.created_at,
    })),
    zones,
    unavailability: (absences ?? []).map((row) => ({
      id: row.id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      reason: row.reason,
      status: row.status,
      reviewNote: row.review_note,
    })),
  };
}

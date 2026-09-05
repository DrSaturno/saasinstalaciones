import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import { fetchActiveCompanyRoleMemberships } from "@/lib/data/company-membership-roles";
import type { Database, OrderStatus } from "@/types/database";
import { throwIfDataError } from "@/lib/data/errors";

export type OrderRow = {
  id: string;
  order_number: string;
  title: string;
  status: OrderStatus;
  scheduled_date: string | null;
  scheduled_end_date: string | null;
  finalized_at: string | null;
  amount: number | null;
  currency: Database["public"]["Tables"]["work_orders"]["Row"]["currency"];
  created_at: string;
  site_name: string;
  site_city: string;
  site_zone: string;
  project_id: string;
  project_name: string;
  installer_id: string | null;
  installer_name: string | null;
};

const PAGE = 1000;

type RawOrder = {
  id: string;
  order_number: string;
  title: string;
  status: OrderStatus;
  scheduled_date: string | null;
  scheduled_end_date: string | null;
  finalized_at: string | null;
  amount: number | null;
  currency: Database["public"]["Tables"]["work_orders"]["Row"]["currency"];
  created_at: string;
  project_id: string;
  assigned_installer_id: string | null;
  sites: { name: string; city: string; zone: string } | null;
  projects: { name: string } | null;
};

function shape(
  o: RawOrder,
  installerNames: Map<string, string>,
): OrderRow {
  return {
    id: o.id,
    order_number: o.order_number,
    title: o.title,
    status: o.status,
    scheduled_date: o.scheduled_date,
    scheduled_end_date: o.scheduled_end_date,
    finalized_at: o.finalized_at,
    amount: o.amount,
    currency: o.currency,
    created_at: o.created_at,
    site_name: o.sites?.name ?? "—",
    site_city: o.sites?.city ?? "",
    site_zone: o.sites?.zone ?? "",
    project_id: o.project_id,
    project_name: o.projects?.name ?? "—",
    installer_id: o.assigned_installer_id,
    installer_name: o.assigned_installer_id
      ? (installerNames.get(o.assigned_installer_id) ?? null)
      : null,
  };
}

/**
 * Trae todas las órdenes de la empresa (RLS filtra por tenant), con nombre de
 * punto, proyecto e instalador. Pagina porque PostgREST corta en 1000.
 *
 * El nombre del instalador vive en profiles (id = installers.id), así que lo
 * resolvemos con un segundo query en vez de un join anidado frágil.
 */
export async function fetchAllOrders(
  supabase: SupabaseClient<Database>,
  filter?: { projectId?: string },
): Promise<OrderRow[]> {
  const raw: RawOrder[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from("work_orders")
      .select(
        "id, order_number, title, status, scheduled_date, scheduled_end_date, finalized_at, amount, currency, created_at, project_id, assigned_installer_id, sites(name, city, zone), projects(name)",
      )
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (filter?.projectId) query = query.eq("project_id", filter.projectId);

    const { data, error } = await query.overrideTypes<RawOrder[]>();
    throwIfDataError("orders.list", error);
    if (!data) break;
    raw.push(...data);
    if (data.length < PAGE) break;
  }

  // Nombres de los instaladores asignados.
  const ids = [
    ...new Set(raw.map((o) => o.assigned_installer_id).filter(Boolean)),
  ] as string[];
  const installerNames = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    throwIfDataError("orders.installer_names", error);
    for (const p of profiles ?? []) installerNames.set(p.id, p.full_name);
  }

  return raw.map((o) => shape(o, installerNames));
}

/** Instaladores del roster activo, para el selector de asignación. */
/**
 * Roster asignable a una orden.
 *
 * Incluye a toda persona con capacidad de instalación. Un coordinador que
 * también conserva esa capacidad sigue pudiendo recibir nuevas órdenes.
 */
export async function fetchActiveRoster(
  supabase: SupabaseClient<Database>,
): Promise<
  {
    id: string;
    name: string;
    ratingAvg: number;
    ratingCount: number;
    defaultRate: number | null;
  }[]
> {
  const t = await getTranslations("DataFallbacks");
  const roster = await fetchActiveCompanyRoleMemberships(
    supabase,
    "installer",
  );
  const ids = [...new Set(roster.map((membership) => membership.userId))];
  if (ids.length === 0) return [];

  const [profilesResult, installersResult, ratesResult] =
    await Promise.all([
      supabase.from("profiles").select("id, full_name").in("id", ids),
      supabase
        .from("installers")
        .select("id, rating_avg, rating_count")
        .in("id", ids),
      // La tarifa vive en la membresía, no en la ficha de oficio: la misma
      // persona puede cobrar distinto en cada empresa. RLS ya acota a la propia.
      supabase
        .from("company_installers")
        .select("installer_id, default_installer_rate")
        .in("installer_id", ids),
    ]);
  throwIfDataError("orders.roster_profiles", profilesResult.error);
  throwIfDataError("orders.roster_installers", installersResult.error);
  throwIfDataError("orders.roster_rates", ratesResult.error);
  const profiles = profilesResult.data;
  const installers = installersResult.data;
  const rates = ratesResult.data;
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const installerById = new Map((installers ?? []).map((i) => [i.id, i]));
  const rateById = new Map(
    (rates ?? []).map((r) => [r.installer_id, r.default_installer_rate]),
  );

  return ids.map((id) => {
    const installer = installerById.get(id);
    const rate = rateById.get(id);
    return {
      id,
      name: profileById.get(id)?.full_name ?? t("installer"),
      ratingAvg: Number(installer?.rating_avg ?? 0),
      ratingCount: installer?.rating_count ?? 0,
      defaultRate: rate === null || rate === undefined ? null : Number(rate),
    };
  });
}

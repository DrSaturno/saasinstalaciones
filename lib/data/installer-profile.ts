import { getTranslations } from "next-intl/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  MembershipRole,
  OrderCurrency,
  OrderStatus,
  RosterStatus,
} from "@/types/database";

export type InstallerProfileOrder = {
  id: string;
  orderNumber: string;
  title: string;
  status: OrderStatus;
  scheduledDate: string | null;
  projectName: string;
};

export type InstallerProfileReview = {
  id: string;
  stars: number;
  comment: string | null;
  createdAt: string;
  orderNumber: string;
};

export type InstallerProfile = {
  id: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  // El email no está en el modelo: vive sólo en auth.users, que no es
  // consultable desde la app. Mostrarlo pide una migración que lo espeje en
  // `profiles` al crearse la cuenta.
  memberSince: string | null;
  rosterStatus: RosterStatus | null;
  /** Capacidades independientes en esta empresa: puede tener ambas. */
  roles: MembershipRole[];
  /** Tarifa sugerida de esta persona EN ESTA empresa. */
  defaultRate: number | null;
  zones: string[];
  skills: string[];
  available: boolean;
  serviceRadiusKm: number | null;
  ratingAvg: number;
  ratingCount: number;
  orders: InstallerProfileOrder[];
  reviews: InstallerProfileReview[];
  companyName: string;
  /** Moneda operativa de la empresa, derivada de su país. */
  currency: OrderCurrency;
};

/**
 * Ficha completa de un instalador, para la empresa que lo tiene en su roster.
 *
 * Todo lo que se lee acá está acotado por RLS a la empresa de quien consulta:
 * las órdenes, las reseñas y la pertenencia al equipo. Deliberadamente NO se
 * informa para qué otras empresas trabaja la persona — esa relación vive en
 * `company_installers`, cuya política sólo deja ver la propia empresa, y
 * exponerla cruzaría datos entre inquilinos.
 */
export async function fetchInstallerProfile(
  supabase: SupabaseClient<Database>,
  installerId: string,
): Promise<InstallerProfile | null> {
  const t = await getTranslations("DataFallbacks");

  const [{ data: profile }, { data: installer }, { data: roster }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, phone, created_at, avatar_path")
        .eq("id", installerId)
        .maybeSingle(),
      supabase
        .from("installers")
        .select("id, zones, skills, available, rating_avg, rating_count, service_radius_km")
        .eq("id", installerId)
        .maybeSingle(),
      supabase
        .from("company_installers")
        .select("status, joined_at, company_id, default_installer_rate")
        .eq("installer_id", installerId)
        .maybeSingle(),
    ]);

  // Sin fila de roster visible, la persona no pertenece a esta empresa.
  if (!profile || !roster) return null;

  const [{ data: orders }, { data: reviews }, { data: company }, { data: roleRows }] =
    await Promise.all([
      supabase
        .from("work_orders")
        .select("id, order_number, title, status, scheduled_date, project_id")
        .eq("assigned_installer_id", installerId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("ratings")
        .select("id, stars, comment, created_at, order_id")
        .eq("installer_id", installerId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("companies")
        .select("name, country")
        .eq("id", roster.company_id)
        .maybeSingle(),
      supabase
        .from("company_membership_roles")
        .select("role")
        .eq("company_id", roster.company_id)
        .eq("user_id", installerId),
    ]);

  // Nombres de proyecto y números de orden en consultas aparte: el tipado
  // generado no resuelve los joins embebidos de PostgREST para estas tablas.
  const projectIds = [...new Set((orders ?? []).map((o) => o.project_id))];
  const ratedOrderIds = [...new Set((reviews ?? []).map((r) => r.order_id))];

  const [{ data: projects }, { data: ratedOrders }] = await Promise.all([
    projectIds.length
      ? supabase.from("projects").select("id, name").in("id", projectIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ratedOrderIds.length
      ? supabase.from("work_orders").select("id, order_number").in("id", ratedOrderIds)
      : Promise.resolve({ data: [] as { id: string; order_number: string }[] }),
  ]);

  const projectName = new Map((projects ?? []).map((p) => [p.id, p.name]));
  const orderNumber = new Map((ratedOrders ?? []).map((o) => [o.id, o.order_number]));

  return {
    id: installerId,
    name: profile.full_name || t("installer"),
    phone: profile.phone,
    avatarUrl: profile.avatar_path
      ? supabase.storage.from("avatars").getPublicUrl(profile.avatar_path).data
          .publicUrl
      : null,
    memberSince: roster.joined_at ?? profile.created_at,
    rosterStatus: roster.status,
    roles: [...new Set((roleRows ?? []).map((r) => r.role))],
    defaultRate:
      roster.default_installer_rate === null || roster.default_installer_rate === undefined
        ? null
        : Number(roster.default_installer_rate),
    zones: installer?.zones ?? [],
    skills: installer?.skills ?? [],
    available: installer?.available ?? true,
    serviceRadiusKm: installer?.service_radius_km ?? null,
    ratingAvg: installer?.rating_avg ?? 0,
    ratingCount: installer?.rating_count ?? 0,
    companyName: company?.name ?? "",
    currency: company?.country === "BR" ? "BRL" : "ARS",
    orders: (orders ?? []).map((order) => ({
      id: order.id,
      orderNumber: order.order_number,
      title: order.title,
      status: order.status,
      scheduledDate: order.scheduled_date,
      projectName: projectName.get(order.project_id) ?? "",
    })),
    reviews: (reviews ?? []).map((review) => ({
      id: review.id,
      stars: review.stars,
      comment: review.comment,
      createdAt: review.created_at,
      orderNumber: orderNumber.get(review.order_id) ?? "",
    })),
  };
}

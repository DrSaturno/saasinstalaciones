import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "../_guard";

/** GET /api/master/overview — métricas globales de la plataforma. */
export async function GET() {
  const guard = await requirePlatformAdmin();
  if (guard.error) return guard.error;
  const { admin } = guard;

  const count = (table: "companies" | "profiles" | "projects" | "work_orders" | "sites") =>
    admin.from(table).select("*", { count: "exact", head: true });

  const [companies, activeCompanies, profiles, installers, projects, sites, orders, openOrders] =
    await Promise.all([
      count("companies"),
      admin.from("companies").select("*", { count: "exact", head: true }).eq("status", "active"),
      count("profiles"),
      admin.from("installers").select("*", { count: "exact", head: true }),
      count("projects"),
      count("sites"),
      count("work_orders"),
      admin
        .from("work_orders")
        .select("*", { count: "exact", head: true })
        .not("status", "in", "(finalizada,cancelada)"),
    ]);

  return NextResponse.json({
    companies: companies.count ?? 0,
    activeCompanies: activeCompanies.count ?? 0,
    users: profiles.count ?? 0,
    installers: installers.count ?? 0,
    projects: projects.count ?? 0,
    sites: sites.count ?? 0,
    orders: orders.count ?? 0,
    openOrders: openOrders.count ?? 0,
  });
}

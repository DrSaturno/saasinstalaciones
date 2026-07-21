import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildFinancialOverview, type FinancialOverview } from "@/lib/domain/finance";
import type { BillingMode, Database, OrderCurrency, OrderStatus } from "@/types/database";

type ProjectRow = { id: string; name: string; billing_mode: BillingMode; contract_amount: number | null; currency: OrderCurrency };
type OrderRow = { id: string; project_id: string; site_id: string; status: OrderStatus; amount: number | null; currency: OrderCurrency; assigned_installer_id: string | null; finalized_at: string | null; scheduled_date: string | null };

export async function fetchFinancialOverview(supabase: SupabaseClient<Database>): Promise<FinancialOverview> {
  const [{ data: projects }, { data: orders }, { data: sites }, { data: roster }] = await Promise.all([
    supabase.from("projects").select("id, name, billing_mode, contract_amount, currency").neq("status", "draft").overrideTypes<ProjectRow[]>(),
    supabase.from("work_orders").select("id, project_id, site_id, status, amount, currency, assigned_installer_id, finalized_at, scheduled_date").overrideTypes<OrderRow[]>(),
    supabase.from("sites").select("id, zone"),
    supabase.from("company_installers").select("installer_id").eq("status", "active"),
  ]);
  const installerIds = (roster ?? []).map((item) => item.installer_id);
  const { data: profiles } = installerIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", installerIds)
    : { data: [] as { id: string; full_name: string }[] };

  return buildFinancialOverview(
    (projects ?? []).map((project) => ({ id: project.id, name: project.name, billingMode: project.billing_mode, contractAmount: project.contract_amount, currency: project.currency })),
    (orders ?? []).map((order) => ({ id: order.id, projectId: order.project_id, siteId: order.site_id, status: order.status, amount: order.amount, currency: order.currency, installerId: order.assigned_installer_id, finalizedAt: order.finalized_at, scheduledDate: order.scheduled_date })),
    { siteZones: new Map((sites ?? []).map((site) => [site.id, site.zone])), installerNames: new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name])) },
  );
}

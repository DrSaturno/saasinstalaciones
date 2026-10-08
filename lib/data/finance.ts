import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchActiveCompanyRoleMemberships } from "@/lib/data/company-membership-roles";
import { embeddedOrderAmount, embeddedProjectContractAmount, ORDER_PRICING_SELECT, PROJECT_PRICING_SELECT, type OrderPricingEmbed, type ProjectPricingEmbed } from "@/lib/data/pricing";
import { embeddedTeamMembers, TEAM_MEMBERS_SELECT, type TeamMembersEmbed } from "@/lib/data/order-team";
import { buildFinancialOverview, type FinancialOverview } from "@/lib/domain/finance";
import type { BillingMode, Database, OrderCurrency, OrderStatus, PaymentStatus, ProjectStatus } from "@/types/database";

type ProjectRow = ProjectPricingEmbed & { id: string; name: string; status: ProjectStatus; billing_mode: BillingMode; currency: OrderCurrency };
type OrderRow = OrderPricingEmbed & TeamMembersEmbed & { id: string; order_number: string; title: string; project_id: string; site_id: string; status: OrderStatus; installer_amount: number | null; payment_status: PaymentStatus; currency: OrderCurrency; assigned_installer_id: string | null; finalized_at: string | null; scheduled_date: string | null };

export async function fetchFinancialOverview(
  supabase: SupabaseClient<Database>,
  range?: { from: string; to: string },
): Promise<FinancialOverview> {
  const [{ data: projects }, { data: orders }, { data: sites }, roster, { data: expenses }] = await Promise.all([
    // Sin `neq("status","draft")`: un borrador con trabajo terminado y sin
    // pagar es deuda igual, y descartarlo acá la volvía invisible —y por lo
    // tanto impagable, porque «Pendientes de pago» es el único lugar de la
    // aplicación donde se marca un pago—. Quién entra en cada sección lo
    // decide `buildFinancialOverview`, que sí distingue deuda de métrica.
    supabase.from("projects").select(`id, name, status, billing_mode, currency, ${PROJECT_PRICING_SELECT}`).overrideTypes<ProjectRow[]>(),
    supabase.from("work_orders").select(`id, order_number, title, project_id, site_id, status, installer_amount, payment_status, currency, assigned_installer_id, finalized_at, scheduled_date, ${ORDER_PRICING_SELECT}, ${TEAM_MEMBERS_SELECT}`).overrideTypes<OrderRow[]>(),
    supabase.from("sites").select("id, zone"),
    fetchActiveCompanyRoleMemberships(supabase, "installer"),
    // Bloque 6: otros costos por proyecto. La RLS de `project_expenses` ya
    // filtra a quien puede ver lo comercial — si esta consulta llega vacía
    // para un coordinador, es la RLS funcionando, no un bug.
    supabase.from("project_expenses").select("project_id, amount"),
  ]);
  const installerIds = [...new Set(roster.map((item) => item.userId))];
  const { data: profiles } = installerIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", installerIds)
    : { data: [] as { id: string; full_name: string }[] };

  const otherCostsByProject = new Map<string, number>();
  for (const expense of expenses ?? []) {
    otherCostsByProject.set(
      expense.project_id,
      (otherCostsByProject.get(expense.project_id) ?? 0) + Number(expense.amount),
    );
  }

  return buildFinancialOverview(
    (projects ?? []).map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status,
      billingMode: project.billing_mode,
      contractAmount: embeddedProjectContractAmount(project),
      currency: project.currency,
      otherCosts: otherCostsByProject.get(project.id) ?? 0,
    })),
    (orders ?? []).map((order) => ({ id: order.id, orderNumber: order.order_number, title: order.title, projectId: order.project_id, siteId: order.site_id, status: order.status, amount: embeddedOrderAmount(order), installerAmount: order.installer_amount, team: embeddedTeamMembers(order), paymentStatus: order.payment_status, currency: order.currency, installerId: order.assigned_installer_id, finalizedAt: order.finalized_at, scheduledDate: order.scheduled_date })),
    {
      siteZones: new Map((sites ?? []).map((site) => [site.id, site.zone])),
      installerNames: new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name])),
      dateFrom: range?.from,
      dateTo: range?.to,
    },
  );
}

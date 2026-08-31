import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import { logEvent } from "@/lib/observability";
import {
  buildInstallerEarnings,
  type InstallerEarningInput,
  type InstallerEarningsFilters,
  type InstallerEarningsOverview,
} from "@/lib/domain/installer-finance";
import type { Database, OrderCurrency, OrderStatus, PaymentStatus } from "@/types/database";

type EarningRow = {
  order_id: string;
  order_number: string;
  title: string;
  company_id: string;
  status: OrderStatus;
  amount: number | null;
  currency: OrderCurrency;
  payment_status: PaymentStatus;
  finalized_at: string | null;
  scheduled_date: string | null;
};

/**
 * Los ingresos de un instalador, de todas las empresas para las que trabaja.
 *
 * Consulta la vista `installer_earnings`, no `work_orders`: ahí el `amount` ya
 * es el pago al instalador, y la columna con el ingreso de la empresa
 * directamente no existe. Aunque alguien agregara un `select("*")` acá, no
 * podría filtrarse lo que la empresa le cobra a su cliente.
 *
 * Una sola consulta alcanza para todas las empresas: la política de la base
 * filtra por «esta orden es tuya» sin mirar la empresa, así que el trabajo de
 * cruzar empresas ya está hecho del otro lado. Por eso no hay ningún `in` con
 * la lista de empresas, y por eso este fetcher se ve distinto a los de la
 * empresa, que siempre miran una sola.
 */
export async function fetchInstallerEarnings(
  supabase: SupabaseClient<Database>,
  installerId: string,
  filters?: InstallerEarningsFilters,
): Promise<InstallerEarningsOverview> {
  const t = await getTranslations("DataFallbacks");

  const { data: orders, error } = await supabase
    .from("installer_earnings")
    .select(
      "order_id, order_number, title, company_id, status, amount, currency, payment_status, finalized_at, scheduled_date",
    )
    // Redundante con la política de la base, y a propósito: si algún día
    // alguien afloja esa política, esto sigue acotando a la persona correcta.
    .eq("assigned_installer_id", installerId)
    .overrideTypes<EarningRow[]>();

  // Sin esto, un error de consulta se ve igual que «todavía no trabajaste»:
  // una pantalla vacía y ninguna pista de que algo falló.
  if (error) {
    logEvent("error", "installer_finance.fetch_failed", {
      code: error.code ?? null,
      message: error.message,
    });
  }

  const rows: InstallerEarningInput[] = (orders ?? []).map((order) => ({
    orderId: order.order_id,
    orderNumber: order.order_number,
    title: order.title,
    companyId: order.company_id,
    status: order.status,
    amount: order.amount,
    currency: order.currency,
    paymentStatus: order.payment_status,
    finalizedAt: order.finalized_at,
    scheduledDate: order.scheduled_date,
  }));

  const companyIds = [...new Set(rows.map((row) => row.companyId))];
  const { data: companies } = companyIds.length
    ? await supabase.from("companies").select("id, name").in("id", companyIds)
    : { data: [] as { id: string; name: string }[] };

  return buildInstallerEarnings(rows, {
    companyNames: new Map((companies ?? []).map((c) => [c.id, c.name])),
    fallbackCompanyName: t("company"),
    filters,
  });
}

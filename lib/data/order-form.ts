import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BillingMode, Database, OrderCurrency } from "@/types/database";

export type OrderFormProject = {
  id: string;
  name: string;
  clientName: string;
  billingMode: BillingMode;
  currency: OrderCurrency;
};

/** Opciones pequeñas y estables para abrir la ficha sin serializar miles de puntos. */
export async function fetchOrderFormProjects(
  supabase: SupabaseClient<Database>,
): Promise<OrderFormProject[]> {
  const { data } = await supabase
    .from("projects")
    .select("id, name, client_name, billing_mode, currency")
    .neq("status", "done")
    .order("name");

  return (data ?? []).map((project) => ({
    id: project.id,
    name: project.name,
    clientName: project.client_name,
    billingMode: project.billing_mode,
    currency: project.currency,
  }));
}

export async function fetchCompanyCurrency(
  supabase: SupabaseClient<Database>,
): Promise<OrderCurrency> {
  const { data } = await supabase.from("companies").select("country").single();
  return data?.country === "BR" ? "BRL" : "ARS";
}

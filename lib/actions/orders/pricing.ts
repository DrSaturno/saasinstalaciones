import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Escritura de los importes comerciales (lo que la empresa cobra al cliente).
 *
 * Viven en `work_order_pricing` / `project_pricing`, no en `work_orders` /
 * `projects`: esas tablas las lee el instalador y estas no. La RLS de las tablas
 * de precios sólo deja escribir a quien pasa `auth_can_see_commercials` (hoy, el
 * gerente), así que un llamador sin permiso falla acá aunque el código de la
 * acción se equivocara al decidir quién puede.
 *
 * Devuelven el mensaje de error o `null` si salió bien.
 * Ver docs/specs/2026-09-24-privacidad-de-importes.
 */

type Client = SupabaseClient<Database>;

export async function setOrderAmount(
  supabase: Client,
  args: { orderId: string; companyId: string; amount: number | null; userId: string },
): Promise<string | null> {
  if (args.amount === null) {
    const { error } = await supabase
      .from("work_order_pricing")
      .delete()
      .eq("order_id", args.orderId)
      .eq("company_id", args.companyId);
    return error?.message ?? null;
  }
  const { error } = await supabase.from("work_order_pricing").upsert(
    {
      order_id: args.orderId,
      company_id: args.companyId,
      amount: args.amount,
      updated_at: new Date().toISOString(),
      updated_by: args.userId,
    },
    { onConflict: "order_id" },
  );
  return error?.message ?? null;
}

/**
 * Mismo importe para varias órdenes (alta en lote).
 *
 * Con `keepExisting` no pisa las que ya tienen importe: es la pasada de
 * reparación de un lote reintentado, que no debe deshacer un ajuste hecho
 * después de la primera vez.
 */
export async function setOrdersAmount(
  supabase: Client,
  args: {
    orderIds: string[];
    companyId: string;
    amount: number;
    userId: string;
    keepExisting?: boolean;
  },
): Promise<string | null> {
  if (args.orderIds.length === 0) return null;
  const { error } = await supabase.from("work_order_pricing").upsert(
    args.orderIds.map((orderId) => ({
      order_id: orderId,
      company_id: args.companyId,
      amount: args.amount,
      updated_by: args.userId,
    })),
    { onConflict: "order_id", ignoreDuplicates: args.keepExisting ?? false },
  );
  return error?.message ?? null;
}

export async function setProjectContractAmount(
  supabase: Client,
  args: { projectId: string; companyId: string; amount: number | null; userId: string },
): Promise<string | null> {
  if (args.amount === null) {
    const { error } = await supabase
      .from("project_pricing")
      .delete()
      .eq("project_id", args.projectId)
      .eq("company_id", args.companyId);
    return error?.message ?? null;
  }
  const { error } = await supabase.from("project_pricing").upsert(
    {
      project_id: args.projectId,
      company_id: args.companyId,
      contract_amount: args.amount,
      updated_at: new Date().toISOString(),
      updated_by: args.userId,
    },
    { onConflict: "project_id" },
  );
  return error?.message ?? null;
}

"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import type { PaymentStatus } from "@/types/database";
import { operatedCompany, requireOperator } from "./context";
import type { ActionState } from "./types";

// ---------------------------------------------------------------------------
// Estado de cobro de una orden: qué se le pagó al instalador y qué se le debe
// ---------------------------------------------------------------------------

const schema = z.object({
  orderId: z.string().uuid(),
  status: z.enum(["pending", "paid"]),
  note: z.string().trim().max(500).optional().default(""),
});

/**
 * Marca una orden como pagada al instalador, o vuelve atrás esa marca.
 *
 * Pasa por la función `set_order_payment_status` de la base en vez de hacer dos
 * escrituras desde acá: la columna y su historial tienen que moverse juntos o
 * no moverse, y si la aplicación hiciera las dos por separado, una falla en la
 * segunda dejaría una orden marcada como pagada sin registro de quién lo hizo.
 *
 * Deliberadamente NO existe la versión del instalador: quién cobró y cuándo lo
 * decide la empresa. La base lo respalda — el instalador sólo tiene lectura
 * sobre `order_payment_events`.
 */
export async function setOrderPaymentStatus(input: {
  orderId: string;
  status: PaymentStatus;
  note?: string;
}): Promise<ActionState> {
  const t = await getTranslations("Errors");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: t("invalidData") };

  try {
    const { supabase, user } = await requireOperator();

    // Se lee antes para dar un error entendible: la RPC también valida, pero
    // su excepción es de base de datos y no está traducida.
    const { data: order } = await supabase
      .from("work_orders")
      .select("id, company_id, project_id")
      .eq("id", parsed.data.orderId)
      .single();
    if (!order) return { error: t("orderNotFound") };
    operatedCompany(user, order.company_id);

    const { error } = await supabase.rpc("set_order_payment_status", {
      p_order_id: parsed.data.orderId,
      p_status: parsed.data.status,
      p_note: parsed.data.note ?? "",
    });
    if (error) return { error: error.message };

    revalidatePath("/finance");
    revalidatePath("/orders");
    revalidatePath(`/orders/${parsed.data.orderId}`);
    revalidatePath(`/projects/${order.project_id}`);
  } catch {
    return { error: t("unexpected") };
  }
  return { error: null, ok: true };
}

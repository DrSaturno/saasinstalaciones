"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { operatedCompany, requireOperator } from "./context";
import type { ActionState } from "./types";

// ---------------------------------------------------------------------------
// Mensaje libre en el espacio de evidencia de una orden
// ---------------------------------------------------------------------------

const schema = z.object({
  orderId: z.string().uuid(),
  body: z.string().trim().min(1).max(4_000),
});

/**
 * Publica un mensaje de texto en `order_updates` (`type: "message"`).
 *
 * `id` se genera acá, no en el cliente: esta acción es del área
 * empresa/coordinador, no pasa por la cola offline del instalador
 * (`lib/offline/sync.ts`), así que no necesita idempotencia por uuid de
 * cliente — mismo criterio que ya usa `lifecycle.ts` para las notas de
 * sistema.
 *
 * Adjuntar un archivo es un paso aparte: sube a Storage y registra la fila
 * en `order_attachments` vía `registerOrderAttachments`, que ya existía.
 * Esta acción sólo escribe el texto.
 */
export async function postOrderMessage(input: {
  orderId: string;
  body: string;
}): Promise<ActionState> {
  const t = await getTranslations("Errors");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: t("invalidData") };

  try {
    const { supabase, user } = await requireOperator();

    const { data: order } = await supabase
      .from("work_orders")
      .select("id, company_id")
      .eq("id", parsed.data.orderId)
      .single();
    if (!order) return { error: t("orderNotFound") };
    const companyId = operatedCompany(user, order.company_id);

    const { error } = await supabase.from("order_updates").insert({
      id: crypto.randomUUID(),
      order_id: order.id,
      company_id: companyId,
      created_by: user.id,
      type: "message",
      note: parsed.data.body,
    });
    if (error) return { error: error.message };

    revalidatePath(`/orders/${parsed.data.orderId}`);
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

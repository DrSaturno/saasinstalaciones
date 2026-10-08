"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getAuthorizedUser } from "@/lib/auth-authorized";
import { CHAT_MESSAGE_MAX } from "@/lib/domain/messages";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  body: z.string().trim().min(1).max(CHAT_MESSAGE_MAX),
});

/**
 * Escribe en el chat grupal de una orden (bloque 5).
 *
 * Quién puede hacerlo lo decide la RLS de `order_chat_messages`, no esta
 * acción: responsable, ayudantes activos y quien opera la orden. El `id` lo
 * genera el cliente, así reenviar tras un corte no duplica el mensaje.
 */
export async function sendOrderChatMessage(
  input: z.input<typeof schema>,
): Promise<{ error: string | null }> {
  const t = await getTranslations("Errors");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: t("invalidData") };

  const [user, supabase] = await Promise.all([getAuthorizedUser(), createClient()]);
  if (!user) return { error: t("accessDenied") };

  const { data: order } = await supabase
    .from("work_orders")
    .select("company_id")
    .eq("id", parsed.data.orderId)
    .maybeSingle();
  if (!order) return { error: t("accessDenied") };

  const { error } = await supabase.from("order_chat_messages").upsert(
    {
      id: parsed.data.id,
      order_id: parsed.data.orderId,
      company_id: order.company_id,
      sender_id: user.id,
      body: parsed.data.body,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) return { error: t("accessDenied") };
  return { error: null };
}

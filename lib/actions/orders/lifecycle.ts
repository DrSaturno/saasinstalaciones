"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { orderTransitionBlock } from "@/lib/domain/order-rules";
import type { OrderStatus } from "@/types/database";
import { operatedCompany, requireOperator } from "./context";
import type { ActionState } from "./types";

// ---------------------------------------------------------------------------
// Máquina de estados: única vía para cambiar el status (regla no negociable #4)
// ---------------------------------------------------------------------------

export async function transitionOrder(
  orderId: string,
  toStatus: OrderStatus,
  note?: string,
): Promise<ActionState> {
  const [t, statusT] = await Promise.all([
    getTranslations("Errors"),
    getTranslations("Status"),
  ]);
  try {
    const { supabase, user } = await requireOperator();

    const { data: order } = await supabase
      .from("work_orders")
      .select("id, company_id, status, project_id, assigned_installer_id, installer_accepted_at, scheduled_date")
      .eq("id", orderId)
      .single();
    if (!order) return { error: t("orderNotFound") };
    const companyId = operatedCompany(user, order.company_id);

    // ¿Quedó asentado el relevamiento? Sólo importa al salir de ese estado.
    let hasSurvey = false;
    if (order.status === "relevamiento") {
      const { count } = await supabase
        .from("order_updates")
        .select("id", { count: "exact", head: true })
        .eq("order_id", orderId)
        .eq("type", "survey");
      hasSurvey = (count ?? 0) > 0;
    }

    // Validamos acá para dar un error claro; el trigger valida igual en la DB.
    const block = orderTransitionBlock(
      {
        status: order.status,
        assignedInstallerId: order.assigned_installer_id,
        acceptedAt: order.installer_accepted_at,
        hasSurvey,
        scheduledDate: order.scheduled_date,
      },
      toStatus,
      { id: user.id },
    );
    if (block === "invalidTransition") {
      return {
        error: t("invalidOrderTransition", {
          from: statusT(`order.${order.status}`),
          to: statusT(`order.${toStatus}`),
        }),
      };
    }
    if (block) return { error: t(block) };

    const { error } = await supabase
      .from("work_orders")
      .update({ status: toStatus })
      .eq("id", orderId)
      .eq("company_id", companyId);
    if (error) return { error: error.message };

    // Rastro en el historial (order_updates). id generado en server acá:
    // esta acción no es de área installer, no necesita idempotencia offline.
    await supabase.from("order_updates").insert({
      id: crypto.randomUUID(),
      order_id: orderId,
      company_id: companyId,
      type: "system",
      note: note?.trim()
        ? t("systemStatusChangeNote", {
            status: statusT(`order.${toStatus}`),
            note: note.trim(),
          })
        : t("systemStatusChange", { status: statusT(`order.${toStatus}`) }),
    });

    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
    revalidatePath(`/projects/${order.project_id}`);
  } catch {
    return { error: t("unexpected") };
  }
  return { error: null, ok: true };
}

const surveySchema = z.object({
  orderId: z.string().uuid(),
  note: z.string().trim().min(3).max(2000),
});

/**
 * Registra el acta de relevamiento de una orden.
 *
 * Queda como un `order_update` de tipo `survey`, así aparece en el historial
 * junto al resto. Es lo que habilita pasar de `relevamiento` a `planificada`:
 * sin al menos un acta, el trigger de la base rechaza la transición.
 *
 * La puede cargar quien opera la orden — empresa o coordinador del proyecto —,
 * y el instalador la carga desde su propio tablero.
 */
export async function recordSurvey(input: {
  orderId: string;
  note: string;
}): Promise<ActionState> {
  const t = await getTranslations("Errors");
  const parsed = surveySchema.safeParse(input);
  if (!parsed.success) return { error: t("invalidUpdate") };

  try {
    const { supabase, user } = await requireOperator();

    const { data: order } = await supabase
      .from("work_orders")
      .select("id, company_id, status")
      .eq("id", parsed.data.orderId)
      .single();
    if (!order) return { error: t("orderNotFound") };
    const companyId = operatedCompany(user, order.company_id);

    const { error } = await supabase.from("order_updates").insert({
      id: crypto.randomUUID(),
      order_id: parsed.data.orderId,
      company_id: companyId,
      type: "survey",
      note: parsed.data.note,
    });
    if (error) return { error: error.message };

    revalidatePath(`/orders/${parsed.data.orderId}`);
    revalidatePath("/coordination");
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

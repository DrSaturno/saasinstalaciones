"use server";

import { revalidatePath } from "next/cache";
import { logEvent } from "@/lib/observability";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { orderTransitionBlock } from "@/lib/domain/order-rules";
import type { OrderStatus } from "@/types/database";
import { operatedCompany, requireOperator } from "./context";
import type { ActionState } from "./types";
import { SURVEY_NOTE } from "@/lib/domain/field-flow";

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

    // El estado y su rastro se mueven JUNTOS, en una sola transacción.
    //
    // Antes eran dos escrituras sueltas y el error de la segunda se descartaba:
    // el estado quedaba movido sin registro, y de ese insert cuelga el trigger
    // `notify_review_decision`, así que el instalador nunca se enteraba de que
    // la empresa movió su orden. `from_status`/`to_status` son la traza real
    // (FLD-R2.1); la nota en prosa se sigue escribiendo porque hay historial
    // viejo que sólo tiene eso, pero ya no es la fuente.
    const { error } = await supabase.rpc("apply_order_status_change", {
      p_order_id: orderId,
      p_to_status: toStatus,
      p_note: note?.trim()
        ? t("systemStatusChangeNote", {
            status: statusT(`order.${toStatus}`),
            note: note.trim(),
          })
        : t("systemStatusChange", { status: statusT(`order.${toStatus}`) }),
      p_expected_status: order.status,
    });
    if (error) {
      logEvent("error", "order.transition.failed", {
        order_id: orderId,
        company_id: companyId,
        from_status: order.status,
        to_status: toStatus,
        database_code: error.code ?? null,
      });
      // `55000` es el compare-and-set: alguien movió la orden entre que se leyó
      // y se escribió. Merece su propio mensaje — reintentar sirve, y decirle
      // "error inesperado" invita a apretar de nuevo sin mirar qué cambió.
      if (error.code === "55000") return { error: t("orderChangedMeanwhile") };
      return { error: error.message };
    }

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
  note: z.string().trim().min(SURVEY_NOTE.min).max(SURVEY_NOTE.max),
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

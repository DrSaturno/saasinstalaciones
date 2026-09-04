"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import {
  MIN_REASON_LENGTH,
  reviewDecisionBlock,
  reviewNeedsReason,
  reviewTargetStatus,
  type ReviewDecision,
} from "@/lib/domain/review-decision";
import { operatedCompany, requireOperator } from "./context";
import type { ActionState } from "./types";

const schema = z.object({
  orderId: z.string().uuid(),
  decision: z.enum(["approve", "request_evidence", "request_changes", "reopen"]),
  reason: z.string().trim().max(2000).optional().default(""),
});

/**
 * Las cuatro decisiones del coordinador sobre una entrega (`REQ-14.5`).
 *
 * Una sola acción y no cuatro porque las cuatro hacen lo mismo —mover el
 * estado y dejar constancia—; lo que cambia es qué constancia queda. Separadas
 * en cuatro funciones, la parte que importa (el motivo, el aviso, la traza) se
 * habría copiado cuatro veces y divergido en la primera corrección.
 *
 * La segregación de funciones —quien ejecutó la orden no puede aprobarla ni
 * reabrirla, aunque además coordine el proyecto (ADR-001)— la aplica el
 * trigger de la base. Acá no se repite: sería una copia en la que confiar.
 */
export async function reviewOrderDelivery(input: {
  orderId: string;
  decision: ReviewDecision;
  reason?: string;
}): Promise<ActionState> {
  const [t, statusT, reviewT] = await Promise.all([
    getTranslations("Errors"),
    getTranslations("Status"),
    getTranslations("Review"),
  ]);

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: t("invalidData") };
  const { orderId, decision, reason } = parsed.data;

  try {
    const { supabase, user } = await requireOperator();

    const { data: order } = await supabase
      .from("work_orders")
      .select("id, company_id, status, project_id, assigned_installer_id")
      .eq("id", orderId)
      .single();
    if (!order) return { error: t("orderNotFound") };
    const companyId = operatedCompany(user, order.company_id);

    const block = reviewDecisionBlock(decision, order.status, reason);
    if (block === "invalidDecisionForStatus") {
      return {
        error: t("invalidOrderTransition", {
          from: statusT(`order.${order.status}`),
          to: statusT(`order.${reviewTargetStatus(decision)}`),
        }),
      };
    }
    if (block === "reasonRequired") return { error: reviewT("reasonRequired") };
    if (block === "reasonTooShort") {
      return { error: reviewT("reasonTooShort", { min: MIN_REASON_LENGTH }) };
    }

    const toStatus = reviewTargetStatus(decision);
    const { error } = await supabase
      .from("work_orders")
      .update({ status: toStatus })
      .eq("id", orderId)
      .eq("company_id", companyId)
      // Compare-and-set: si otra persona ya resolvió esta entrega entre que se
      // leyó y se escribe, esta decisión no pisa la suya.
      .eq("status", order.status);
    if (error) return { error: error.message };

    // La traza del punto 24: qué se decidió, quién, desde y hacia dónde. El
    // motivo va en la nota porque es lo que el instalador tiene que leer para
    // saber qué corregir.
    await supabase.from("order_updates").insert({
      id: crypto.randomUUID(),
      order_id: orderId,
      company_id: companyId,
      created_by: user.id,
      type: "system",
      from_status: order.status,
      to_status: toStatus,
      note: reviewNeedsReason(decision)
        ? reviewT(`note.${decision}`, { reason: reason.trim() })
        : reviewT("note.approve"),
    });

    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
    revalidatePath(`/coordination/${orderId}`);
    if (order.project_id) revalidatePath(`/projects/${order.project_id}`);
    revalidatePath("/dashboard");
  } catch {
    return { error: t("unexpected") };
  }

  return { error: null, ok: true };
}

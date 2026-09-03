"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { hasActiveCompanyRole } from "@/lib/data/company-membership-roles";
import { requestPushDelivery } from "@/lib/push/events";
import {
  assignInstallerThroughGate,
  assignmentGateErrorMessage,
} from "./assignment-gate";
import { operatedCompany, requireOperator } from "./context";
import type { ActionState } from "./types";

// ---------------------------------------------------------------------------
// Asignar instalador (del roster de la empresa) y mover la fecha comprometida
// ---------------------------------------------------------------------------

/**
 * Asignar o desasignar directamente, desde el tablero o la ficha de la orden.
 *
 * Desasignar (`installerId: null`) no pasa por el gate: quitar a alguien
 * nunca crea un conflicto de agenda, y el trigger de la base lo permite sin
 * la compuerta abierta. Asignar sí — es la vía más directa que hay, así que
 * un rechazo del gate se devuelve como el error de la acción, no como una
 * advertencia aparte: acá no hay nada más que estuviera guardándose.
 *
 * **Sin override en esta pantalla.** Si el gate bloquea por traslado
 * (`overrideAllowed`), esta acción no ofrece forzarlo con un motivo — eso
 * pide una UI de confirmación que estos tres accesos rápidos no tienen
 * todavía. El bloqueo por solapamiento, ausencia o elegibilidad no admite
 * override de todos modos (AG-R4), así que es sólo el caso de traslado el
 * que queda sin una salida acá.
 */
export async function assignInstaller(
  orderId: string,
  installerId: string | null,
): Promise<ActionState> {
  const t = await getTranslations("Errors");
  try {
    const { supabase, user } = await requireOperator();
    const { data: order } = await supabase
      .from("work_orders")
      .select("id, company_id")
      .eq("id", orderId)
      .single();
    if (!order) return { error: t("orderNotFound") };
    const companyId = operatedCompany(user, order.company_id);

    if (!installerId) {
      const { error } = await supabase
        .from("work_orders")
        .update({ assigned_installer_id: null })
        .eq("id", orderId)
        .eq("company_id", companyId);
      if (error) return { error: error.message };
      revalidatePath("/orders");
      revalidatePath(`/orders/${orderId}`);
      return { error: null, ok: true };
    }

    // Chequeo rápido antes de llamar al gate: mejor mensaje puntual que el
    // código genérico `NOT_ELIGIBLE` para el caso más común de rechazo.
    const installerIsActive = await hasActiveCompanyRole(
      supabase,
      companyId,
      installerId,
      "installer",
    );
    if (!installerIsActive) {
      return { error: t("installerNotActive") };
    }

    const gateResult = await assignInstallerThroughGate(supabase, {
      orderId,
      installerId,
      operationId: crypto.randomUUID(),
    });
    if (!gateResult.available) {
      return { error: await assignmentGateErrorMessage(gateResult.code) };
    }

    await requestPushDelivery(supabase, "order_assigned", orderId, installerId);

    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
  } catch {
    return { error: t("unexpected") };
  }
  return { error: null, ok: true };
}

const rescheduleSchema = z.object({
  orderId: z.string().uuid(),
  scheduledDate: z.iso.date(),
  scheduledEndDate: z.union([z.iso.date(), z.literal("")]),
  reason: z.string().trim().max(600).default(""),
}).refine(
  (value) => !value.scheduledEndDate || value.scheduledEndDate >= value.scheduledDate,
  { path: ["scheduledEndDate"] },
);

/**
 * Reprogramar es un acto con consecuencias para el instalador: le puede pisar
 * otro trabajo ya aceptado. Por eso no basta con escribir la fecha nueva — hay
 * que avisarle, y dejar constancia de cuándo, porque de ese momento (y no del
 * cambio de fecha) arranca su plazo de dos días hábiles para contestar.
 *
 * Las cuatro escrituras que eso implica viven en `reschedule_order_with_notice`
 * para que entren juntas o no entre ninguna: un plazo corriendo por un aviso
 * que nunca se persistió es exactamente lo que el requisito prohíbe.
 */
export async function rescheduleOrder(input: {
  orderId: string;
  scheduledDate: string;
  scheduledEndDate: string;
  reason?: string;
}): Promise<ActionState> {
  const t = await getTranslations("Errors");
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return { error: t("invalidData") };
  try {
    const { supabase } = await requireOperator();
    const { data: order } = await supabase
      .from("work_orders")
      .select("project_id")
      .eq("id", parsed.data.orderId)
      .single();

    // El permiso lo vuelve a validar la función en el servidor: es
    // `security definer`, así que no puede confiar en que la RLS la filtre.
    const { error } = await supabase.rpc("reschedule_order_with_notice", {
      p_order_id: parsed.data.orderId,
      p_scheduled_date: parsed.data.scheduledDate,
      // Sin fecha final se omite el argumento y la función usa su default
      // null, que además limpia la que hubiera. El generador de tipos no
      // modela parámetros nulables, así que mandar `null` explícito no
      // compila.
      ...(parsed.data.scheduledEndDate
        ? { p_scheduled_end_date: parsed.data.scheduledEndDate }
        : {}),
      p_reason: parsed.data.reason ?? "",
    });
    if (error) return { error: error.message };

    revalidatePath("/dashboard");
    revalidatePath("/orders");
    revalidatePath(`/orders/${parsed.data.orderId}`);
    revalidatePath("/tasks");
    if (order?.project_id) revalidatePath(`/projects/${order.project_id}`);
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

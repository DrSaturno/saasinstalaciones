"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { hasActiveCompanyRole } from "@/lib/data/company-membership-roles";
import { requestPushDelivery } from "@/lib/push/events";
import { operatedCompany, requireOperator } from "./context";
import type { ActionState } from "./types";

// ---------------------------------------------------------------------------
// Asignar instalador (del roster de la empresa) y mover la fecha comprometida
// ---------------------------------------------------------------------------

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

    // Si se asigna alguien, debe estar activo y conservar instalación.
    if (installerId) {
      const installerIsActive = await hasActiveCompanyRole(
        supabase,
        companyId,
        installerId,
        "installer",
      );
      if (!installerIsActive) {
        return { error: t("installerNotActive") };
      }
    }

    const { error } = await supabase
      .from("work_orders")
      .update({ assigned_installer_id: installerId })
      .eq("id", orderId)
      .eq("company_id", companyId);
    if (error) return { error: error.message };

    if (installerId) {
      await requestPushDelivery(supabase, "order_assigned", orderId, installerId);
    }

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
}).refine(
  (value) => !value.scheduledEndDate || value.scheduledEndDate >= value.scheduledDate,
  { path: ["scheduledEndDate"] },
);

export async function rescheduleOrder(input: {
  orderId: string;
  scheduledDate: string;
  scheduledEndDate: string;
}): Promise<ActionState> {
  const t = await getTranslations("Errors");
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return { error: t("invalidData") };
  try {
    const { supabase, user } = await requireOperator();
    const { data: existing } = await supabase
      .from("work_orders")
      .select("id, company_id")
      .eq("id", parsed.data.orderId)
      .single();
    if (!existing) return { error: t("orderNotFound") };
    const companyId = operatedCompany(user, existing.company_id);

    const { data: order, error } = await supabase
      .from("work_orders")
      .update({
        scheduled_date: parsed.data.scheduledDate,
        scheduled_end_date: parsed.data.scheduledEndDate || null,
      })
      .eq("id", parsed.data.orderId)
      .eq("company_id", companyId)
      .select("project_id")
      .single();
    if (error || !order) return { error: error?.message ?? t("orderNotFound") };
    revalidatePath("/dashboard");
    revalidatePath("/orders");
    revalidatePath(`/orders/${parsed.data.orderId}`);
    revalidatePath(`/projects/${order.project_id}`);
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

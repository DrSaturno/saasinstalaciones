"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const incidentSchema = z.object({
  orderId: z.string().uuid(),
  category: z.enum(["failed_visit", "missing_materials", "client_absent", "technical_issue", "revisit_required", "complaint", "rejected_work", "incomplete_work", "other"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  description: z.string().trim().max(2000),
  requiresRevisit: z.boolean(),
});

export type IncidentActionState = { error: string | null; ok?: boolean };

async function requireManager() {
  const user = await getCurrentUser();
  if (!user || !["company_manager", "coordinator"].includes(user.role) || !user.companyId) throw new Error("access");
  return { user, companyId: user.companyId, supabase: await createClient() };
}
export async function createIncident(input: z.infer<typeof incidentSchema>): Promise<IncidentActionState> {
  const t = await getTranslations("Errors");
  const parsed = incidentSchema.safeParse(input);
  if (!parsed.success) return { error: t("invalidUpdate") };
  try {
    const { user, companyId, supabase } = await requireManager();
    const { data: order } = await supabase.from("work_orders").select("id").eq("id", parsed.data.orderId).eq("company_id", companyId).single();
    if (!order) return { error: t("orderNotFound") };
    const { error } = await supabase.from("order_incidents").insert({
      order_id: parsed.data.orderId,
      company_id: companyId,
      category: parsed.data.category,
      severity: parsed.data.severity,
      description: parsed.data.description,
      requires_revisit: parsed.data.requiresRevisit,
      created_by: user.id,
    });
    if (error) return { error: error.message };
    revalidatePath(`/orders/${parsed.data.orderId}`);
    revalidatePath("/dashboard");
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

export async function resolveIncident(incidentId: string, orderId: string): Promise<IncidentActionState> {
  const t = await getTranslations("Errors");
  if (!z.string().uuid().safeParse(incidentId).success || !z.string().uuid().safeParse(orderId).success) return { error: t("invalidUpdate") };
  try {
    const { user, companyId, supabase } = await requireManager();
    const { error } = await supabase.from("order_incidents").update({
      status: "resolved",
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    }).eq("id", incidentId).eq("order_id", orderId).eq("company_id", companyId).eq("status", "open");
    if (error) return { error: error.message };
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/dashboard");
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

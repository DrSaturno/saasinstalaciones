"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import {
  applicationSchema,
  createBroadcastSchema,
  resolveApplicationSchema,
  updateBroadcastSchema,
} from "@/lib/domain/broadcasts";
import { requestPushDelivery } from "@/lib/push/events";
import { createClient } from "@/lib/supabase/server";

export type BroadcastActionState = { error: string | null; ok?: boolean };

async function requireManager() {
  const user = await getCurrentUser();
  if (!user || user.role !== "company_manager" || !user.companyId) {
    throw new Error("Acceso denegado");
  }
  return { user, companyId: user.companyId, supabase: await createClient() };
}

async function requireInstaller() {
  const user = await getCurrentUser();
  if (!user || user.role !== "installer") throw new Error("Acceso denegado");
  return { user, supabase: await createClient() };
}

function errorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  return fallback;
}

export async function createBroadcast(
  _previous: BroadcastActionState,
  formData: FormData,
): Promise<BroadcastActionState> {
  const t = await getTranslations("Errors");
  const parsed = createBroadcastSchema.safeParse({
    projectId: formData.get("projectId"),
    zone: formData.get("zone"),
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    slots: formData.get("slots"),
  });
  if (!parsed.success) {
    return { error: t("invalidData") };
  }

  try {
    const { companyId, supabase } = await requireManager();
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", parsed.data.projectId)
      .eq("company_id", companyId)
      .single();
    if (!project) return { error: t("projectNotFound") };

    const { data: broadcast, error } = await supabase
      .from("broadcasts")
      .insert({
        company_id: companyId,
        project_id: project.id,
        zone: parsed.data.zone,
        title: parsed.data.title,
        description: parsed.data.description,
        slots: parsed.data.slots,
      })
      .select("id")
      .single();
    if (error || !broadcast) return { error: t("publishBroadcast") };

    await requestPushDelivery(supabase, "broadcast_created", broadcast.id);
    revalidatePath("/broadcasts");
    return { error: null, ok: true };
  } catch (error) {
    return { error: errorMessage(error, t("operation")) };
  }
}

export async function updateBroadcast(input: {
  broadcastId: string;
  title: string;
  description: string;
  slots: number;
}): Promise<BroadcastActionState> {
  const t = await getTranslations("Errors");
  const parsed = updateBroadcastSchema.safeParse(input);
  if (!parsed.success) {
    return { error: t("invalidData") };
  }

  try {
    const { companyId, supabase } = await requireManager();
    const { count } = await supabase
      .from("broadcast_applications")
      .select("installer_id", { count: "exact", head: true })
      .eq("broadcast_id", parsed.data.broadcastId)
      .eq("status", "accepted");
    if ((count ?? 0) > parsed.data.slots) {
      return { error: t("slotsBelowAccepted") };
    }

    const { data, error } = await supabase
      .from("broadcasts")
      .update({
        title: parsed.data.title,
        description: parsed.data.description,
        slots: parsed.data.slots,
      })
      .eq("id", parsed.data.broadcastId)
      .eq("company_id", companyId)
      .eq("status", "open")
      .select("id")
      .single();
    if (error || !data) return { error: t("broadcastClosed") };

    revalidatePath("/broadcasts");
    return { error: null, ok: true };
  } catch (error) {
    return { error: errorMessage(error, t("operation")) };
  }
}

export async function closeBroadcast(
  broadcastId: string,
): Promise<BroadcastActionState> {
  const t = await getTranslations("Errors");
  try {
    const { supabase } = await requireManager();
    const { error } = await supabase.rpc("close_broadcast", {
      p_broadcast_id: broadcastId,
    });
    if (error) return { error: t("operation") };
    await requestPushDelivery(supabase, "application_rejected", broadcastId);
    revalidatePath("/broadcasts");
    return { error: null, ok: true };
  } catch (error) {
    return { error: errorMessage(error, t("operation")) };
  }
}

export async function applyToBroadcast(
  broadcastId: string,
  message: string,
): Promise<BroadcastActionState> {
  const t = await getTranslations("Errors");
  const parsed = applicationSchema.safeParse({ broadcastId, message });
  if (!parsed.success) {
    return { error: t("invalidData") };
  }

  try {
    const { user, supabase } = await requireInstaller();
    const { error } = await supabase.from("broadcast_applications").insert({
      broadcast_id: parsed.data.broadcastId,
      installer_id: user.id,
      message: parsed.data.message,
    });
    if (error) {
      if (error.code === "23505") return { error: t("alreadyApplied") };
      return { error: t("operation") };
    }

    await requestPushDelivery(
      supabase,
      "application_received",
      parsed.data.broadcastId,
    );
    revalidatePath("/jobs");
    return { error: null, ok: true };
  } catch (error) {
    return { error: errorMessage(error, t("operation")) };
  }
}

export async function acceptApplication(input: {
  broadcastId: string;
  installerId: string;
  orderIds: string[];
}): Promise<BroadcastActionState> {
  const t = await getTranslations("Errors");
  const parsed = resolveApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return { error: t("invalidData") };
  }

  try {
    const { supabase } = await requireManager();
    const { error } = await supabase.rpc("accept_broadcast_application", {
      p_broadcast_id: parsed.data.broadcastId,
      p_installer_id: parsed.data.installerId,
      p_order_ids: parsed.data.orderIds,
    });
    if (error) return { error: t("operation") };

    await Promise.all([
      requestPushDelivery(
        supabase,
        "application_accepted",
        parsed.data.broadcastId,
        parsed.data.installerId,
      ),
      requestPushDelivery(supabase, "application_rejected", parsed.data.broadcastId),
      ...parsed.data.orderIds.map((orderId) =>
        requestPushDelivery(supabase, "order_assigned", orderId, parsed.data.installerId),
      ),
    ]);
    revalidatePath("/broadcasts");
    revalidatePath("/orders");
    return { error: null, ok: true };
  } catch (error) {
    return { error: errorMessage(error, t("operation")) };
  }
}

export async function rejectApplication(
  broadcastId: string,
  installerId: string,
): Promise<BroadcastActionState> {
  const t = await getTranslations("Errors");
  const parsed = resolveApplicationSchema.safeParse({
    broadcastId,
    installerId,
    orderIds: [],
  });
  if (!parsed.success) return { error: t("invalidData") };

  try {
    const { supabase } = await requireManager();
    const { error } = await supabase.rpc("reject_broadcast_application", {
      p_broadcast_id: parsed.data.broadcastId,
      p_installer_id: parsed.data.installerId,
    });
    if (error) return { error: t("operation") };
    await requestPushDelivery(
      supabase,
      "application_rejected",
      parsed.data.broadcastId,
      parsed.data.installerId,
    );
    revalidatePath("/broadcasts");
    return { error: null, ok: true };
  } catch (error) {
    return { error: errorMessage(error, t("operation")) };
  }
}

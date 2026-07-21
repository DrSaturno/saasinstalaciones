"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { canTransition } from "@/lib/domain/transitions";
import { requestPushDelivery } from "@/lib/push/events";
import type { OrderStatus, OrderUpdateType } from "@/types/database";

async function requireInstaller() {
  const user = await getCurrentUser();
  if (!user || user.role !== "installer") {
    throw new Error("Acceso denegado");
  }
  return { user, supabase: await createClient() };
}

export type ActionState = { error: string | null; ok?: boolean };

/**
 * Transición del instalador sobre una orden suya. Idempotente: si la orden ya
 * está en el estado destino, es un no-op exitoso (importa para el retry offline
 * del Paso 9). El trigger de la DB valida la transición igual.
 */
async function installerTransition(
  orderId: string,
  toStatus: OrderStatus,
): Promise<ActionState> {
  const t = await getTranslations("Errors");
  const { supabase, user } = await requireInstaller();

  const { data: order } = await supabase
    .from("work_orders")
    .select("id, status, assigned_installer_id")
    .eq("id", orderId)
    .single();
  if (!order || order.assigned_installer_id !== user.id) {
    return { error: t("orderNotAssigned") };
  }
  if (order.status === toStatus) return { error: null, ok: true }; // idempotente
  if (!canTransition(order.status, toStatus)) {
    return { error: t("invalidTransition") };
  }

  const { error } = await supabase
    .from("work_orders")
    .update({ status: toStatus })
    .eq("id", orderId);
  if (error) return { error: error.message };
  return { error: null, ok: true };
}

const updateSchema = z.object({
  orderId: z.string().uuid(),
  updateId: z.string().uuid(), // generado en el CLIENTE: idempotencia offline
  type: z.enum(["checkin", "progress", "blocker", "done"]),
  note: z.string().max(2000).optional().default(""),
  photos: z.array(z.string()).max(10).optional().default([]),
});

/**
 * Registra un avance en la orden. `updateId` viene del cliente para que un
 * reintento (offline) no duplique la fila: upsert con ignoreDuplicates.
 */
export async function addUpdate(input: {
  orderId: string;
  updateId: string;
  type: OrderUpdateType;
  note?: string;
  photos?: string[];
}): Promise<ActionState> {
  const t = await getTranslations("Errors");
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { error: t("invalidUpdate") };

  try {
    const { supabase, user } = await requireInstaller();

    const { data: order } = await supabase
      .from("work_orders")
      .select("id, company_id, assigned_installer_id")
      .eq("id", parsed.data.orderId)
      .single();
    if (!order || order.assigned_installer_id !== user.id) {
      return { error: t("orderNotAssigned") };
    }

    const { error } = await supabase.from("order_updates").upsert(
      {
        id: parsed.data.updateId,
        order_id: parsed.data.orderId,
        company_id: order.company_id,
        installer_id: user.id,
        type: parsed.data.type,
        note: parsed.data.note ?? "",
        photos: parsed.data.photos ?? [],
        client_created_at: new Date().toISOString(),
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (error) return { error: error.message };

    await requestPushDelivery(supabase, "update_received", parsed.data.updateId);

    revalidatePath(`/tasks/${parsed.data.orderId}`);
  } catch {
    return { error: t("unexpected") };
  }
  return { error: null, ok: true };
}

/** Iniciar trabajo: planificada → en_proceso, con check-in en el historial. */
export async function startTask(
  orderId: string,
  checkinId: string,
): Promise<ActionState> {
  const [t, taskT] = await Promise.all([
    getTranslations("Errors"),
    getTranslations("TaskActions"),
  ]);
  try {
    const res = await installerTransition(orderId, "en_proceso");
    if (res.error) return res;
    await addUpdate({ orderId, updateId: checkinId, type: "checkin", note: taskT("startedNote") });
    revalidatePath("/tasks");
    revalidatePath(`/tasks/${orderId}`);
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

/** Terminar: en_proceso → en_revision. La empresa después aprueba a finalizada. */
export async function finishTask(
  orderId: string,
  doneId: string,
  note?: string,
  photos?: string[],
): Promise<ActionState> {
  const [t, taskT] = await Promise.all([
    getTranslations("Errors"),
    getTranslations("TaskActions"),
  ]);
  try {
    await addUpdate({ orderId, updateId: doneId, type: "done", note: note ?? taskT("finishedNote"), photos });
    const res = await installerTransition(orderId, "en_revision");
    if (res.error) return res;
    revalidatePath("/tasks");
    revalidatePath(`/tasks/${orderId}`);
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

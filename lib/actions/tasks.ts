"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { canTransition } from "@/lib/domain/transitions";
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
  const { supabase, user } = await requireInstaller();

  const { data: order } = await supabase
    .from("work_orders")
    .select("id, status, assigned_installer_id")
    .eq("id", orderId)
    .single();
  if (!order || order.assigned_installer_id !== user.id) {
    return { error: "Esta orden no está asignada a vos." };
  }
  if (order.status === toStatus) return { error: null, ok: true }; // idempotente
  if (!canTransition(order.status, toStatus)) {
    return { error: "No podés hacer ese cambio en este momento." };
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
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos de avance inválidos" };

  try {
    const { supabase, user } = await requireInstaller();

    const { data: order } = await supabase
      .from("work_orders")
      .select("id, company_id, assigned_installer_id")
      .eq("id", parsed.data.orderId)
      .single();
    if (!order || order.assigned_installer_id !== user.id) {
      return { error: "Esta orden no está asignada a vos." };
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

    revalidatePath(`/tasks/${parsed.data.orderId}`);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" };
  }
  return { error: null, ok: true };
}

/** Iniciar trabajo: planificada → en_proceso, con check-in en el historial. */
export async function startTask(
  orderId: string,
  checkinId: string,
): Promise<ActionState> {
  try {
    const res = await installerTransition(orderId, "en_proceso");
    if (res.error) return res;
    await addUpdate({ orderId, updateId: checkinId, type: "checkin", note: "Trabajo iniciado" });
    revalidatePath("/tasks");
    revalidatePath(`/tasks/${orderId}`);
    return { error: null, ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" };
  }
}

/** Terminar: en_proceso → en_revision. La empresa después aprueba a finalizada. */
export async function finishTask(
  orderId: string,
  doneId: string,
  note?: string,
  photos?: string[],
): Promise<ActionState> {
  try {
    await addUpdate({ orderId, updateId: doneId, type: "done", note: note ?? "Trabajo terminado", photos });
    const res = await installerTransition(orderId, "en_revision");
    if (res.error) return res;
    revalidatePath("/tasks");
    revalidatePath(`/tasks/${orderId}`);
    return { error: null, ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" };
  }
}

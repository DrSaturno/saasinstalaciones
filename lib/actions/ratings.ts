"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { ratingInputSchema } from "@/lib/domain/ratings";
import { createClient } from "@/lib/supabase/server";

export type RatingActionState = { error: string | null; ok?: boolean };

async function requireManager() {
  const user = await getCurrentUser();
  if (!user || user.role !== "company_manager" || !user.companyId) {
    throw new Error("Acceso denegado");
  }
  return { supabase: await createClient(), companyId: user.companyId };
}

/**
 * Califica al instalador realmente asignado a una orden finalizada.
 * company_id e installer_id se resuelven en el servidor; el cliente solo
 * aporta la orden, las estrellas y el comentario.
 */
export async function rateInstaller(
  orderId: string,
  stars: number,
  comment: string,
): Promise<RatingActionState> {
  const parsed = ratingInputSchema.safeParse({ orderId, stars, comment });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  try {
    const { supabase, companyId } = await requireManager();
    const { data: order } = await supabase
      .from("work_orders")
      .select("id, status, assigned_installer_id")
      .eq("id", parsed.data.orderId)
      .eq("company_id", companyId)
      .single();

    if (!order) return { error: "Orden no encontrada" };
    if (order.status !== "finalizada") {
      return { error: "La orden debe estar finalizada antes de calificar" };
    }
    if (!order.assigned_installer_id) {
      return { error: "La orden no tiene un instalador asignado" };
    }

    const { data: existing } = await supabase
      .from("ratings")
      .select("id")
      .eq("order_id", order.id)
      .maybeSingle();
    if (existing) return { error: "Esta orden ya fue calificada" };

    const { error } = await supabase.from("ratings").insert({
      order_id: order.id,
      company_id: companyId,
      installer_id: order.assigned_installer_id,
      stars: parsed.data.stars,
      comment: parsed.data.comment,
    });
    if (error) {
      if (error.code === "23505") {
        return { error: "Esta orden ya fue calificada" };
      }
      return { error: error.message };
    }

    revalidatePath(`/orders/${order.id}`);
    revalidatePath("/team");
    revalidatePath("/profile");
    return { error: null, ok: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Error inesperado",
    };
  }
}

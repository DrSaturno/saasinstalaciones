"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import type { RosterStatus } from "@/types/database";

async function requireManager() {
  const user = await getCurrentUser();
  if (!user || user.role !== "company_manager" || !user.companyId) {
    throw new Error("Acceso denegado");
  }
  return { user, supabase: await createClient(), companyId: user.companyId };
}

const emailSchema = z.string().email("Email inválido");

export type InviteResult = { error: string | null; token?: string };

/**
 * Crea una invitación para un instalador. Devuelve el token para armar el link
 * que el manager comparte (el envío por email es best-effort/pendiente).
 */
export async function inviteInstaller(email: string): Promise<InviteResult> {
  const parsed = emailSchema.safeParse(email.trim().toLowerCase());
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Email inválido" };
  }

  try {
    const { supabase, companyId } = await requireManager();

    // Evitar invitaciones pendientes duplicadas al mismo email.
    const { data: existing } = await supabase
      .from("invitations")
      .select("token")
      .eq("company_id", companyId)
      .eq("email", parsed.data)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) {
      return { error: null, token: existing.token };
    }

    const { data, error } = await supabase
      .from("invitations")
      .insert({ company_id: companyId, email: parsed.data })
      .select("token")
      .single();
    if (error || !data) {
      return { error: error?.message ?? "No se pudo crear la invitación" };
    }

    revalidatePath("/team");
    return { error: null, token: data.token };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" };
  }
}

export type ActionState = { error: string | null; ok?: boolean };

export async function cancelInvitation(invitationId: string): Promise<ActionState> {
  try {
    const { supabase, companyId } = await requireManager();
    const { error } = await supabase
      .from("invitations")
      .update({ status: "expired" })
      .eq("id", invitationId)
      .eq("company_id", companyId);
    if (error) return { error: error.message };
    revalidatePath("/team");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" };
  }
  return { error: null, ok: true };
}

/** Cambia el estado de un miembro del roster (quitar / reactivar). */
export async function setRosterStatus(
  installerId: string,
  status: Extract<RosterStatus, "active" | "removed">,
): Promise<ActionState> {
  try {
    const { supabase, companyId } = await requireManager();

    // Al quitar del equipo, liberamos sus órdenes NO terminadas para reasignar.
    if (status === "removed") {
      await supabase
        .from("work_orders")
        .update({ assigned_installer_id: null })
        .eq("company_id", companyId)
        .eq("assigned_installer_id", installerId)
        .not("status", "in", "(finalizada,cancelada)");
    }

    const { error } = await supabase
      .from("company_installers")
      .update({ status })
      .eq("company_id", companyId)
      .eq("installer_id", installerId);
    if (error) return { error: error.message };

    revalidatePath("/team");
    revalidatePath("/orders");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" };
  }
  return { error: null, ok: true };
}

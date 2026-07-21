"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import {
  invitationUrl,
  sendInvitationEmail,
  type InvitationEmailStatus,
} from "@/lib/email/invitations";
import { INTL_LOCALE } from "@/i18n/config";
import type { RosterStatus } from "@/types/database";

async function requireManager() {
  const user = await getCurrentUser();
  if (!user || user.role !== "company_manager" || !user.companyId) {
    throw new Error("Acceso denegado");
  }
  return { user, supabase: await createClient(), companyId: user.companyId };
}

const emailSchema = z.string().email("Email inválido");

export type InviteResult = {
  error: string | null;
  token?: string;
  emailStatus?: InvitationEmailStatus;
};

/**
 * Crea una invitación para un instalador y envía el email como best effort.
 * El token siempre vuelve al manager para conservar el flujo manual de respaldo.
 */
export async function inviteInstaller(email: string): Promise<InviteResult> {
  const t = await getTranslations("Errors");
  const parsed = emailSchema.safeParse(email.trim().toLowerCase());
  if (!parsed.success) {
    return { error: t("invalidEmail") };
  }

  try {
    const { user, supabase, companyId } = await requireManager();

    const [{ data: existing }, { data: company }, emailT] = await Promise.all([
      supabase
        .from("invitations")
        .select("token")
        .eq("company_id", companyId)
        .eq("email", parsed.data)
        .eq("status", "pending")
        .maybeSingle(),
      supabase.from("companies").select("name").eq("id", companyId).single(),
      getTranslations({
        locale: INTL_LOCALE[user.locale],
        namespace: "InvitationEmail",
      }),
    ]);

    let token = existing?.token;
    if (!token) {
      const { data, error } = await supabase
        .from("invitations")
        .insert({ company_id: companyId, email: parsed.data })
        .select("token")
        .single();
      if (error || !data) {
        return { error: t("createInvitation") };
      }
      token = data.token;
    }

    const companyName = company?.name ?? "Instala Pro";
    const emailStatus = await sendInvitationEmail({
      to: parsed.data,
      token,
      invitationUrl: invitationUrl(token),
      copy: {
        subject: emailT("subject", { company: companyName }),
        heading: emailT("heading"),
        body: emailT("body", { company: companyName }),
        cta: emailT("cta"),
        expires: emailT("expires"),
        fallback: emailT("fallback"),
      },
    });

    revalidatePath("/team");
    return { error: null, token, emailStatus };
  } catch {
    return { error: t("unexpected") };
  }
}

export type ActionState = { error: string | null; ok?: boolean };

export async function cancelInvitation(invitationId: string): Promise<ActionState> {
  const t = await getTranslations("Errors");
  try {
    const { supabase, companyId } = await requireManager();
    const { error } = await supabase
      .from("invitations")
      .update({ status: "expired" })
      .eq("id", invitationId)
      .eq("company_id", companyId);
    if (error) return { error: error.message };
    revalidatePath("/team");
  } catch {
    return { error: t("unexpected") };
  }
  return { error: null, ok: true };
}

/** Cambia el estado de un miembro del roster (quitar / reactivar). */
export async function setRosterStatus(
  installerId: string,
  status: Extract<RosterStatus, "active" | "removed">,
): Promise<ActionState> {
  const t = await getTranslations("Errors");
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
  } catch {
    return { error: t("unexpected") };
  }
  return { error: null, ok: true };
}

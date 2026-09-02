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
import type { MembershipRole, RosterStatus } from "@/types/database";

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
export async function inviteInstaller(
  email: string,
  role: "installer" | "coordinator" = "installer",
): Promise<InviteResult> {
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
        .eq("role", role)
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
        .insert({ company_id: companyId, email: parsed.data, role })
        .select("token")
        .single();
      if (error || !data) {
        return { error: t("createInvitation") };
      }
      token = data.token;
    }

    const companyName = company?.name ?? "Se Instala";
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
        imageAlt: emailT("imageAlt"),
        language: user.locale,
      },
    });

    revalidatePath("/team");
    return { error: null, token, emailStatus };
  } catch {
    return { error: t("unexpected") };
  }
}

export type ActionState = { error: string | null; ok?: boolean };

const memberRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["installer", "coordinator"]),
});

function revalidateMemberRolePaths() {
  revalidatePath("/team");
  revalidatePath("/orders");
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  revalidatePath("/home");
  revalidatePath("/jobs");
}

function membershipRoleErrorKey(message: string) {
  if (message.includes("conservar al menos")) return "membershipMustKeepRole";
  if (message.includes("rdenes abiertas")) return "installerRoleOpenOrders";
  if (message.includes("proyectos activos")) {
    return "coordinatorRoleActiveProjects";
  }
  return null;
}

async function changeMemberRole(
  userId: string,
  role: MembershipRole,
  operation: "grant" | "revoke",
): Promise<ActionState> {
  const t = await getTranslations("Errors");
  const parsed = memberRoleSchema.safeParse({ userId, role });
  if (!parsed.success) return { error: t("invalidData") };

  try {
    const { supabase } = await requireManager();
    const { error } =
      operation === "grant"
        ? await supabase.rpc("grant_company_member_role", {
            p_user_id: parsed.data.userId,
            p_role: parsed.data.role,
          })
        : await supabase.rpc("revoke_company_member_role", {
            p_user_id: parsed.data.userId,
            p_role: parsed.data.role,
          });

    if (error) {
      const errorKey = membershipRoleErrorKey(error.message);
      return { error: errorKey ? t(errorKey) : error.message };
    }

    revalidateMemberRolePaths();
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

/** Agrega una capacidad sin quitar las que la persona ya tenía. */
export async function grantMemberRole(
  userId: string,
  role: MembershipRole,
): Promise<ActionState> {
  return changeMemberRole(userId, role, "grant");
}

/** Quita una capacidad; la RPC impide dejar la membresía sin ninguna. */
export async function revokeMemberRole(
  userId: string,
  role: MembershipRole,
): Promise<ActionState> {
  return changeMemberRole(userId, role, "revoke");
}

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

/**
 * Fija la tarifa sugerida de un instalador dentro de esta empresa.
 *
 * Es sólo un punto de partida: al crear una orden prellena el costo, pero el
 * monto que vale es siempre el guardado en la orden. Por eso cambiarla no
 * modifica ninguna orden ya creada — sería reescribir plata ya acordada.
 *
 * `null` borra la sugerencia y deja el campo en blanco al crear órdenes.
 */
export async function setInstallerDefaultRate(
  installerId: string,
  rate: number | null,
): Promise<ActionState> {
  const t = await getTranslations("Errors");
  const parsed = z
    .object({
      installerId: z.string().uuid(),
      rate: z.number().min(0).max(99_999_999).nullable(),
    })
    .safeParse({ installerId, rate });
  if (!parsed.success) return { error: t("invalidData") };

  try {
    const { supabase, companyId } = await requireManager();
    const { error } = await supabase
      .from("company_installers")
      .update({ default_installer_rate: parsed.data.rate })
      .eq("company_id", companyId)
      .eq("installer_id", parsed.data.installerId);
    if (error) return { error: error.message };

    revalidatePath(`/team/${parsed.data.installerId}`);
    revalidatePath("/team");
  } catch {
    return { error: t("unexpected") };
  }
  return { error: null, ok: true };
}

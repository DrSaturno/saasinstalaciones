"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthorizedUser } from "@/lib/auth-authorized";
import {
  invitationUrl,
  sendInvitationEmail,
  type InvitationEmailStatus,
} from "@/lib/email/invitations";
import { INTL_LOCALE } from "@/i18n/config";
import { requiredEmail } from "@/lib/domain/field-rules";

/**
 * Subcuentas del gerente (SUBCTA-*): sólo el DUEÑO llega hasta acá.
 *
 * No hace falta repetir la comprobación en cada RPC de abajo —la RLS de
 * `invitations` (`invitations_staff_owner_all`) y de `company_staff_permissions`
 * (`company_staff_permissions_owner_all`) ya la exigen— pero se guarda igual
 * para devolver un error legible en vez de un «no se insertó nada» silencioso.
 */
async function requireOwner() {
  const user = await getAuthorizedUser();
  if (!user || user.role !== "company_manager" || !user.companyId || !user.isOwner) {
    throw new Error("Acceso denegado");
  }
  return { user, supabase: await createClient(), companyId: user.companyId };
}

const emailSchema = requiredEmail();

export type InviteStaffResult = {
  error: string | null;
  token?: string;
  emailStatus?: InvitationEmailStatus;
};

/**
 * Invita a una subcuenta, con el permiso ya decidido (SUBCTA-R3.3): se
 * aplica en cuanto acepta, vía `accept_company_staff_invitation`.
 */
export async function inviteCompanyStaff(
  email: string,
  permissions: { canManageFinance: boolean; canManageSettings: boolean },
): Promise<InviteStaffResult> {
  const t = await getTranslations("Errors");
  const parsed = emailSchema.safeParse(email.trim().toLowerCase());
  if (!parsed.success) return { error: t("invalidEmail") };

  try {
    const { user, supabase, companyId } = await requireOwner();

    const [{ data: existing }, { data: company }, emailT] = await Promise.all([
      supabase
        .from("invitations")
        .select("token")
        .eq("company_id", companyId)
        .eq("email", parsed.data)
        .eq("role", "company_staff")
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
        .insert({
          company_id: companyId,
          email: parsed.data,
          role: "company_staff",
          staff_can_manage_finance: permissions.canManageFinance,
          staff_can_manage_settings: permissions.canManageSettings,
        })
        .select("token")
        .single();
      if (error || !data) return { error: t("createInvitation") };
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

export type StaffActionState = { error: string | null; ok?: boolean };

const permissionsSchema = z.object({
  userId: z.string().uuid(),
  canManageFinance: z.boolean(),
  canManageSettings: z.boolean(),
});

/** Activa o desactiva, por separado, cada permiso de una subcuenta ya aceptada. */
export async function updateCompanyStaffPermissions(
  input: z.infer<typeof permissionsSchema>,
): Promise<StaffActionState> {
  const t = await getTranslations("Errors");
  const parsed = permissionsSchema.safeParse(input);
  if (!parsed.success) return { error: t("invalidData") };

  try {
    const { supabase, companyId } = await requireOwner();
    const { error } = await supabase
      .from("company_staff_permissions")
      .update({
        can_manage_finance: parsed.data.canManageFinance,
        can_manage_settings: parsed.data.canManageSettings,
      })
      .eq("user_id", parsed.data.userId)
      .eq("company_id", companyId);
    if (error) return { error: t("operation") };
  } catch {
    return { error: t("unexpected") };
  }

  revalidatePath("/team");
  return { error: null, ok: true };
}

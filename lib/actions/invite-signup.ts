"use server";

import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  token: z.string().uuid(),
  fullName: z.string().trim().min(2).max(80),
  password: z.string().min(8).max(72),
});

export type SignupState = { error: string | null };

/**
 * Alta de instalador desde un link de invitación (primera vez, sin cuenta).
 *
 * El rol se fija a "installer" en el servidor: el cliente NUNCA lo controla, así
 * que este flujo no puede escalar privilegios aunque los signups públicos
 * estuvieran habilitados. El email lo toma de la invitación (no del formulario),
 * de modo que la cuenta queda atada al destinatario invitado.
 *
 * Usa el cliente admin (service_role) SOLO para crear el usuario ya confirmado;
 * el alta en el equipo pasa por la RPC `accept_invitation` bajo la sesión del
 * propio instalador, reutilizando sus validaciones.
 */
export async function signUpInstaller(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const t = await getTranslations("Errors");
  const parsed = schema.safeParse({
    token: formData.get("token"),
    fullName: formData.get("fullName"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: t("invalidData") };

  const { token, fullName, password } = parsed.data;

  // 1. Validar la invitación y obtener el email invitado (server-controlado).
  const supabase = await createClient();
  const { data: preview } = await supabase.rpc("invitation_preview", {
    p_token: token,
  });
  const invite = Array.isArray(preview) ? preview[0] : null;
  if (!invite || !invite.valid || !invite.email) {
    return { error: t("invalidInvitation") };
  }

  const locale = (await getLocale()).startsWith("pt") ? "pt" : "es";

  // 2. El rol y la empresa salen exclusivamente de la invitación validada.
  const admin = createAdminClient();
  const { error: createError } = await admin.auth.admin.createUser({
    email: invite.email,
    password,
    email_confirm: true,
    user_metadata: {
      role: invite.invite_role,
      company_id: invite.invite_role === "coordinator" ? invite.company_id : undefined,
      full_name: fullName,
      locale,
    },
  });
  if (createError) {
    const code = (createError as { code?: string }).code;
    if (code === "email_exists" || /already/i.test(createError.message)) {
      return { error: t("emailExists") };
    }
    if (code === "weak_password") return { error: t("weakPassword") };
    return { error: t("signupFailed") };
  }

  // 3. Iniciar sesión: setea las cookies de sesión en la respuesta.
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: invite.email,
    password,
  });
  if (signInError) return { error: t("signupFailed") };

  // 4. Sumarse al equipo vía la RPC ya vetada, con la sesión del instalador.
  const { error: acceptError } = await supabase.rpc("accept_invitation", {
    p_token: token,
  });
  if (acceptError) return { error: acceptError.message };

  redirect(invite.invite_role === "coordinator" ? "/dashboard" : "/tasks");
}

"use server";

import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createCorrelationId, logEvent } from "@/lib/observability";

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

  // 2. La cuenta siempre es de campo. El rol por empresa se aplica recién al
  // aceptar la invitación en company_installers.
  const admin = createAdminClient();
  const { data: createData, error: createError } =
    await admin.auth.admin.createUser({
    email: invite.email,
    password,
    email_confirm: true,
    user_metadata: {
      role: "installer",
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

  const createdUserId = createData.user?.id;
  if (!createdUserId) return { error: t("signupFailed") };

  // Auth y Postgres no comparten una transacción. Si un paso posterior falla,
  // compensamos el alta para no dejar una cuenta/perfil huérfanos que además
  // impedirían reintentar la invitación con el mismo email.
  const correlationId = createCorrelationId();
  const rollbackCreatedUser = async (step: string) => {
    const { error } = await admin.auth.admin.deleteUser(createdUserId);
    if (error) {
      // Compensación fallida: quedó una cuenta que además bloquea reintentar la
      // invitación con el mismo email. Requiere limpieza manual.
      logEvent("error", "invite_signup.rollback_failed", {
        correlation_id: correlationId,
        user_id: createdUserId,
        step,
        auth_code: (error as { code?: string }).code ?? null,
      });
      return;
    }
    logEvent("warn", "invite_signup.rolled_back", {
      correlation_id: correlationId,
      user_id: createdUserId,
      step,
    });
  };

  // 3. Iniciar sesión: setea las cookies de sesión en la respuesta.
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: invite.email,
    password,
  });
  if (signInError) {
    await rollbackCreatedUser("sign_in");
    return { error: t("signupFailed") };
  }

  // 4. Sumarse al equipo vía la RPC ya vetada, con la sesión del instalador.
  const { error: acceptError } = await supabase.rpc("accept_invitation", {
    p_token: token,
  });
  if (acceptError) {
    // La sesión ya quedó escrita en cookies; la cerramos antes de borrar la
    // cuenta para no devolver al navegador un token de un usuario inexistente.
    await supabase.auth.signOut();
    await rollbackCreatedUser("accept_invitation");
    return { error: t("signupFailed") };
  }

  logEvent("info", "invite_signup.completed", {
    correlation_id: correlationId,
    user_id: createdUserId,
  });

  redirect("/home");
}

"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { applicationOrigin } from "@/lib/app-origin";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({ email: z.string().email() });

export type ResetRequestState = { error: string | null; sent?: boolean };

/**
 * Pide el email de recuperación.
 *
 * **Responde igual exista o no la cuenta.** Una respuesta distinta convertiría
 * este formulario público en un oráculo para averiguar qué direcciones están
 * registradas. Por eso ni el error de Supabase se propaga: se registra en el
 * servidor y al visitante se le confirma el envío en todos los casos.
 */
export async function requestPasswordReset(
  _prev: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const t = await getTranslations("Errors");
  const parsed = requestSchema.safeParse({ email: formData.get("email") });
  // El formato inválido sí se avisa: no revela nada y evita el envío mudo.
  if (!parsed.success) return { error: t("invalidEmail") };

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(
      parsed.data.email,
      { redirectTo: `${applicationOrigin()}/api/auth/callback` },
    );
    // Incluye el rate limit de Supabase: reintentar seguido no delata nada.
    if (error) console.error("password reset request failed", error.message);
  } catch (error) {
    console.error("password reset request failed", error);
  }

  return { error: null, sent: true };
}

const updateSchema = z
  .object({
    newPassword: z.string().min(8).max(72),
    confirmPassword: z.string().min(1),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "mismatch",
  });

export type ResetPasswordState = { error: string | null; ok?: boolean };

/**
 * Fija la contraseña nueva al volver desde el link del email.
 *
 * A diferencia de `changePassword`, acá no se pide la contraseña actual: quien
 * llega no la recuerda. La prueba de identidad es la sesión que abrió el link
 * de recuperación, que sólo pudo obtener quien tiene acceso a esa casilla.
 */
export async function setNewPassword(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const t = await getTranslations("Errors");
  const parsed = updateSchema.safeParse({
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.message === "mismatch") return { error: t("passwordMismatch") };
    return { error: t("weakPassword") };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Sin sesión de recuperación no hay nada que probar quién es.
  if (!user) return { error: t("resetLinkInvalid") };

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "weak_password") return { error: t("weakPassword") };
    if (code === "same_password") return { error: t("samePassword") };
    return { error: t("operation") };
  }

  return { error: null, ok: true };
}

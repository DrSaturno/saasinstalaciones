"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(72),
    confirmPassword: z.string().min(1),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "mismatch",
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    path: ["newPassword"],
    message: "same",
  });

export type PasswordState = { error: string | null; ok?: boolean };

/**
 * Cambio de contraseña de la propia cuenta.
 *
 * Reautentica con la contraseña actual antes de cambiarla: si alguien deja la
 * sesión abierta, no puede quedarse con la cuenta sin conocer la clave vigente.
 * Nunca se loguea ni se devuelve el valor de ninguna de las dos contraseñas.
 */
export async function changePassword(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const t = await getTranslations("Errors");
  const parsed = schema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.message === "mismatch") return { error: t("passwordMismatch") };
    if (issue?.message === "same") return { error: t("samePassword") };
    if (issue?.path[0] === "newPassword") return { error: t("weakPassword") };
    return { error: t("invalidData") };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: t("notAuthenticated") };

  // 1. Verificar la contraseña actual (reautenticación).
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });
  if (signInError) return { error: t("currentPasswordWrong") };

  // 2. Recién ahí, actualizarla.
  const { error: updateError } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });
  if (updateError) {
    const code = (updateError as { code?: string }).code;
    if (code === "weak_password") return { error: t("weakPassword") };
    if (code === "same_password") return { error: t("samePassword") };
    return { error: t("operation") };
  }

  return { error: null, ok: true };
}

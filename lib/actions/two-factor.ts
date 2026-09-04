"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { clientIp, enforceRateLimit } from "@/lib/security/rate-limit";

/**
 * Verificación en dos pasos (TOTP) — SEC-13 de la auditoría.
 *
 * Obligatoria para platform_admin y company_manager (el enforcement vive en los
 * layouts de esas áreas), opcional para instaladores. Toda la maquinaria de
 * TOTP la provee Supabase Auth (`auth.mfa.*`); acá sólo se envuelve con Zod,
 * rate limiting sobre los códigos y mensajes traducidos.
 */

export type EnrollState =
  | { ok: true; factorId: string; qrCode: string; secret: string }
  | { ok: false; error: string };

/**
 * Arranca el enrolamiento: crea un factor TOTP sin verificar y devuelve el QR
 * y el secreto para que la persona lo cargue en su app de autenticación.
 *
 * Limpia primero cualquier factor a medio enrolar: si alguien abandonó el
 * flujo, un TOTP sin verificar quedaba colgado e impedía crear uno nuevo.
 */
export async function startTotpEnrollment(): Promise<EnrollState> {
  const t = await getTranslations("TwoFactor");
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: t("notAuthenticated") };

  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `totp-${Date.now()}`,
  });
  if (error || !data) return { ok: false, error: t("enrollFailed") };

  return {
    ok: true,
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

const codeSchema = z.object({
  factorId: z.string().min(1),
  code: z.string().trim().regex(/^\d{6}$/),
});

export type VerifyState = { ok: boolean; error?: string };

/**
 * Confirma el factor recién enrolado con el primer código.
 *
 * Al verificar, la sesión sube a AAL2 sola: quien enrola queda protegido en el
 * acto, sin un segundo login.
 */
export async function confirmTotpEnrollment(input: {
  factorId: string;
  code: string;
}): Promise<VerifyState> {
  const t = await getTranslations("TwoFactor");
  const parsed = codeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t("badCode") };

  // Código de 6 dígitos = 1.000.000 de posibilidades: sin freno, es fuerza
  // bruta viable. Por IP porque en el enrolamiento todavía no hay nada más
  // estable a lo que atarse.
  const gate = await enforceRateLimit("mfa_verify", await clientIp(), 10, 300);
  if (!gate.allowed) return { ok: false, error: t("tooManyCodes") };

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: parsed.data.factorId,
    code: parsed.data.code,
  });
  if (error) return { ok: false, error: t("badCode") };
  return { ok: true };
}

/**
 * Sube la sesión a AAL2 en el login (o al entrar a un área protegida) para
 * quien ya tiene un factor verificado.
 */
export async function verifyTotpChallenge(input: {
  code: string;
}): Promise<VerifyState> {
  const t = await getTranslations("TwoFactor");
  const parsed = z.object({ code: z.string().trim().regex(/^\d{6}$/) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: t("badCode") };

  const gate = await enforceRateLimit("mfa_verify", await clientIp(), 10, 300);
  if (!gate.allowed) return { ok: false, error: t("tooManyCodes") };

  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.totp?.[0];
  if (!totp) return { ok: false, error: t("noFactor") };

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: totp.id,
    code: parsed.data.code,
  });
  if (error) return { ok: false, error: t("badCode") };
  return { ok: true };
}

/**
 * Da de baja la verificación en dos pasos. Sólo se ofrece a quien puede
 * apagarla — los roles con MFA obligatoria no ven este botón (lo corta la UI);
 * si aun así llega acá, Supabase la deja apagar, pero el layout la va a exigir
 * de nuevo en la próxima navegación, así que no hay forma de quedar sin ella.
 */
export async function disableTotp(): Promise<VerifyState> {
  const t = await getTranslations("TwoFactor");
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.totp?.[0];
  if (!totp) return { ok: true };
  const { error } = await supabase.auth.mfa.unenroll({ factorId: totp.id });
  if (error) return { ok: false, error: t("disableFailed") };
  return { ok: true };
}

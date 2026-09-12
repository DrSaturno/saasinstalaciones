"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fetchTwoFactorStatus } from "@/lib/data/two-factor";
import { clientIp, enforceRateLimit } from "@/lib/security/rate-limit";

/**
 * Verificación en dos pasos (TOTP) — SEC-13 de la auditoría.
 *
 * El enrolamiento es opt-in. Quien lo activa debe verificar el segundo factor
 * en las páginas protegidas y en las acciones de negocio. Estos comandos de
 * enrolamiento/verificación usan Auth directamente para permitir completar
 * el paso pendiente. Supabase provee TOTP; acá se agregan Zod, rate limiting
 * sobre los códigos y mensajes traducidos.
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

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: t("notAuthenticated") };

  // Por usuario y no por IP: acá ya se sabe quién es. Atarlo a la IP dejaba a
  // una oficina entera detrás de un NAT compartiendo diez intentos, y a la vez
  // le regalaba el límite a quien tuviera varias direcciones.
  const gate = await enforceRateLimit("mfa_verify", userData.user.id, 10, 300);
  if (!gate.allowed) return { ok: false, error: t("tooManyCodes") };

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
 * Da de baja la verificación en dos pasos.
 *
 * **Exige la sesión en AAL2.** Antes esto se apoyaba en que "Supabase la deja
 * apagar" y en que el layout la volvería a pedir — una suposición sobre el
 * comportamiento del proveedor que este repo no verifica en ningún test. Si esa
 * suposición fuera falsa, cualquiera con una sesión AAL1 (una cookie robada,
 * una sesión vieja de antes del enrolamiento) podía apagarle el segundo factor
 * a otra persona y anular la protección para siempre. Apagar una defensa tiene
 * que exigir haberla pasado; el chequeo es barato y vale en los dos escenarios.
 */
export async function disableTotp(): Promise<VerifyState> {
  const t = await getTranslations("TwoFactor");
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: t("notAuthenticated") };

  // Mismo cubo que la verificación: sin freno, esto es un botón para machacar.
  const gate = await enforceRateLimit("mfa_verify", userData.user.id, 10, 300);
  if (!gate.allowed) return { ok: false, error: t("tooManyCodes") };

  const status = await fetchTwoFactorStatus(supabase);
  // Sin poder confirmar el nivel de la sesión NO se apaga nada: ante la duda,
  // la protección se queda puesta.
  if (!status.resolved || !status.satisfied) {
    return { ok: false, error: t("disableNeedsStepUp") };
  }

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.totp?.[0];
  if (!totp) return { ok: true };
  const { error } = await supabase.auth.mfa.unenroll({ factorId: totp.id });
  if (error) return { ok: false, error: t("disableFailed") };
  return { ok: true };
}

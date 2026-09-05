import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, UserRole } from "@/types/database";

/**
 * Estado de la verificación en dos pasos del usuario actual (SEC-13).
 *
 * - `enrolled`: tiene un factor TOTP verificado.
 * - `satisfied`: la sesión ya está en AAL2 (pasó el segundo factor).
 * - `mustStepUp`: tiene factor pero la sesión sigue en AAL1 — falta el código.
 */
export type TwoFactorStatus = {
  enrolled: boolean;
  satisfied: boolean;
  mustStepUp: boolean;
};

export async function fetchTwoFactorStatus(
  supabase: SupabaseClient<Database>,
): Promise<TwoFactorStatus> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const current = data?.currentLevel ?? null;
  const next = data?.nextLevel ?? null;

  // `nextLevel === 'aal2'` es la señal de que existe un factor verificado
  // (Supabase sólo eleva el objetivo cuando hay con qué). `currentLevel` dice
  // si la sesión ya lo cumplió.
  const enrolled = next === "aal2";
  const satisfied = current === "aal2";
  return { enrolled, satisfied, mustStepUp: enrolled && !satisfied };
}

/**
 * Los roles a los que la verificación en dos pasos les es OBLIGATORIA.
 *
 * **Hoy está vacío: la lista es opt-in para todos** (decisión de producto del
 * 05-09-2026). La verificación en dos pasos sigue existiendo entera —se activa
 * desde Configuración y, quien la activa, la usa al entrar—, pero nadie queda
 * forzado a enrolarse para poder trabajar.
 *
 * El enforcement se recupera agregando roles acá y nada más: el gate de abajo,
 * los layouts de `(company)`/`(master)` y el step-up del login ya lo respetan.
 * Volver a `["platform_admin", "company_manager"]` restablece lo que pedía
 * SEC-13 de la auditoría de seguridad (ASVS L2 recomienda segundo factor para
 * cuentas administrativas y de tenant).
 */
export const MFA_REQUIRED_ROLES: readonly UserRole[] = [];

export function mfaRequiredFor(role: UserRole): boolean {
  return MFA_REQUIRED_ROLES.includes(role);
}

/**
 * A dónde mandar al usuario cuando entra a un área protegida sin cumplir MFA.
 * `null` = puede pasar.
 *
 * - Sesión en AAL2: pasa.
 * - Tiene factor pero falta el código: a verificar.
 * - Rol con MFA obligatoria y sin factor: a enrolar.
 * - Resto (instalador sin factor): pasa (para ellos es opcional).
 */
export function twoFactorGate(
  status: TwoFactorStatus,
  role: UserRole,
): "/two-factor/verify" | "/two-factor/setup" | null {
  if (status.satisfied) return null;
  if (status.mustStepUp) return "/two-factor/verify";
  if (mfaRequiredFor(role)) return "/two-factor/setup";
  return null;
}

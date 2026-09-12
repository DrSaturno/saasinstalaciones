import type { SupabaseClient } from "@supabase/supabase-js";
import { logEvent } from "@/lib/observability";
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
  /**
   * `false` cuando Auth no pudo decir en qué nivel está la sesión.
   *
   * Antes esta función lanzaba en ese caso, y de sus nueve llamadores sólo uno
   * —`app/api/master/_guard.ts`— lo envolvía. Los demás dejaban propagar: un
   * hipó de Auth tumbaba el ÁREA ENTERA del gerente con "Algo salió mal", y en
   * el login lanzaba DESPUÉS de que `signInWithPassword` ya había escrito las
   * cookies, con lo que la persona veía un fallo estando de hecho autenticada.
   *
   * Es el modo de falla que `proxy.ts` evita a propósito y documenta (OPS-14):
   * ante una caída de infraestructura, la respuesta correcta no es expulsar ni
   * romper la pantalla. Por eso ahora el estado viaja como dato y cada llamador
   * decide, en vez de una excepción que casi nadie atrapaba.
   */
  resolved: boolean;
};

/** Lo que se sabe cuando Auth no contesta: nada. */
const UNRESOLVED: TwoFactorStatus = {
  enrolled: false,
  satisfied: false,
  mustStepUp: false,
  resolved: false,
};

export async function fetchTwoFactorStatus(
  supabase: SupabaseClient<Database>,
): Promise<TwoFactorStatus> {
  let data: Awaited<
    ReturnType<typeof supabase.auth.mfa.getAuthenticatorAssuranceLevel>
  >["data"] = null;
  try {
    const result = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (result.error) {
      logEvent("error", "two_factor.status_unavailable", {
        reason: result.error.name,
      });
      return UNRESOLVED;
    }
    data = result.data;
  } catch (error) {
    logEvent("error", "two_factor.status_unavailable", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return UNRESOLVED;
  }

  // Sin sesión resoluble, supabase-js devuelve los dos niveles en null y SIN
  // error. Eso no es "no tiene segundo factor": es "no sé".
  if (!data?.currentLevel || !data.nextLevel) {
    logEvent("error", "two_factor.status_unavailable", { reason: "no_session" });
    return UNRESOLVED;
  }

  const current = data.currentLevel;
  const next = data.nextLevel;

  // `nextLevel === 'aal2'` es la señal de que existe un factor verificado
  // (Supabase sólo eleva el objetivo cuando hay con qué). `currentLevel` dice
  // si la sesión ya lo cumplió.
  const enrolled = next === "aal2";
  const satisfied = current === "aal2";
  return { enrolled, satisfied, mustStepUp: enrolled && !satisfied, resolved: true };
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
  // Estado desconocido: se decide por el rol, no por la ausencia de datos.
  // A quien tiene MFA obligatoria se lo manda a verificar —fallar cerrado es
  // lo correcto ahí—; al resto se lo deja pasar, porque para ellos el segundo
  // factor es opcional y bloquearlos convertiría una falla de Auth en una
  // expulsión. Los datos siguen acotados por RLS en los dos casos.
  if (!status.resolved) return mfaRequiredFor(role) ? "/two-factor/verify" : null;
  if (status.satisfied) return null;
  if (status.mustStepUp) return "/two-factor/verify";
  if (mfaRequiredFor(role)) return "/two-factor/setup";
  return null;
}

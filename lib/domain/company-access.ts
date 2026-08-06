import type { CompanyStatus, UserRole } from "@/types/database";

/**
 * Una cuenta gerente depende de una única empresa. Si esa empresa no puede
 * resolverse como activa, la sesión no debe entrar al área tenant.
 *
 * Las cuentas de campo son globales: una empresa suspendida sólo retira esa
 * membresía, sin bloquear las demás empresas activas de la misma persona.
 */
export function isCompanyManagerBlocked(
  role: UserRole,
  companyStatus: CompanyStatus | null | undefined,
): boolean {
  return role === "company_manager" && companyStatus !== "active";
}


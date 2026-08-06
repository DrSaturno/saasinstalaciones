import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isCompanyManagerBlocked } from "@/lib/domain/company-access";
import type { MembershipRole, UserRole } from "@/types/database";

/** Ruta home de cada tipo global de cuenta tras el login. */
export const ROLE_HOME: Record<UserRole, string> = {
  platform_admin: "/master",
  company_manager: "/dashboard",
  installer: "/home",
};

export type CompanyMembership = {
  companyId: string;
  companyName: string;
  role: MembershipRole;
};

export function coordinatorCompanies(
  user: CurrentUser,
): CompanyMembership[] {
  return user.memberships.filter(
    (membership) => membership.role === "coordinator",
  );
}

export function installerCompanies(user: CurrentUser): CompanyMembership[] {
  return user.memberships.filter(
    (membership) => membership.role === "installer",
  );
}

export function isCoordinatorSomewhere(user: CurrentUser): boolean {
  return coordinatorCompanies(user).length > 0;
}

export function hasCompanyRole(
  user: CurrentUser,
  companyId: string,
  role: MembershipRole,
): boolean {
  return user.memberships.some(
    (membership) =>
      membership.companyId === companyId && membership.role === role,
  );
}

export function canOperateCompany(
  user: CurrentUser,
  companyId: string,
): boolean {
  if (user.role === "company_manager") {
    return user.companyId === companyId;
  }

  return hasCompanyRole(user, companyId, "coordinator");
}

export function isInstallerArea(user: CurrentUser): boolean {
  if (user.role === "platform_admin" || user.role === "company_manager") {
    return false;
  }

  return user.role === "installer" || user.memberships.length > 0;
}

export type CurrentUser = {
  id: string;
  email: string | null;
  role: UserRole;
  companyId: string | null;
  fullName: string;
  locale: "es" | "pt";
  memberships: CompanyMembership[];
};

/**
 * Devuelve el usuario autenticado + su perfil, o null si no hay sesión.
 * Usa getUser() (valida el token contra Supabase), nunca getSession() solo.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [
    { data: profile },
    { data: membershipRows },
    { data: membershipRoleRows },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("role, company_id, full_name, locale")
      .eq("id", user.id)
      .single(),
    supabase
      .from("company_installers")
      .select("company_id, companies(name, status)")
      .eq("installer_id", user.id)
      .eq("status", "active")
      .overrideTypes<
        {
          company_id: string;
          companies: { name: string; status: "active" | "suspended" } | null;
        }[]
      >(),
    supabase
      .from("company_membership_roles")
      .select("company_id, role")
      .eq("user_id", user.id),
  ]);
  if (!profile) return null;

  const { data: company } =
    profile.role === "company_manager" && profile.company_id
      ? await supabase
          .from("companies")
          .select("status")
          .eq("id", profile.company_id)
          .maybeSingle()
      : { data: null };

  if (isCompanyManagerBlocked(profile.role, company?.status)) return null;

  const activeCompanies = new Map(
    (membershipRows ?? [])
      .filter((membership) => membership.companies?.status === "active")
      .map((membership) => [membership.company_id, membership.companies!]),
  );

  return {
    id: user.id,
    email: user.email ?? null,
    role: profile.role,
    companyId:
      profile.role === "company_manager" ? profile.company_id : null,
    fullName: profile.full_name,
    locale: profile.locale,
    memberships: (membershipRoleRows ?? [])
      .filter((membership) => activeCompanies.has(membership.company_id))
      .map((membership) => ({
        companyId: membership.company_id,
        companyName: activeCompanies.get(membership.company_id)?.name ?? "",
        role: membership.role,
      })),
  };
});

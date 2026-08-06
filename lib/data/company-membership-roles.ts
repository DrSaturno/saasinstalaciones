import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { activeMembershipRoles } from "@/lib/domain/membership-roles";
import type { Database, MembershipRole } from "@/types/database";

export type ActiveCompanyRoleMembership = {
  companyId: string;
  userId: string;
  role: MembershipRole;
};

type RoleFilters = {
  companyId?: string;
  userId?: string;
};

/**
 * Lee una capacidad desde la tabla normalizada y la cruza con la membresía
 * activa. Esto evita que un rol residual habilite a alguien removido.
 */
export async function fetchActiveCompanyRoleMemberships(
  supabase: SupabaseClient<Database>,
  role: MembershipRole,
  filters: RoleFilters = {},
): Promise<ActiveCompanyRoleMembership[]> {
  let roleQuery = supabase
    .from("company_membership_roles")
    .select("company_id, user_id, role")
    .eq("role", role);

  if (filters.companyId) {
    roleQuery = roleQuery.eq("company_id", filters.companyId);
  }
  if (filters.userId) {
    roleQuery = roleQuery.eq("user_id", filters.userId);
  }

  const { data: roleRows, error: roleError } = await roleQuery;
  if (roleError || !roleRows?.length) return [];

  const companyIds = [...new Set(roleRows.map((row) => row.company_id))];
  const userIds = [...new Set(roleRows.map((row) => row.user_id))];
  const { data: memberships, error: membershipError } = await supabase
    .from("company_installers")
    .select("company_id, installer_id")
    .eq("status", "active")
    .in("company_id", companyIds)
    .in("installer_id", userIds);

  if (membershipError || !memberships) return [];

  return activeMembershipRoles(memberships, roleRows).map((row) => ({
    companyId: row.company_id,
    userId: row.user_id,
    role: row.role,
  }));
}

/** Validación fail-closed para acciones que reciben un usuario del cliente. */
export async function hasActiveCompanyRole(
  supabase: SupabaseClient<Database>,
  companyId: string,
  userId: string,
  role: MembershipRole,
): Promise<boolean> {
  const [{ data: membership }, { data: capability }] = await Promise.all([
    supabase
      .from("company_installers")
      .select("installer_id")
      .eq("company_id", companyId)
      .eq("installer_id", userId)
      .eq("status", "active")
      .maybeSingle(),
    supabase
      .from("company_membership_roles")
      .select("user_id")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .eq("role", role)
      .maybeSingle(),
  ]);

  return Boolean(membership && capability);
}

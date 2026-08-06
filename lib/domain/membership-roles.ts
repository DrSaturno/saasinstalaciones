import type { MembershipRole } from "@/types/database";

export type MembershipRoleRow = {
  company_id: string;
  user_id: string;
  role: MembershipRole;
};

export type ActiveMembershipRow = {
  company_id: string;
  installer_id: string;
};

function membershipKey(companyId: string, userId: string) {
  return `${companyId}:${userId}`;
}

/**
 * Descarta capacidades huérfanas o correspondientes a una membresía removida.
 * La tabla de roles es la fuente de verdad de capacidades; la membresía base
 * sigue definiendo si la persona pertenece hoy al equipo.
 */
export function activeMembershipRoles(
  memberships: ActiveMembershipRow[],
  roles: MembershipRoleRow[],
): MembershipRoleRow[] {
  const activeMemberships = new Set(
    memberships.map((membership) =>
      membershipKey(membership.company_id, membership.installer_id),
    ),
  );

  return roles.filter((role) =>
    activeMemberships.has(membershipKey(role.company_id, role.user_id)),
  );
}

/** Agrupa y deduplica las capacidades de cada persona en una empresa. */
export function rolesByUser(
  roles: Pick<MembershipRoleRow, "user_id" | "role">[],
): Map<string, MembershipRole[]> {
  const grouped = new Map<string, MembershipRole[]>();

  for (const row of roles) {
    const current = grouped.get(row.user_id) ?? [];
    if (!current.includes(row.role)) current.push(row.role);
    grouped.set(row.user_id, current);
  }

  return grouped;
}

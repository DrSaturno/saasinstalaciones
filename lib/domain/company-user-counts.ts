type CompanyMembershipRow = {
  company_id: string;
  installer_id: string;
};

type CompanyManagerRow = {
  id: string;
  company_id: string | null;
};

/**
 * Cuenta personas únicas por empresa desde la fuente multiempresa vigente.
 * Los gerentes siguen viviendo en profiles; instaladores/coordinadores viven
 * en company_installers. Un Set evita inflar el total ante datos duplicados.
 */
export function countCompanyUsers(
  memberships: readonly CompanyMembershipRow[] | null,
  managers: readonly CompanyManagerRow[] | null,
): Record<string, number> {
  const usersByCompany = new Map<string, Set<string>>();

  const add = (companyId: string, userId: string) => {
    const users = usersByCompany.get(companyId) ?? new Set<string>();
    users.add(userId);
    usersByCompany.set(companyId, users);
  };

  for (const membership of memberships ?? []) {
    add(membership.company_id, membership.installer_id);
  }

  for (const manager of managers ?? []) {
    if (manager.company_id) add(manager.company_id, manager.id);
  }

  return Object.fromEntries(
    [...usersByCompany].map(([companyId, users]) => [companyId, users.size]),
  );
}


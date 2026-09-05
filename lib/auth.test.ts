import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import {
  canOperateCompany,
  coordinatorCompanies,
  hasCompanyRole,
  installerCompanies,
  isCoordinatorSomewhere,
  isInstallerArea,
  operationalTimezone,
  type CurrentUser,
} from "./auth";

const multiCompanyUser: CurrentUser = {
  id: "user-1",
  email: "tecnico@example.com",
  role: "installer",
  companyId: null,
  fullName: "Técnico Multiempresa",
  locale: "es",
  memberships: [
    {
      companyId: "company-a",
      companyName: "Empresa A",
      country: "AR",
      role: "coordinator",
    },
    {
      companyId: "company-a",
      companyName: "Empresa A",
      country: "AR",
      role: "installer",
    },
    {
      companyId: "company-b",
      companyName: "Empresa B",
      country: "BR",
      role: "installer",
    },
  ],
};

describe("helpers de membresía", () => {
  it("separa las empresas según el rol de cada membresía", () => {
    expect(coordinatorCompanies(multiCompanyUser).map((item) => item.companyId)).toEqual([
      "company-a",
    ]);
    expect(installerCompanies(multiCompanyUser).map((item) => item.companyId)).toEqual([
      "company-a",
      "company-b",
    ]);
    expect(hasCompanyRole(multiCompanyUser, "company-a", "installer")).toBe(true);
    expect(hasCompanyRole(multiCompanyUser, "company-a", "coordinator")).toBe(true);
  });

  it("habilita coordinación solamente en las empresas coordinadas", () => {
    expect(isCoordinatorSomewhere(multiCompanyUser)).toBe(true);
    expect(canOperateCompany(multiCompanyUser, "company-a")).toBe(true);
    expect(canOperateCompany(multiCompanyUser, "company-b")).toBe(false);
  });

  it("mantiene al gerente limitado a su propia empresa", () => {
    const manager: CurrentUser = {
      ...multiCompanyUser,
      role: "company_manager",
      companyId: "company-a",
      memberships: [],
    };

    expect(canOperateCompany(manager, "company-a")).toBe(true);
    expect(canOperateCompany(manager, "company-b")).toBe(false);
    expect(isInstallerArea(manager)).toBe(false);
  });

  it("habilita el área de campo por tipo de cuenta o membresía", () => {
    expect(isInstallerArea({ ...multiCompanyUser, memberships: [] })).toBe(true);
    expect(
      isInstallerArea({
        ...multiCompanyUser,
        role: "platform_admin",
        memberships: multiCompanyUser.memberships,
      }),
    ).toBe(false);
  });

  it("deriva la zona operativa del país y prioriza el idioma en multicuenta", () => {
    expect(operationalTimezone(multiCompanyUser)).toBe(
      "America/Argentina/Buenos_Aires",
    );
    expect(
      operationalTimezone({ ...multiCompanyUser, locale: "pt" }),
    ).toBe("America/Sao_Paulo");
    expect(
      operationalTimezone({ ...multiCompanyUser, locale: "pt", memberships: [] }),
    ).toBe("America/Sao_Paulo");
  });
});

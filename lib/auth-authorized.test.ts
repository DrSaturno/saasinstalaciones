import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth";

const { getCurrentUser, assurance } = vi.hoisted(() => ({ getCurrentUser: vi.fn(), assurance: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { mfa: { getAuthenticatorAssuranceLevel: assurance } } }),
}));
import { getAuthorizedUser } from "@/lib/auth-authorized";

const user: CurrentUser = { id: "user-a", email: null, role: "company_manager", companyId: "company-a", fullName: "Test", locale: "es", memberships: [] };
beforeEach(() => vi.resetAllMocks());

describe("action authorization", () => {
  it("rejects an absent session without consulting MFA", async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await getAuthorizedUser()).toBeNull();
    expect(assurance).not.toHaveBeenCalled();
  });

  it.each(["company_manager", "platform_admin", "installer"] as const)("requires step-up for enrolled %s even outside a layout", async (role) => {
    getCurrentUser.mockResolvedValue({ ...user, role });
    assurance.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null });
    expect(await getAuthorizedUser()).toBeNull();
  });

  it.each([["aal1", "aal1"], ["aal2", "aal2"]])("allows %s sessions with target %s", async (currentLevel, nextLevel) => {
    getCurrentUser.mockResolvedValue(user);
    assurance.mockResolvedValue({ data: { currentLevel, nextLevel }, error: null });
    expect(await getAuthorizedUser()).toEqual(user);
  });

  // La garantía no cambia —una acción no se ejecuta con el estado de seguridad
  // en duda—, cambia cómo se expresa. Antes se dejaba propagar una excepción de
  // `fetchTwoFactorStatus`, y esa misma excepción llegaba a los layouts de
  // página y tumbaba el área entera del gerente por un hipó de Auth. Ahora la
  // denegación es `null`, que es como todos los llamadores ya la leen.
  it.each([{ data: null, error: { message: "unavailable", name: "AuthApiError" } }, { data: null, error: null }, { data: { currentLevel: null, nextLevel: null }, error: null }])("fails closed if MFA cannot be checked", async (result) => {
    getCurrentUser.mockResolvedValue(user);
    assurance.mockResolvedValue(result);
    expect(await getAuthorizedUser()).toBeNull();
  });
});

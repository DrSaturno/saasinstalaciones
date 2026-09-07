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

  it.each([{ data: null, error: { message: "unavailable" } }, { data: null, error: null }, { data: { currentLevel: null, nextLevel: null }, error: null }])("fails closed if MFA cannot be checked", async (result) => {
    getCurrentUser.mockResolvedValue(user);
    assurance.mockResolvedValue(result);
    await expect(getAuthorizedUser()).rejects.toThrow("mfa_status_unavailable");
  });
});

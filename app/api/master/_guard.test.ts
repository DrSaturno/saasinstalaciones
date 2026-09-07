import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, profile, assurance, createAdminClient } = vi.hoisted(() => ({
  getUser: vi.fn(), profile: vi.fn(), assurance: vi.fn(), createAdminClient: vi.fn(),
}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser, mfa: { getAuthenticatorAssuranceLevel: assurance } },
    from: () => ({ select: () => ({ eq: () => ({ single: profile }) }) }),
  }),
}));
import { requirePlatformAdmin } from "./_guard";

beforeEach(() => {
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "admin-a" } } });
  profile.mockResolvedValue({ data: { role: "platform_admin" } });
  assurance.mockResolvedValue({ data: { currentLevel: "aal2", nextLevel: "aal2" }, error: null });
  createAdminClient.mockReturnValue({ authorized: true });
});

describe("master API authorization", () => {
  it("does not create a privileged client without authentication", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await requirePlatformAdmin()).error?.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
  it("does not elevate a manager", async () => {
    profile.mockResolvedValue({ data: { role: "company_manager" } });
    expect((await requirePlatformAdmin()).error?.status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
  it("rejects direct API access with a pending second factor", async () => {
    assurance.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null });
    expect((await requirePlatformAdmin()).error?.status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
  it("fails closed if the MFA provider is unavailable", async () => {
    assurance.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    expect((await requirePlatformAdmin()).error?.status).toBe(503);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
  it.each(["aal1", "aal2"])("allows an admin whose %s session satisfies MFA", async (level) => {
    assurance.mockResolvedValue({ data: { currentLevel: level, nextLevel: level }, error: null });
    expect((await requirePlatformAdmin()).userId).toBe("admin-a");
    expect(createAdminClient).toHaveBeenCalledOnce();
  });
});

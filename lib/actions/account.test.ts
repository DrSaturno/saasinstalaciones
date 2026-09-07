import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthorizedUser, signInWithPassword, updateUser } = vi.hoisted(() => ({
  getAuthorizedUser: vi.fn(), signInWithPassword: vi.fn(), updateUser: vi.fn(),
}));
vi.mock("@/lib/auth-authorized", () => ({ getAuthorizedUser }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithPassword, updateUser } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
import { changePassword } from "./account";

function form() {
  const data = new FormData();
  data.set("currentPassword", "synthetic-old-password");
  data.set("newPassword", "synthetic-new-password");
  data.set("confirmPassword", "synthetic-new-password");
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  getAuthorizedUser.mockResolvedValue({ id: "user-a", email: "user@example.invalid" });
  signInWithPassword.mockResolvedValue({ error: null });
  updateUser.mockResolvedValue({ error: null });
});

describe("password change authorization", () => {
  it("rejects sessions that have not satisfied their enrolled second factor", async () => {
    getAuthorizedUser.mockResolvedValue(null);
    expect(await changePassword({ error: null }, form())).toEqual({ error: "notAuthenticated" });
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });
  it("still requires the current password after authorizing the session", async () => {
    signInWithPassword.mockResolvedValue({ error: { message: "invalid" } });
    expect(await changePassword({ error: null }, form())).toEqual({ error: "currentPasswordWrong" });
    expect(updateUser).not.toHaveBeenCalled();
  });
  it("updates the password after both checks", async () => {
    expect(await changePassword({ error: null }, form())).toEqual({ error: null, ok: true });
    expect(updateUser).toHaveBeenCalledOnce();
  });
});

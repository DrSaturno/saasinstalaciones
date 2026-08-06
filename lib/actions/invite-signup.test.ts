import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next-intl/server", () => ({
  getLocale: async () => "es",
  getTranslations: async () => (key: string) => key,
}));

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  rpc: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: mocks.rpc,
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: { createUser: mocks.createUser, deleteUser: mocks.deleteUser },
    },
  }),
}));

import { signUpInstaller } from "@/lib/actions/invite-signup";

const TOKEN = "d9b6cecc-a6d6-4ac0-ac1f-daddaf5b4c73";

function signupForm() {
  const data = new FormData();
  data.set("token", TOKEN);
  data.set("fullName", "Ana Instaladora");
  data.set("password", "una-clave-segura");
  return data;
}

beforeEach(() => {
  mocks.rpc
    .mockResolvedValueOnce({
      data: [{ valid: true, email: "ana@example.com" }],
      error: null,
    })
    .mockResolvedValueOnce({ data: null, error: null });
  mocks.createUser.mockResolvedValue({
    data: { user: { id: "created-user" } },
    error: null,
  });
  mocks.deleteUser.mockResolvedValue({ data: null, error: null });
  mocks.signInWithPassword.mockResolvedValue({ data: null, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("alta por invitación", () => {
  it("acepta la invitación y conserva la cuenta cuando termina bien", async () => {
    await expect(
      signUpInstaller({ error: null }, signupForm()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.createUser).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenLastCalledWith("accept_invitation", {
      p_token: TOKEN,
    });
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith("/home");
  });

  it("borra la cuenta recién creada si no puede iniciar sesión", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: "sign in failed" },
    });

    await expect(
      signUpInstaller({ error: null }, signupForm()),
    ).resolves.toEqual({ error: "signupFailed" });

    expect(mocks.deleteUser).toHaveBeenCalledWith("created-user");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("cierra sesión y compensa el alta si la invitación no se puede aceptar", async () => {
    mocks.rpc
      .mockReset()
      .mockResolvedValueOnce({
        data: [{ valid: true, email: "ana@example.com" }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "invitation already used" },
      });

    await expect(
      signUpInstaller({ error: null }, signupForm()),
    ).resolves.toEqual({ error: "signupFailed" });

    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.deleteUser).toHaveBeenCalledWith("created-user");
  });
});

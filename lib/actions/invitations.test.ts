import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  redirect: vi.fn((path: string) => {
    // Como el redirect real de Next: corta la ejecución.
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signOut: mocks.signOut } }),
}));

import { signOutForInvitation } from "@/lib/actions/invitations";

const TOKEN = "0b9c6f3e-2d4a-4c8e-9a51-7f3e2b1d6c90";

beforeEach(() => {
  mocks.signOut.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("cerrar sesión desde una invitación", () => {
  it("cierra la sesión abierta y vuelve a la misma invitación", async () => {
    await expect(signOutForInvitation(TOKEN)).rejects.toThrow(
      `NEXT_REDIRECT:/invite/${TOKEN}`,
    );
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });

  it("con un token que no es una invitación no cierra nada ni arma la redirección con él", async () => {
    await expect(
      signOutForInvitation("//sitio-ajeno.example/phishing"),
    ).rejects.toThrow("NEXT_REDIRECT:/");
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });
});

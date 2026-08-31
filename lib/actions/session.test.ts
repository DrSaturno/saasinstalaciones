import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  cookieSet: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.cookieSet, delete: vi.fn() }),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser, signOut: vi.fn() },
    from: () => ({ update: mocks.update }),
  }),
}));

import { updateLocale } from "@/lib/actions/session";

beforeEach(() => {
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  mocks.eq.mockResolvedValue({ error: null });
  mocks.update.mockReturnValue({ eq: mocks.eq });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("idioma de sesión", () => {
  it("guarda el idioma del visitante aunque todavía no tenga cuenta", async () => {
    await expect(updateLocale("pt")).resolves.toEqual({ error: null });

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "NEXT_LOCALE",
      "pt",
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("mantiene sincronizado el perfil cuando la persona está autenticada", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    await expect(updateLocale("es")).resolves.toEqual({ error: null });

    expect(mocks.update).toHaveBeenCalledWith({ locale: "es" });
    expect(mocks.eq).toHaveBeenCalledWith("id", "user-1");
    expect(mocks.cookieSet).toHaveBeenCalledOnce();
  });

  it("no cambia la cookie si falla la actualización del perfil", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mocks.eq.mockResolvedValue({ error: { message: "update failed" } });

    await expect(updateLocale("pt")).resolves.toEqual({
      error: "update_failed",
    });

    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("rechaza un locale fuera del contrato", async () => {
    await expect(updateLocale("en")).resolves.toEqual({
      error: "invalid_locale",
    });

    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
});

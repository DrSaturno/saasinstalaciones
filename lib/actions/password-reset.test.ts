import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Los mensajes se resuelven por clave: al test le importa cuál error se elige,
// no su redacción.
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));

const resetPasswordForEmail = vi.fn();
const getUser = vi.fn();
const updateUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { resetPasswordForEmail, getUser, updateUser },
  }),
}));

import {
  requestPasswordReset,
  setNewPassword,
} from "@/lib/actions/password-reset";

const ORIGINAL_APP_URL = process.env.APP_URL;

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

beforeEach(() => {
  process.env.APP_URL = "https://app.example.com";
  resetPasswordForEmail.mockResolvedValue({ error: null });
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  updateUser.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  if (ORIGINAL_APP_URL === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = ORIGINAL_APP_URL;
});

describe("pedido de recuperación", () => {
  it("manda el link al callback del propio dominio", async () => {
    await requestPasswordReset({ error: null }, form({ email: "a@b.com" }));
    expect(resetPasswordForEmail).toHaveBeenCalledWith("a@b.com", {
      redirectTo: "https://app.example.com/api/auth/callback",
    });
  });

  // La propiedad central: el formulario es público, así que una respuesta
  // distinta según exista o no la cuenta lo volvería un buscador de emails
  // registrados.
  it("responde igual cuando Supabase falla que cuando acepta", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ok = await requestPasswordReset(
      { error: null },
      form({ email: "existe@b.com" }),
    );

    resetPasswordForEmail.mockResolvedValue({
      error: { message: "User not found" },
    });
    const failed = await requestPasswordReset(
      { error: null },
      form({ email: "no-existe@b.com" }),
    );

    expect(failed).toEqual(ok);
    expect(failed).toEqual({ error: null, sent: true });
  });

  it("responde igual si el envío explota", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    resetPasswordForEmail.mockRejectedValue(new Error("network"));
    await expect(
      requestPasswordReset({ error: null }, form({ email: "a@b.com" })),
    ).resolves.toEqual({ error: null, sent: true });
  });

  it("avisa el formato inválido sin llegar a pedir el envío", async () => {
    const result = await requestPasswordReset(
      { error: null },
      form({ email: "no-es-un-email" }),
    );
    expect(result).toEqual({ error: "invalidEmail" });
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });
});

describe("fijar la contraseña nueva", () => {
  it("la guarda cuando la sesión de recuperación está abierta", async () => {
    const result = await setNewPassword(
      { error: null },
      form({ newPassword: "unaClaveLarga", confirmPassword: "unaClaveLarga" }),
    );
    expect(updateUser).toHaveBeenCalledWith({ password: "unaClaveLarga" });
    expect(result).toEqual({ error: null, ok: true });
  });

  it("no guarda nada sin sesión: el link venció o ya se usó", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await setNewPassword(
      { error: null },
      form({ newPassword: "unaClaveLarga", confirmPassword: "unaClaveLarga" }),
    );
    expect(result).toEqual({ error: "resetLinkInvalid" });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("exige que las dos coincidan", async () => {
    const result = await setNewPassword(
      { error: null },
      form({ newPassword: "unaClaveLarga", confirmPassword: "otraDistinta" }),
    );
    expect(result).toEqual({ error: "passwordMismatch" });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("rechaza contraseñas cortas antes de tocar Supabase", async () => {
    const result = await setNewPassword(
      { error: null },
      form({ newPassword: "corta", confirmPassword: "corta" }),
    );
    expect(result).toEqual({ error: "weakPassword" });
    expect(updateUser).not.toHaveBeenCalled();
  });
});

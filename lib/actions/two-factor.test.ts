import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  getUser,
  listFactors,
  unenroll,
  challengeAndVerify,
  fetchTwoFactorStatus,
  enforceRateLimit,
  clientIp,
} = vi.hoisted(() => ({
  getUser: vi.fn(),
  listFactors: vi.fn(),
  unenroll: vi.fn(),
  challengeAndVerify: vi.fn(),
  fetchTwoFactorStatus: vi.fn(),
  enforceRateLimit: vi.fn(),
  clientIp: vi.fn(),
}));

// Los mensajes se resuelven por clave: al test le importa cuál error se elige.
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser, mfa: { listFactors, unenroll, challengeAndVerify } },
  }),
}));
vi.mock("@/lib/data/two-factor", () => ({ fetchTwoFactorStatus }));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit, clientIp }));

import { disableTotp, verifyTotpChallenge } from "@/lib/actions/two-factor";

const status = (over = {}) => ({
  enrolled: true,
  satisfied: true,
  mustStepUp: false,
  resolved: true,
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "user-a" } } });
  listFactors.mockResolvedValue({ data: { totp: [{ id: "factor-a" }] } });
  unenroll.mockResolvedValue({ error: null });
  challengeAndVerify.mockResolvedValue({ error: null });
  fetchTwoFactorStatus.mockResolvedValue(status());
  enforceRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  clientIp.mockResolvedValue("203.0.113.7");
});

describe("apagar la verificación en dos pasos", () => {
  it("con la sesión en AAL2 la apaga", async () => {
    expect(await disableTotp()).toEqual({ ok: true });
    expect(unenroll).toHaveBeenCalledWith({ factorId: "factor-a" });
  });

  it("no la apaga desde una sesión que nunca pasó el segundo factor", async () => {
    // El caso que importa: una cookie robada o una sesión anterior al
    // enrolamiento. Apagar una defensa tiene que exigir haberla pasado.
    fetchTwoFactorStatus.mockResolvedValue(status({ satisfied: false, mustStepUp: true }));
    expect(await disableTotp()).toEqual({
      ok: false,
      error: "disableNeedsStepUp",
    });
    expect(unenroll).not.toHaveBeenCalled();
  });

  it("no la apaga si no se puede confirmar el nivel de la sesión", async () => {
    fetchTwoFactorStatus.mockResolvedValue(status({ resolved: false, satisfied: false }));
    expect(await disableTotp()).toEqual({
      ok: false,
      error: "disableNeedsStepUp",
    });
    expect(unenroll).not.toHaveBeenCalled();
  });

  it("no la apaga sin sesión", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await disableTotp()).toEqual({ ok: false, error: "notAuthenticated" });
    expect(unenroll).not.toHaveBeenCalled();
  });

  it("tiene freno propio", async () => {
    enforceRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
    expect(await disableTotp()).toEqual({ ok: false, error: "tooManyCodes" });
    expect(unenroll).not.toHaveBeenCalled();
  });
});

describe("verificar el código del segundo factor", () => {
  it("cuenta los intentos por usuario y no por IP", async () => {
    // Por IP, una oficina detrás de un NAT compartía diez intentos cada cinco
    // minutos, y a quien tuviera varias direcciones el límite se le multiplicaba.
    await verifyTotpChallenge({ code: "123456" });
    expect(enforceRateLimit).toHaveBeenCalledWith("mfa_verify", "user-a", 10, 300);
    expect(clientIp).not.toHaveBeenCalled();
  });

  it("rechaza un código con forma inválida sin gastar un intento", async () => {
    expect(await verifyTotpChallenge({ code: "12a4" })).toEqual({
      ok: false,
      error: "badCode",
    });
    expect(enforceRateLimit).not.toHaveBeenCalled();
    expect(challengeAndVerify).not.toHaveBeenCalled();
  });
});

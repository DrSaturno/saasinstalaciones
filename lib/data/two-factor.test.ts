import { describe, expect, it } from "vitest";
import { mfaRequiredFor, twoFactorGate, type TwoFactorStatus } from "@/lib/data/two-factor";

const status = (over: Partial<TwoFactorStatus> = {}): TwoFactorStatus => ({
  enrolled: false,
  satisfied: false,
  mustStepUp: false,
  ...over,
});

describe("mfaRequiredFor", () => {
  it("obliga a admin y gerentes, no a instaladores", () => {
    expect(mfaRequiredFor("platform_admin")).toBe(true);
    expect(mfaRequiredFor("company_manager")).toBe(true);
    expect(mfaRequiredFor("installer")).toBe(false);
  });
});

describe("twoFactorGate", () => {
  it("con la sesión en AAL2 deja pasar a cualquiera", () => {
    for (const role of ["platform_admin", "company_manager", "installer"] as const) {
      expect(twoFactorGate(status({ satisfied: true, enrolled: true }), role)).toBeNull();
    }
  });

  it("con factor pero sin subir de nivel, manda a verificar (todos los roles)", () => {
    const s = status({ enrolled: true, mustStepUp: true });
    expect(twoFactorGate(s, "company_manager")).toBe("/two-factor/verify");
    // Un instalador que SÍ activó la verificación también la usa al entrar.
    expect(twoFactorGate(s, "installer")).toBe("/two-factor/verify");
  });

  it("obliga a enrolar al admin y al gerente sin factor", () => {
    const s = status();
    expect(twoFactorGate(s, "platform_admin")).toBe("/two-factor/setup");
    expect(twoFactorGate(s, "company_manager")).toBe("/two-factor/setup");
  });

  it("al instalador sin factor lo deja pasar: para él es opcional", () => {
    expect(twoFactorGate(status(), "installer")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { mfaRequiredFor, twoFactorGate, type TwoFactorStatus } from "@/lib/data/two-factor";

const status = (over: Partial<TwoFactorStatus> = {}): TwoFactorStatus => ({
  enrolled: false,
  satisfied: false,
  mustStepUp: false,
  resolved: true,
  ...over,
});

const ROLES = ["platform_admin", "company_manager", "installer"] as const;

describe("mfaRequiredFor", () => {
  it("hoy no obliga a ningún rol: la verificación es opt-in", () => {
    for (const role of ROLES) {
      expect(mfaRequiredFor(role)).toBe(false);
    }
  });
});

describe("twoFactorGate", () => {
  it("con la sesión en AAL2 deja pasar a cualquiera", () => {
    for (const role of ROLES) {
      expect(twoFactorGate(status({ satisfied: true, enrolled: true }), role)).toBeNull();
    }
  });

  it("quien activó la verificación la usa al entrar, sea cual sea su rol", () => {
    // Ésta es la parte que NO cambia al volverla opcional: si alguien se
    // enroló, el segundo factor se le sigue pidiendo. Opcional es la decisión
    // de activarla, no la de cumplirla una vez activada.
    const s = status({ enrolled: true, mustStepUp: true });
    for (const role of ROLES) {
      expect(twoFactorGate(s, role)).toBe("/two-factor/verify");
    }
  });

  it("sin factor, nadie queda forzado a enrolarse", () => {
    for (const role of ROLES) {
      expect(twoFactorGate(status(), role)).toBeNull();
    }
  });

  it("si Auth no contesta, no expulsa a quien no tiene MFA obligatoria", () => {
    // El estado sin resolver NO es "no tiene segundo factor". Tratarlo como tal
    // es lo que rompía: la función lanzaba y el área entera del gerente se caía
    // con "Algo salió mal" por un hipó de Auth. Con MFA opcional —que es el
    // estado de hoy— lo correcto es dejar pasar: los datos siguen acotados por
    // RLS y la capa de abajo vuelve a comprobar.
    for (const role of ROLES) {
      expect(twoFactorGate(status({ resolved: false }), role)).toBeNull();
    }
  });
});

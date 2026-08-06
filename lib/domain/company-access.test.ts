import { describe, expect, it } from "vitest";
import { isCompanyManagerBlocked } from "./company-access";

describe("acceso de cuentas de empresa", () => {
  it("bloquea al gerente cuando su empresa está suspendida o no es visible", () => {
    expect(isCompanyManagerBlocked("company_manager", "suspended")).toBe(true);
    expect(isCompanyManagerBlocked("company_manager", null)).toBe(true);
  });

  it("permite al gerente de una empresa activa", () => {
    expect(isCompanyManagerBlocked("company_manager", "active")).toBe(false);
  });

  it("no bloquea globalmente a una cuenta de campo por el estado de un tenant", () => {
    expect(isCompanyManagerBlocked("installer", "suspended")).toBe(false);
  });
});


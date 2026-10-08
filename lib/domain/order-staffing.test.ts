import { describe, expect, it } from "vitest";
import { orderStaffing } from "./order-staffing";

describe("orderStaffing", () => {
  it("una orden sin responsable está incompleta aunque necesite una sola persona", () => {
    const result = orderStaffing({ assignedInstallerId: null, requiredInstallers: 1, activeHelpers: 0 });
    expect(result).toMatchObject({ assigned: 0, missing: 1, hasLead: false, incomplete: true });
  });

  it("con una persona requerida, el responsable solo la completa", () => {
    const result = orderStaffing({ assignedInstallerId: "a", requiredInstallers: 1, activeHelpers: 0 });
    expect(result).toMatchObject({ assigned: 1, missing: 0, incomplete: false });
  });

  it("cuenta responsable más ayudantes activos contra lo requerido", () => {
    const short = orderStaffing({ assignedInstallerId: "a", requiredInstallers: 4, activeHelpers: 2 });
    expect(short).toMatchObject({ assigned: 3, missing: 1, incomplete: true });
    const full = orderStaffing({ assignedInstallerId: "a", requiredInstallers: 4, activeHelpers: 3 });
    expect(full).toMatchObject({ assigned: 4, missing: 0, incomplete: false });
  });

  it("que sobre gente no da faltantes negativos", () => {
    const result = orderStaffing({ assignedInstallerId: "a", requiredInstallers: 2, activeHelpers: 5 });
    expect(result).toMatchObject({ assigned: 6, missing: 0, incomplete: false });
  });

  it("ayudantes sin responsable no cuentan como plantel", () => {
    const result = orderStaffing({ assignedInstallerId: null, requiredInstallers: 2, activeHelpers: 3 });
    expect(result).toMatchObject({ assigned: 0, missing: 2, incomplete: true });
  });

  it("un requerido menor que 1 se trata como 1", () => {
    const result = orderStaffing({ assignedInstallerId: null, requiredInstallers: 0, activeHelpers: 0 });
    expect(result.required).toBe(1);
  });
});

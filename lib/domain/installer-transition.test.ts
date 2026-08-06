import { describe, expect, it } from "vitest";
import { decideInstallerTransition } from "@/lib/domain/installer-transition";

describe("decideInstallerTransition", () => {
  it("permite sólo el inicio desde planificada", () => {
    expect(decideInstallerTransition("planificada", "en_proceso")).toEqual({
      kind: "apply",
      expectedStatus: "planificada",
    });
  });

  it("permite sólo el envío a revisión desde en proceso", () => {
    expect(decideInstallerTransition("en_proceso", "en_revision")).toEqual({
      kind: "apply",
      expectedStatus: "en_proceso",
    });
  });

  it("es idempotente cuando el destino ya fue aplicado", () => {
    expect(decideInstallerTransition("en_revision", "en_revision")).toEqual({
      kind: "already_applied",
    });
  });

  it("bloquea una operación vieja que reabriría una orden", () => {
    expect(decideInstallerTransition("en_revision", "en_proceso")).toEqual({
      kind: "conflict",
    });
    expect(decideInstallerTransition("finalizada", "en_revision")).toEqual({
      kind: "conflict",
    });
  });
});

import { describe, expect, it } from "vitest";
import { decideInstallerTransition } from "@/lib/domain/installer-transition";

describe("decideInstallerTransition", () => {
  it("permite el inicio desde planificada", () => {
    expect(decideInstallerTransition("planificada", "en_proceso")).toEqual({
      kind: "apply",
      expectedStatuses: ["planificada", "en_camino", "en_sitio"],
    });
  });

  it("permite sólo el envío a revisión desde en proceso", () => {
    expect(decideInstallerTransition("en_proceso", "en_revision")).toEqual({
      kind: "apply",
      expectedStatuses: ["en_proceso"],
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

  // --- Etapas de campo del punto 24 -------------------------------------

  it("sale en camino sólo desde planificada", () => {
    expect(decideInstallerTransition("planificada", "en_camino")).toEqual({
      kind: "apply",
      expectedStatuses: ["planificada"],
    });
    // Ya arrancó el trabajo: no se vuelve al traslado.
    expect(decideInstallerTransition("en_proceso", "en_camino")).toEqual({
      kind: "conflict",
    });
  });

  it("acepta la llegada con o sin traslado previo", () => {
    // El camino completo.
    expect(decideInstallerTransition("en_camino", "en_sitio")).toEqual({
      kind: "apply",
      expectedStatuses: ["planificada", "en_camino"],
    });
    // Y el caso real de quien ya estaba en el punto por otra orden y nunca
    // marcó el traslado.
    expect(decideInstallerTransition("planificada", "en_sitio")).toEqual({
      kind: "apply",
      expectedStatuses: ["planificada", "en_camino"],
    });
  });

  it("empieza el trabajo desde cualquier etapa previa del camino", () => {
    for (const desde of ["planificada", "en_camino", "en_sitio"] as const) {
      expect(decideInstallerTransition(desde, "en_proceso")).toMatchObject({
        kind: "apply",
      });
    }
  });

  it("una llegada que sincroniza tarde no retrocede una orden ya enviada", () => {
    // El caso que motiva comparar contra los orígenes: el instalador marcó
    // "llegué" sin señal, siguió trabajando, cerró, y recién ahí el teléfono
    // sincronizó. La operación vieja no puede devolver la orden al sitio.
    expect(decideInstallerTransition("en_revision", "en_sitio")).toEqual({
      kind: "conflict",
    });
    expect(decideInstallerTransition("finalizada", "en_camino")).toEqual({
      kind: "conflict",
    });
  });
});

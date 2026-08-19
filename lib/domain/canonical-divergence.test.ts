import { describe, expect, it } from "vitest";

import {
  comparedFieldsThatDiffer,
  isCutoverSafe,
  measureDivergence,
  type LocationRow,
  type SiteRow,
} from "@/lib/domain/canonical-divergence";

const BASE = {
  name: "Estación 001",
  address: "Av. Siempreviva 1007",
  city: "Buenos Aires",
  state: "Buenos Aires",
  zone: "AR-BA-AMBA",
  externalRef: "SHELL-0001",
  lat: -34.6037,
  lng: -58.3816,
};

function site(overrides: Partial<SiteRow> = {}): SiteRow {
  return {
    ...BASE,
    id: "site-1",
    projectId: "proj-1",
    locationId: "loc-1",
    ...overrides,
  };
}

function location(overrides: Partial<LocationRow> = {}): LocationRow {
  return { ...BASE, id: "loc-1", ...overrides };
}

const ASOCIADO = new Set(["proj-1:loc-1"]);

describe("comparedFieldsThatDiffer", () => {
  it("no marca nada cuando los dos dicen lo mismo", () => {
    expect(comparedFieldsThatDiffer(site(), location())).toEqual([]);
  });

  it("una diferencia de capitalización no es divergencia", () => {
    const differing = comparedFieldsThatDiffer(
      site({ city: "  CABA " }),
      location({ city: "caba" }),
    );
    expect(differing).toEqual([]);
  });

  it("señala el campo que realmente cambió", () => {
    const differing = comparedFieldsThatDiffer(
      site({ address: "Otra calle 123" }),
      location(),
    );
    expect(differing).toEqual(["address"]);
  });

  it("tolera el redondeo de numeric en las coordenadas", () => {
    // ~11 cm: por debajo de eso no hay diferencia en el terreno.
    const differing = comparedFieldsThatDiffer(
      site({ lat: -34.6037 }),
      location({ lat: -34.60370009 }),
    );
    expect(differing).toEqual([]);
  });

  it("una coordenada movida de verdad sí cuenta", () => {
    const differing = comparedFieldsThatDiffer(
      site({ lat: -34.6037 }),
      location({ lat: -34.61 }),
    );
    expect(differing).toEqual(["lat"]);
  });

  it("null contra un valor es divergencia, no coincidencia", () => {
    expect(comparedFieldsThatDiffer(site({ lat: null }), location())).toEqual(["lat"]);
  });

  it("null en ambos lados coincide", () => {
    const differing = comparedFieldsThatDiffer(
      site({ lat: null, lng: null }),
      location({ lat: null, lng: null }),
    );
    expect(differing).toEqual([]);
  });
});

describe("measureDivergence", () => {
  it("un site alineado no produce divergencias", () => {
    const report = measureDivergence([site()], [location()], ASOCIADO);
    expect(report.divergences).toEqual([]);
    expect(report.cleanSites).toBe(1);
    expect(isCutoverSafe(report)).toBe(true);
  });

  it("un site sin vincular no se puede leer del modelo canónico", () => {
    const report = measureDivergence(
      [site({ locationId: null })],
      [location()],
      ASOCIADO,
    );
    expect(report.counts.unlinked).toBe(1);
    expect(report.linkedSites).toBe(0);
    expect(isCutoverSafe(report)).toBe(false);
  });

  it("apuntar a una locación inexistente se distingue de no apuntar a nada", () => {
    const report = measureDivergence(
      [site({ locationId: "loc-fantasma" })],
      [location()],
      ASOCIADO,
    );
    expect(report.counts.missingLocation).toBe(1);
    expect(report.counts.unlinked).toBe(0);
  });

  it("vinculado pero sin asociación al proyecto: la ficha no lo mostraría", () => {
    const report = measureDivergence([site()], [location()], new Set());
    expect(report.counts.missingAssociation).toBe(1);
  });

  it("reporta qué campos difieren, no sólo que difieren", () => {
    const report = measureDivergence(
      [site()],
      [location({ name: "Otro nombre", city: "Rosario" })],
      ASOCIADO,
    );
    const [divergence] = report.divergences;
    expect(divergence.kind).toBe("fieldMismatch");
    if (divergence.kind === "fieldMismatch") {
      expect(divergence.fields).toEqual(["name", "city"]);
    }
  });

  it("cada site se clasifica una sola vez, por su problema más grave", () => {
    // Sin vincular: no tiene sentido además reportarle campos distintos.
    const report = measureDivergence(
      [site({ locationId: null })],
      [location({ name: "Otro" })],
      ASOCIADO,
    );
    expect(report.divergences).toHaveLength(1);
    expect(report.counts.fieldMismatch).toBe(0);
  });

  it("cuenta bien sobre un conjunto mezclado", () => {
    const report = measureDivergence(
      [
        site({ id: "ok" }),
        site({ id: "suelto", locationId: null }),
        site({ id: "distinto", locationId: "loc-2" }),
      ],
      [location(), location({ id: "loc-2", address: "Otra dirección" })],
      new Set(["proj-1:loc-1", "proj-1:loc-2"]),
    );
    expect(report.totalSites).toBe(3);
    expect(report.linkedSites).toBe(2);
    expect(report.cleanSites).toBe(1);
    expect(report.counts.unlinked).toBe(1);
    expect(report.counts.fieldMismatch).toBe(1);
    expect(isCutoverSafe(report)).toBe(false);
  });

  it("sin sites el corte es trivialmente seguro", () => {
    const report = measureDivergence([], [], new Set());
    expect(isCutoverSafe(report)).toBe(true);
    expect(report.totalSites).toBe(0);
  });
});

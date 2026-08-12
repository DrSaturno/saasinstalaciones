import { describe, expect, it } from "vitest";

import {
  analyzeSiteRows,
  mapSiteHeaders,
  normalizeExternalRef,
} from "@/lib/domain/site-import";

const HEADER = ["nombre", "direccion", "ciudad", "provincia", "codigo", "lat", "lng"];

function fila(
  name: string,
  overrides: Partial<{
    address: string;
    city: string;
    zone: string;
    ref: string;
    lat: string;
    lng: string;
  }> = {},
): string[] {
  return [
    name,
    overrides.address ?? "Av. Siempreviva 742",
    overrides.city ?? "Rosario",
    overrides.zone ?? "Santa Fe",
    overrides.ref ?? "",
    overrides.lat ?? "",
    overrides.lng ?? "",
  ];
}

const ZONAS = ["Santa Fe", "Córdoba"];

describe("mapSiteHeaders", () => {
  it("reconoce las columnas en español", () => {
    expect(mapSiteHeaders(HEADER)).toMatchObject({ name: 0, address: 1, city: 2 });
  });

  it("acepta variantes en portugués e inglés", () => {
    const map = mapSiteHeaders(["sucursal", "endereco", "city"]);
    expect(map).toMatchObject({ name: 0, address: 1, city: 2 });
  });

  it("devuelve null si no hay columna de nombre", () => {
    expect(mapSiteHeaders(["direccion", "ciudad"])).toBeNull();
  });
});

describe("conteo de filas encontradas", () => {
  it("cuenta sólo las filas con datos, no el encabezado", () => {
    const analysis = analyzeSiteRows([HEADER, fila("Sucursal 1"), fila("Sucursal 2")], {
      projectZones: ZONAS,
    });
    expect(analysis.counts.found).toBe(2);
    expect(analysis.counts.valid).toBe(2);
  });

  it("ignora las filas vacías que deja Excel al final", () => {
    const vacia = ["", "", "", "", "", "", ""];
    const analysis = analyzeSiteRows([HEADER, fila("Sucursal 1"), vacia, vacia], {
      projectZones: ZONAS,
    });
    expect(analysis.counts.found).toBe(1);
    expect(analysis.issues).toHaveLength(0);
  });

  it("sin columna de nombre no analiza nada", () => {
    const analysis = analyzeSiteRows([["direccion"], ["Calle 1"]], {
      projectZones: ZONAS,
    });
    expect(analysis.counts.found).toBe(0);
    expect(analysis.valid).toHaveLength(0);
  });
});

describe("filas incompletas", () => {
  it("descarta la fila sin nombre indicando el número real de planilla", () => {
    const analysis = analyzeSiteRows([HEADER, fila(""), fila("Sucursal 2")], {
      projectZones: ZONAS,
    });
    expect(analysis.counts.incomplete).toBe(1);
    // La fila 1 es el encabezado, así que la primera de datos es la 2.
    expect(analysis.issues[0]).toMatchObject({ row: 2, code: "missingName" });
  });

  it("distingue una coordenada inválida de un nombre faltante", () => {
    const analysis = analyzeSiteRows(
      [HEADER, fila("Sucursal 1", { lat: "no-es-un-numero" })],
      { projectZones: ZONAS },
    );
    expect(analysis.issues[0]).toMatchObject({ code: "invalidCoordinates" });
  });

  it("rechaza una latitud fuera de rango", () => {
    const analysis = analyzeSiteRows([HEADER, fila("Sucursal 1", { lat: "120" })], {
      projectZones: ZONAS,
    });
    expect(analysis.issues[0]).toMatchObject({ code: "invalidCoordinates" });
  });
});

describe("zonas del proyecto", () => {
  it("descarta la locación de una provincia que el proyecto no opera", () => {
    const analysis = analyzeSiteRows(
      [HEADER, fila("Sucursal 1", { zone: "Neuquén" })],
      { projectZones: ZONAS },
    );
    expect(analysis.counts.outsideZone).toBe(1);
    expect(analysis.issues[0]).toMatchObject({
      code: "zoneOutsideProject",
      detail: "Neuquén",
    });
  });

  it("asume la única zona del proyecto cuando la planilla no la trae", () => {
    const analysis = analyzeSiteRows(
      [HEADER, fila("Sucursal 1", { zone: "" })],
      { projectZones: ["Santa Fe"] },
    );
    expect(analysis.counts.valid).toBe(1);
    expect(analysis.valid[0].zone).toBe("Santa Fe");
  });

  it("con varias zonas posibles no adivina: la fila queda afuera", () => {
    const analysis = analyzeSiteRows([HEADER, fila("Sucursal 1", { zone: "" })], {
      projectZones: ZONAS,
    });
    expect(analysis.counts.outsideZone).toBe(1);
  });
});

describe("duplicados", () => {
  it("descarta la segunda aparición de la misma referencia en la planilla", () => {
    const analysis = analyzeSiteRows(
      [HEADER, fila("Sucursal 1", { ref: "S-001" }), fila("Otra", { ref: "S-001" })],
      { projectZones: ZONAS },
    );
    expect(analysis.counts.valid).toBe(1);
    expect(analysis.counts.duplicated).toBe(1);
    expect(analysis.issues[0]).toMatchObject({ row: 3, code: "duplicateInFile" });
  });

  it("ignora mayúsculas y espacios al comparar referencias", () => {
    const analysis = analyzeSiteRows(
      [HEADER, fila("Sucursal 1", { ref: "S-001" }), fila("Otra", { ref: " s-001 " })],
      { projectZones: ZONAS },
    );
    expect(analysis.counts.duplicated).toBe(1);
  });

  it("marca la referencia que ya estaba cargada en el proyecto", () => {
    const analysis = analyzeSiteRows([HEADER, fila("Sucursal 1", { ref: "S-001" })], {
      projectZones: ZONAS,
      knownExternalRefs: ["S-001"],
    });
    expect(analysis.counts.valid).toBe(0);
    expect(analysis.issues[0]).toMatchObject({ code: "alreadyImported" });
  });

  it("dos filas sin referencia no son duplicados: no hay con qué compararlas", () => {
    const analysis = analyzeSiteRows(
      [HEADER, fila("Sucursal 1"), fila("Sucursal 1")],
      { projectZones: ZONAS },
    );
    expect(analysis.counts.valid).toBe(2);
    expect(analysis.counts.duplicated).toBe(0);
  });
});

describe("normalizeExternalRef", () => {
  it("recorta espacios y baja a minúscula", () => {
    expect(normalizeExternalRef("  S-001 ")).toBe("s-001");
  });
});

describe("caso de la minuta: 50 informados, 47 en la planilla", () => {
  it("el análisis permite detectar la diferencia antes de escribir", () => {
    const filas = Array.from({ length: 47 }, (_, i) =>
      fila(`Sucursal ${i + 1}`, { ref: `S-${i + 1}` }),
    );
    const analysis = analyzeSiteRows([HEADER, ...filas], { projectZones: ZONAS });

    expect(analysis.counts.found).toBe(47);
    expect(analysis.counts.valid).toBe(47);
    // El proyecto declara 50: la diferencia la calcula la acción con
    // planned_installations, pero el conteo que la alimenta sale de acá.
    expect(50 - analysis.counts.valid).toBe(3);
  });
});

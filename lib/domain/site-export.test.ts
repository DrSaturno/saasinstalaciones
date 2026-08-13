import { describe, expect, it } from "vitest";

import {
  buildSiteExportRows,
  buildSiteExportSheet,
  siteExportFilename,
  type ExportableSite,
} from "@/lib/domain/site-export";
import { analyzeSiteRows } from "@/lib/domain/site-import";
import { SITE_TEMPLATE_HEADERS } from "@/lib/domain/site-template";

const SITES: ExportableSite[] = [
  {
    name: "Estación Centro",
    address: "Av. Corrientes 1234",
    city: "CABA",
    zone: "Buenos Aires",
    externalRef: "SHELL-0001",
    lat: -34.6037,
    lng: -58.3816,
  },
  {
    name: "Estación Norte",
    address: "Av. Cabildo 2500",
    city: "CABA",
    zone: "Buenos Aires",
    externalRef: "SHELL-0002",
    lat: null,
    lng: null,
  },
  {
    // Sin dirección ni código: se exporta igual, con las celdas vacías.
    name: "Estación sin datos",
    address: null,
    city: null,
    zone: "Córdoba",
    externalRef: null,
    lat: null,
    lng: null,
  },
];

describe("buildSiteExportSheet", () => {
  it("usa exactamente las columnas de la plantilla", () => {
    const [header] = buildSiteExportSheet(SITES);
    expect(header).toEqual([...SITE_TEMPLATE_HEADERS]);
  });

  it("emite una fila por locación, sin la de encabezado", () => {
    expect(buildSiteExportRows(SITES)).toHaveLength(3);
    expect(buildSiteExportSheet(SITES)).toHaveLength(4);
  });

  it("los nulos van como celda vacía, no como 'null'", () => {
    const fila = buildSiteExportRows(SITES)[2];
    expect(fila).toEqual(["Estación sin datos", "", "", "Córdoba", "", "", ""]);
  });

  it("las coordenadas salen con punto decimal y sin notación científica", () => {
    const fila = buildSiteExportRows(SITES)[0];
    expect(fila[5]).toBe("-34.6037");
    expect(fila[6]).toBe("-58.3816");
    expect(fila[5]).not.toMatch(/e/i);
  });
});

describe("contrato de ida y vuelta", () => {
  it("lo exportado vuelve a entrar por el importador sin pérdida", () => {
    const sheet = buildSiteExportSheet(SITES);
    const analysis = analyzeSiteRows(sheet, {
      projectZones: ["Buenos Aires", "Córdoba"],
    });

    expect(analysis.counts.found).toBe(3);
    expect(analysis.counts.valid).toBe(3);
    expect(analysis.issues).toHaveLength(0);

    expect(analysis.valid.map((s) => s.name)).toEqual([
      "Estación Centro",
      "Estación Norte",
      "Estación sin datos",
    ]);
    expect(analysis.valid[0].externalRef).toBe("SHELL-0001");
    expect(analysis.valid[0].lat).toBe(-34.6037);
    expect(analysis.valid[0].lng).toBe(-58.3816);
    expect(analysis.valid[0].zone).toBe("Buenos Aires");
    expect(analysis.valid[2].zone).toBe("Córdoba");
  });

  it("reimportar al mismo proyecto no duplica: reconoce las referencias", () => {
    const sheet = buildSiteExportSheet(SITES);
    const analysis = analyzeSiteRows(sheet, {
      projectZones: ["Buenos Aires", "Córdoba"],
      knownExternalRefs: ["SHELL-0001", "SHELL-0002"],
    });

    // Las dos con código quedan afuera por ya estar cargadas; la tercera no
    // tiene código, así que no hay forma de saber que es la misma y entra.
    expect(analysis.counts.duplicated).toBe(2);
    expect(analysis.counts.valid).toBe(1);
  });

  it("una zona que el proyecto no opera se detecta al reimportar", () => {
    const sheet = buildSiteExportSheet(SITES);
    const analysis = analyzeSiteRows(sheet, { projectZones: ["Buenos Aires"] });
    expect(analysis.counts.outsideZone).toBe(1);
  });
});

describe("siteExportFilename", () => {
  const dia = new Date("2026-08-13T10:00:00Z");

  it("arma un nombre legible con la fecha", () => {
    expect(siteExportFilename("Refacción Estaciones Norte", dia)).toBe(
      "locaciones-refaccion-estaciones-norte-2026-08-13.xlsx",
    );
  });

  it("saca acentos y caracteres que rompen la descarga", () => {
    expect(siteExportFilename('YPF "2026" / Ñandú', dia)).toBe(
      "locaciones-ypf-2026-nandu-2026-08-13.xlsx",
    );
  });

  it("un nombre sin letras ni números no deja el archivo sin nombre", () => {
    expect(siteExportFilename("///", dia)).toBe(
      "locaciones-proyecto-2026-08-13.xlsx",
    );
  });
});

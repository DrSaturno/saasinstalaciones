import { describe, expect, it } from "vitest";
import {
  buildImportReportRows,
  buildImportReportSheet,
  IMPORT_REPORT_HEADERS,
  importReportFilename,
  type ImportReportRow,
} from "./import-report";

const labels = {
  imported: "Importada",
  reused: "Reutilizada",
  skipped: "Omitida",
};

const row = (over: Partial<ImportReportRow>): ImportReportRow => ({
  row: 2,
  name: "Local 1",
  externalRef: "YPF-001",
  outcome: "imported",
  reason: null,
  ...over,
});

describe("buildImportReportRows", () => {
  it("ordena por número de fila para poder seguirlo contra la planilla", () => {
    const rows = buildImportReportRows(
      [row({ row: 9 }), row({ row: 2 }), row({ row: 5 })],
      labels,
    );
    expect(rows.map((r) => r[0])).toEqual([2, 5, 9]);
  });

  it("traduce el resultado con las etiquetas recibidas", () => {
    const rows = buildImportReportRows(
      [
        row({ row: 2, outcome: "imported" }),
        row({ row: 3, outcome: "reused" }),
        row({ row: 4, outcome: "skipped", reason: "Fuera de zona" }),
      ],
      labels,
    );
    expect(rows.map((r) => r[3])).toEqual(["Importada", "Reutilizada", "Omitida"]);
  });

  it("deja el motivo de las filas que sí entraron vacío, no null", () => {
    const [first] = buildImportReportRows([row({ reason: null })], labels);
    expect(first[4]).toBe("");
  });

  it("conserva el motivo de la fila descartada", () => {
    const [first] = buildImportReportRows(
      [row({ outcome: "skipped", reason: "Zona fuera del proyecto" })],
      labels,
    );
    expect(first[4]).toBe("Zona fuera del proyecto");
  });

  it("escribe vacío cuando la fila no traía código externo", () => {
    const [first] = buildImportReportRows([row({ externalRef: null })], labels);
    expect(first[2]).toBe("");
  });

  it("no muta el arreglo recibido al ordenar", () => {
    const input = [row({ row: 9 }), row({ row: 2 })];
    buildImportReportRows(input, labels);
    expect(input.map((r) => r.row)).toEqual([9, 2]);
  });
});

describe("buildImportReportSheet", () => {
  it("antepone el encabezado", () => {
    const sheet = buildImportReportSheet([row({})], labels);
    expect(sheet[0]).toEqual([...IMPORT_REPORT_HEADERS]);
    expect(sheet).toHaveLength(2);
  });
});

describe("importReportFilename", () => {
  it("saca acentos y caracteres que rompen la descarga", () => {
    expect(
      importReportFilename(
        "Renovación Shell / Café",
        "abcdef12-3456-7890-abcd-ef1234567890",
        new Date("2026-08-13T10:00:00Z"),
      ),
    ).toBe("importacion-renovacion-shell-cafe-abcdef12-2026-08-13.xlsx");
  });

  it("distingue dos lotes del mismo proyecto y el mismo día", () => {
    const first = importReportFilename("Proyecto", "11111111-aaaa", new Date("2026-08-13T10:00:00Z"));
    const second = importReportFilename("Proyecto", "22222222-bbbb", new Date("2026-08-13T10:00:00Z"));
    expect(first).not.toBe(second);
  });

  it("cae en un nombre usable si el proyecto no aporta nada", () => {
    expect(
      importReportFilename("///", "abcdef12-3456", new Date("2026-08-13T10:00:00Z")),
    ).toBe("importacion-proyecto-abcdef12-2026-08-13.xlsx");
  });
});

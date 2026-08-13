import type { SiteImportRowOutcome } from "@/types/database";

/**
 * Reporte por fila de una importación (R2-IMP-03).
 *
 * Responde la pregunta que queda después de cargar una planilla grande: "de mis
 * 2.000 filas, ¿cuál entró, cuál se reutilizó y cuál quedó afuera y por qué?".
 * El resumen en pantalla da los totales; esto da el detalle, que es lo que
 * permite corregir la planilla y reintentar.
 *
 * No traduce, igual que `site-import.ts`: recibe las etiquetas ya resueltas y
 * devuelve filas. Así el mismo armado sirve para la descarga y para un test.
 */

export type ImportReportRow = {
  row: number;
  name: string;
  externalRef: string | null;
  outcome: SiteImportRowOutcome;
  reason: string | null;
};

/** Encabezados del reporte, en el orden en que se escriben. */
export const IMPORT_REPORT_HEADERS = [
  "Fila",
  "Nombre",
  "Código",
  "Resultado",
  "Motivo",
] as const;

export type ImportReportLabels = Record<SiteImportRowOutcome, string>;

export function buildImportReportRows(
  rows: readonly ImportReportRow[],
  labels: ImportReportLabels,
): (string | number)[][] {
  return [...rows]
    // Por número de fila, para poder seguir el reporte contra la planilla
    // original sin tener que buscar.
    .sort((a, b) => a.row - b.row)
    .map((row) => [
      row.row,
      row.name,
      row.externalRef ?? "",
      labels[row.outcome],
      row.reason ?? "",
    ]);
}

export function buildImportReportSheet(
  rows: readonly ImportReportRow[],
  labels: ImportReportLabels,
): (string | number)[][] {
  return [[...IMPORT_REPORT_HEADERS], ...buildImportReportRows(rows, labels)];
}

/**
 * Nombre de archivo del reporte.
 *
 * Lleva los primeros 8 caracteres del lote: si alguien reintenta una carga y
 * baja los dos reportes, no se pisan en la carpeta de descargas.
 */
export function importReportFilename(
  projectName: string,
  importId: string,
  today: Date,
): string {
  const slug = projectName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  const fecha = today.toISOString().slice(0, 10);
  return `importacion-${slug || "proyecto"}-${importId.slice(0, 8)}-${fecha}.xlsx`;
}

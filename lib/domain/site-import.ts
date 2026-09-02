import { z } from "zod";
import { normalizeHeader } from "@/lib/csv";
import { normalizeLocationExternalRef } from "@/lib/domain/canonical-locations";

/**
 * Análisis de una planilla de locaciones, sin tocar la base.
 *
 * Vive separado de la Server Action a propósito: es la única parte del import
 * que decide qué fila entra y qué fila se descarta, y necesita ser ejecutable
 * dos veces sobre el mismo archivo — una para mostrar el preview y otra al
 * confirmar. Al ser puro, el preview y la carga real no pueden divergir.
 *
 * No traduce: devuelve códigos y el llamador arma el texto. Así el mismo
 * análisis sirve para la UI, para un test y para un reporte descargable.
 */

const COLUMN_ALIASES: Record<string, string[]> = {
  name: [
    "nombre",
    "name",
    "punto",
    "sitio",
    "local",
    "estacion",
    "sucursal",
    // Sin espacio ni acento a propósito: normalizeHeader los saca a los dos,
    // así que el alias tiene que quedar ya colapsado para poder matchear.
    "puntodeventa",
    "ubicacion",
  ],
  address: ["direccion", "address", "domicilio", "endereco", "calle"],
  city: ["ciudad", "city", "localidad", "cidade"],
  state: ["provincia", "state", "estado", "departamento"],
  zone: ["zona", "zone", "region", "regiao"],
  externalRef: ["codigo", "ref", "referencia", "external", "id", "externalref"],
  lat: ["lat", "latitud", "latitude"],
  lng: ["lng", "lon", "longitud", "longitude"],
};

const siteRowSchema = z.object({
  name: z.string().min(1),
  address: z.string().default(""),
  city: z.string().default(""),
  state: z.string().default(""),
  zone: z.string().default(""),
  externalRef: z.string().optional(),
  lat: z.union([z.literal(""), z.coerce.number().min(-90).max(90)]),
  lng: z.union([z.literal(""), z.coerce.number().min(-180).max(180)]),
});

export type SiteImportIssueCode =
  | "missingName"
  | "invalidCoordinates"
  | "zoneOutsideProject"
  | "duplicateInFile"
  | "alreadyImported";

export type SiteImportIssue = {
  /** Fila tal como la numera la planilla: la 1 es el encabezado. */
  row: number;
  code: SiteImportIssueCode;
  /** Dato que explica el problema (la zona rechazada, la referencia repetida). */
  detail?: string;
  /**
   * Nombre que traía la fila, si traía alguno.
   *
   * Sólo para el reporte descargable: una fila descartada identificada nada más
   * que por su número obliga a ir a buscarla a la planilla. Está vacío cuando el
   * problema es justamente que no tiene nombre.
   */
  name?: string;
};

/**
 * Referencia externa de una fila descartada, para el reporte.
 *
 * `detail` significa cosas distintas según el problema —para «fuera de zona» es
 * la zona rechazada, no un código—, así que no se puede volcar tal cual en la
 * columna de código sin mentir.
 */
export function issueExternalRef(issue: SiteImportIssue): string | null {
  switch (issue.code) {
    case "duplicateInFile":
    case "alreadyImported":
      return issue.detail ?? null;
    case "missingName":
    case "invalidCoordinates":
    case "zoneOutsideProject":
      return null;
  }
}

export type ParsedSiteRow = {
  /**
   * Fila de la planilla de la que salió, numerada como la ve el usuario (la 1
   * es el encabezado). La importación la persiste para poder reanudar un lote
   * interrumpido y para el reporte por fila.
   */
  row: number;
  name: string;
  address: string;
  city: string;
  state: string;
  zone: string;
  externalRef: string | null;
  lat: number | null;
  lng: number | null;
};

export type SiteImportCounts = {
  /** Filas con algún dato en la planilla, sin contar el encabezado. */
  found: number;
  valid: number;
  incomplete: number;
  outsideZone: number;
  duplicated: number;
};

export type SiteImportAnalysis = {
  valid: ParsedSiteRow[];
  issues: SiteImportIssue[];
  counts: SiteImportCounts;
};

export type SiteImportOptions = {
  /** Zonas habilitadas del proyecto: una fila fuera de esas zonas no entra. */
  projectZones: readonly string[];
  /** Referencias externas ya cargadas en el proyecto, para no duplicar. */
  knownExternalRefs?: readonly string[];
};

/**
 * Dos referencias que sólo difieren en espacios o mayúsculas son la misma
 * sucursal: quien completa la planilla no siempre respeta el formato.
 */
export function normalizeExternalRef(value: string): string {
  return normalizeLocationExternalRef(value) ?? "";
}

/**
 * Ubica cada campo conocido en la fila de encabezados. Devuelve `null` si no
 * aparece la columna de nombre, que es la única sin la cual no se puede
 * identificar una locación.
 */
export function mapSiteHeaders(
  headerRow: readonly string[],
): Record<string, number> | null {
  const headers = headerRow.map(normalizeHeader);
  const indexOf: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const idx = headers.findIndex((h) => aliases.includes(h));
    if (idx >= 0) indexOf[field] = idx;
  }
  return indexOf.name === undefined ? null : indexOf;
}

/** Una fila sin ningún dato no es un registro incompleto: no es una fila. */
function isEmptyRow(cells: readonly string[]): boolean {
  return cells.every((cell) => (cell ?? "").trim() === "");
}

/**
 * Clasifica todas las filas de datos de la planilla.
 *
 * `rows` incluye el encabezado en la posición 0, igual que lo devuelve el
 * parser de CSV.
 */
export function analyzeSiteRows(
  rows: readonly (readonly string[])[],
  options: SiteImportOptions,
): SiteImportAnalysis {
  const indexOf = mapSiteHeaders(rows[0] ?? []);
  if (!indexOf) {
    return {
      valid: [],
      issues: [],
      counts: { found: 0, valid: 0, incomplete: 0, outsideZone: 0, duplicated: 0 },
    };
  }

  const { projectZones, knownExternalRefs = [] } = options;
  const known = new Set(knownExternalRefs.map(normalizeExternalRef));
  const seenInFile = new Set<string>();

  const valid: ParsedSiteRow[] = [];
  const issues: SiteImportIssue[] = [];
  let found = 0;

  rows.slice(1).forEach((cells, i) => {
    if (isEmptyRow(cells)) return;
    found += 1;

    // +2: la fila 1 es el encabezado y la planilla numera desde 1.
    const row = i + 2;
    const get = (field: string) =>
      indexOf[field] !== undefined ? (cells[indexOf[field]] ?? "") : "";

    // Provincia = zona = state. Puede venir de "zona" o de "provincia"; si el
    // proyecto opera una sola, se asume ésa.
    const zone =
      get("zone").trim() ||
      get("state").trim() ||
      (projectZones.length === 1 ? projectZones[0] : "");

    if (get("name").trim() === "") {
      issues.push({ row, code: "missingName" });
      return;
    }

    const parsed = siteRowSchema.safeParse({
      name: get("name"),
      address: get("address"),
      city: get("city"),
      state: zone,
      zone,
      externalRef: get("externalRef") || undefined,
      lat: get("lat"),
      lng: get("lng"),
    });
    if (!parsed.success) {
      // El nombre ya se validó arriba, así que lo único que puede fallar acá
      // son las coordenadas: valor no numérico o fuera de rango.
      issues.push({ row, code: "invalidCoordinates", name: get("name").trim() });
      return;
    }

    if (!projectZones.includes(parsed.data.zone)) {
      issues.push({
        row,
        code: "zoneOutsideProject",
        detail: parsed.data.zone || undefined,
        name: parsed.data.name,
      });
      return;
    }

    // La referencia externa es la identidad estable de la sucursal. Sin ella no
    // hay forma segura de saber si dos filas son el mismo punto, así que sólo
    // se deduplica cuando viene informada.
    const ref = parsed.data.externalRef?.trim();
    if (ref) {
      const key = normalizeExternalRef(ref);
      if (seenInFile.has(key)) {
        issues.push({
          row,
          code: "duplicateInFile",
          detail: ref,
          name: parsed.data.name,
        });
        return;
      }
      if (known.has(key)) {
        issues.push({
          row,
          code: "alreadyImported",
          detail: ref,
          name: parsed.data.name,
        });
        return;
      }
      seenInFile.add(key);
    }

    valid.push({
      row,
      name: parsed.data.name,
      address: parsed.data.address,
      city: parsed.data.city,
      state: parsed.data.state,
      zone: parsed.data.zone,
      externalRef: ref ?? null,
      lat: parsed.data.lat === "" ? null : parsed.data.lat,
      lng: parsed.data.lng === "" ? null : parsed.data.lng,
    });
  });

  const countBy = (...codes: SiteImportIssueCode[]) =>
    issues.filter((issue) => codes.includes(issue.code)).length;

  return {
    valid,
    issues,
    counts: {
      found,
      valid: valid.length,
      incomplete: countBy("missingName", "invalidCoordinates"),
      outsideZone: countBy("zoneOutsideProject"),
      duplicated: countBy("duplicateInFile", "alreadyImported"),
    },
  };
}

import { SITE_TEMPLATE_HEADERS } from "@/lib/domain/site-template";

/**
 * Exportación de locaciones a planilla (R2-IMP-04).
 *
 * El contrato es el ida y vuelta: lo que sale tiene que poder volver a entrar
 * por el importador sin pérdida. Por eso las columnas se toman de
 * `SITE_TEMPLATE_HEADERS` en vez de escribirse acá — si alguien agrega una
 * columna a la plantilla y se olvida de la exportación, el test de round-trip
 * lo señala en vez de descubrirlo un cliente con una planilla incompleta.
 *
 * Es una función pura para poder probar exactamente eso: exportar, volver a
 * parsear y comparar.
 */

export type ExportableSite = {
  name: string;
  address: string | null;
  city: string | null;
  /** En el importador provincia = zona = state: es un solo valor. */
  zone: string | null;
  externalRef: string | null;
  lat: number | null;
  lng: number | null;
};

/**
 * Las coordenadas van con punto decimal y sin notación científica.
 *
 * Excel muestra `-3.46037e+1` si el número llega como float en ciertos rangos, y
 * eso vuelve como texto no numérico en la reimportación. Se escriben como texto
 * ya formateado.
 */
function formatCoordinate(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "";
  return String(value);
}

/** Una fila por locación, en el orden exacto de la plantilla. */
export function buildSiteExportRows(
  sites: readonly ExportableSite[],
): string[][] {
  return sites.map((site) => [
    site.name,
    site.address ?? "",
    site.city ?? "",
    site.zone ?? "",
    site.externalRef ?? "",
    formatCoordinate(site.lat),
    formatCoordinate(site.lng),
  ]);
}

/** Encabezado + filas, que es lo que consume tanto el .xlsx como el parser. */
export function buildSiteExportSheet(
  sites: readonly ExportableSite[],
): string[][] {
  return [[...SITE_TEMPLATE_HEADERS], ...buildSiteExportRows(sites)];
}

/**
 * Nombre de archivo legible y sin caracteres que rompan la descarga.
 *
 * Se acota a 60 para no chocar con límites de nombre en Windows cuando el
 * proyecto tiene un nombre largo.
 */
export function siteExportFilename(projectName: string, today: Date): string {
  const slug = projectName
    .normalize("NFD")
    // Marcas de acento que NFD separa de su letra: "Refacción" -> "Refaccion".
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  const fecha = today.toISOString().slice(0, 10);
  return `locaciones-${slug || "proyecto"}-${fecha}.xlsx`;
}

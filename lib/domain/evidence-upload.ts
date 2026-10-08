/**
 * Nombre y tipo con que una foto del instalador entra al bucket `evidence`.
 *
 * Las fotos que se eligen de la galería del celular no traen las garantías de
 * las que se sacan con la cámara desde la app:
 *
 * - El nombre puede venir con espacios, acentos o símbolos ("Foto 1 (2).jpg",
 *   "Instalación #3.jpeg"), y Storage rechaza la clave entera con "Invalid
 *   key". Por eso la clave usa sólo el id y una extensión saneada; el nombre
 *   original no hace falta para nada aguas abajo.
 * - Android a veces entrega `file.type` vacío (sobre todo HEIC). Sin tipo, la
 *   subida viaja como `application/octet-stream` y la allowlist del bucket la
 *   rechaza. Se deduce de la extensión.
 */

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

function extensionOf(fileName: string): string {
  if (!fileName.includes(".")) return "";
  return (fileName.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
}

/** Tipo a declarar en la subida: el del archivo, o el deducido de su extensión. */
export function evidenceContentType(fileName: string, type: string): string {
  if (type) return type;
  return MIME_BY_EXTENSION[extensionOf(fileName)] ?? "image/jpeg";
}

/** Último tramo de la clave en Storage: `<id>.<ext>`, siempre ASCII seguro. */
export function evidenceObjectName(id: string, fileName: string, type: string): string {
  const fromName = extensionOf(fileName);
  if (fromName) return `${id}.${fromName}`;
  const fromType = (type.split("/")[1] ?? "").replace(/[^a-z0-9]/g, "").slice(0, 10);
  return `${id}.${fromType || "jpg"}`;
}

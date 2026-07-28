/**
 * Columnas de la planilla de carga de locaciones.
 *
 * Fuente única: la usan la plantilla .xlsx que se descarga, el lector de Excel
 * y el parser de CSV. Si cambia una columna, cambia en los tres lados a la vez.
 */
export const SITE_COLUMNS = [
  { key: "nombre", width: 28, required: true },
  { key: "direccion", width: 34, required: true },
  { key: "ciudad", width: 20, required: false },
  { key: "provincia", width: 22, required: false },
  { key: "codigo", width: 16, required: false },
  { key: "lat", width: 14, required: false },
  { key: "lng", width: 14, required: false },
] as const;

export type SiteColumnKey = (typeof SITE_COLUMNS)[number]["key"];

export const SITE_TEMPLATE_HEADERS = SITE_COLUMNS.map((column) => column.key);

/** Filas de ejemplo, para que se entienda el formato de un vistazo. */
export const SITE_TEMPLATE_EXAMPLES: string[][] = [
  [
    "Sucursal Centro",
    "Av. Corrientes 1234",
    "CABA",
    "Buenos Aires",
    "SUC-001",
    "-34.6037",
    "-58.3816",
  ],
  [
    "Sucursal Norte",
    "Av. Cabildo 2500",
    "CABA",
    "Buenos Aires",
    "SUC-002",
    "",
    "",
  ],
];

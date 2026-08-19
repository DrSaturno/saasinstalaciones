/**
 * Lectura de la cola de revisión del backfill canónico (R2-UI-03).
 *
 * El backfill de `20260805000003` no fusiona por nombre ni por dirección: si no
 * puede decidir con la referencia externa, deja la fila en
 * `location_backfill_issues` con el contexto crudo en `details`. Este módulo
 * traduce ese JSON a algo que se pueda mostrar y decidir, sin tocar la base.
 *
 * Lo que hace útil a la pantalla no es listar los conflictos sino señalar **qué
 * campos difieren** entre las variantes: con dos direcciones en ciudades
 * distintas la decisión es obvia, y con sólo el nombre distinto también, pero
 * por motivos opuestos.
 */

export type LocationIssueCode =
  | "missing_client"
  | "missing_external_ref"
  | "conflicting_source_data";

/** Campos que el backfill compara para decidir si dos filas son la misma. */
export const VARIANT_FIELDS = [
  "name",
  "address",
  "city",
  "state",
  "contact_name",
  "contact_phone",
] as const;

export type VariantField = (typeof VARIANT_FIELDS)[number];

export type LocationVariant = Partial<Record<VariantField, string>>;

export type VariantComparison = {
  variants: LocationVariant[];
  /** Campos con más de un valor distinto entre las variantes. */
  differing: VariantField[];
  /** Campos presentes y coincidentes en todas: el terreno común. */
  shared: VariantField[];
};

function readString(source: unknown, key: string): string | undefined {
  if (typeof source !== "object" || source === null) return undefined;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

/** Normaliza para comparar: el backfill ya guarda en minúsculas, no todo. */
function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Extrae las variantes de `details.variants`, descartando lo que no tenga forma
 * de objeto. Un `details` corrupto no debe romper la pantalla: la cola existe
 * justamente para filas que ya vinieron mal.
 */
export function parseVariants(details: unknown): LocationVariant[] {
  if (typeof details !== "object" || details === null) return [];
  const raw = (details as Record<string, unknown>).variants;
  if (!Array.isArray(raw)) return [];

  const variants: LocationVariant[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const variant: LocationVariant = {};
    for (const field of VARIANT_FIELDS) {
      const value = readString(entry, field);
      if (value !== undefined) variant[field] = value;
    }
    if (Object.keys(variant).length > 0) variants.push(variant);
  }
  return variants;
}

/**
 * Compara las variantes campo por campo.
 *
 * Un campo vacío en todas las variantes no es «coincidente»: no aporta nada
 * para decidir, así que no va ni a `differing` ni a `shared`.
 */
export function compareVariants(variants: LocationVariant[]): VariantComparison {
  const differing: VariantField[] = [];
  const shared: VariantField[] = [];

  for (const field of VARIANT_FIELDS) {
    const values = new Set(variants.map((variant) => normalize(variant[field])));
    const hasContent = [...values].some((value) => value !== "");
    if (!hasContent) continue;
    if (values.size > 1) differing.push(field);
    else shared.push(field);
  }

  return { variants, differing, shared };
}

/**
 * Cuánto trabajo manual implica cada motivo, para ordenar la cola.
 *
 * `conflicting_source_data` va primero porque es el único donde el backfill ya
 * vinculó algo: la locación existe y quedó con los datos de una de las
 * variantes, así que mientras no se resuelva hay una ficha mostrando datos que
 * pueden ser de otro local. Los otros dos dejaron la fila sin vincular, que es
 * visible pero no engañoso.
 */
const PRIORITY: Record<LocationIssueCode, number> = {
  conflicting_source_data: 0,
  missing_client: 1,
  missing_external_ref: 2,
};

export function issuePriority(code: LocationIssueCode): number {
  return PRIORITY[code] ?? 99;
}

export type SortableIssue = {
  code: LocationIssueCode;
  siteCount: number;
  createdAt: string;
};

/** Primero lo engañoso, y dentro de cada motivo lo que afecta a más puntos. */
export function sortIssues<T extends SortableIssue>(issues: readonly T[]): T[] {
  return [...issues].sort((a, b) => {
    const byPriority = issuePriority(a.code) - issuePriority(b.code);
    if (byPriority !== 0) return byPriority;
    if (b.siteCount !== a.siteCount) return b.siteCount - a.siteCount;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

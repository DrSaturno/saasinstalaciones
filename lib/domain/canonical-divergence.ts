/**
 * Medición de divergencia entre `sites` y el modelo canónico (R2-DB-04).
 *
 * El plan pide cortar la proyección legacy «sólo con divergencia cero
 * aceptada». Para poder aceptarla primero hay que verla, y hasta ahora nadie
 * la medía: se sabía que 129 de 130 puntos habían quedado vinculados, pero no
 * si los datos de cada par coincidían.
 *
 * Este módulo compara un `site` contra la `location` a la que apunta y dice
 * qué campos no coinciden. Es puro para poder probar los casos borde sin base:
 * son justamente los que deciden si el corte es seguro.
 */

/** Campos que existen en las dos tablas y deberían decir lo mismo. */
export const COMPARED_FIELDS = [
  "name",
  "address",
  "city",
  "state",
  "zone",
  "externalRef",
  "lat",
  "lng",
] as const;

export type ComparedField = (typeof COMPARED_FIELDS)[number];

export type ComparableRecord = {
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zone: string | null;
  externalRef: string | null;
  lat: number | null;
  lng: number | null;
};

export type SiteDivergence =
  /** El site no apunta a ninguna locación: no se puede leer canónicamente. */
  | { kind: "unlinked"; siteId: string }
  /** Apunta a una locación que no vino en el conjunto comparado. */
  | { kind: "missingLocation"; siteId: string; locationId: string }
  /** Vinculado, pero sin fila en `project_locations` para su proyecto. */
  | { kind: "missingAssociation"; siteId: string; locationId: string }
  /** Vinculado y asociado, pero con datos distintos. */
  | { kind: "fieldMismatch"; siteId: string; locationId: string; fields: ComparedField[] };

export type DivergenceReport = {
  totalSites: number;
  linkedSites: number;
  /** Sites que podrían leerse del modelo canónico sin perder nada. */
  cleanSites: number;
  divergences: SiteDivergence[];
  counts: Record<SiteDivergence["kind"], number>;
};

/**
 * Compara texto ignorando mayúsculas y espacios sobrantes.
 *
 * Una diferencia de capitalización entre «CABA» y «caba» no justifica frenar
 * un cutover: no cambia lo que ve nadie. Lo que importa es que no digan cosas
 * distintas.
 */
function sameText(a: string | null, b: string | null): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

/**
 * Compara coordenadas con tolerancia.
 *
 * Un site y su locación pueden diferir en el último decimal por el redondeo
 * de `numeric`. 1e-6 grados son ~11 cm: por debajo de eso no hay diferencia
 * real en el terreno.
 */
function sameCoordinate(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < 1e-6;
}

/** Campos en los que estos dos registros no dicen lo mismo. */
export function comparedFieldsThatDiffer(
  site: ComparableRecord,
  location: ComparableRecord,
): ComparedField[] {
  const differing: ComparedField[] = [];
  for (const field of COMPARED_FIELDS) {
    const equal =
      field === "lat" || field === "lng"
        ? sameCoordinate(site[field], location[field])
        : sameText(site[field] as string | null, location[field] as string | null);
    if (!equal) differing.push(field);
  }
  return differing;
}

export type SiteRow = ComparableRecord & {
  id: string;
  projectId: string;
  locationId: string | null;
};

export type LocationRow = ComparableRecord & { id: string };

/**
 * Recorre los sites y clasifica cada uno.
 *
 * `associations` son los pares proyecto→locación que existen en
 * `project_locations`, la asociación explícita que el modelo canónico usa para
 * saber que un local participa de una campaña.
 */
export function measureDivergence(
  sites: readonly SiteRow[],
  locations: readonly LocationRow[],
  associations: ReadonlySet<string>,
): DivergenceReport {
  const byId = new Map(locations.map((location) => [location.id, location]));
  const divergences: SiteDivergence[] = [];

  for (const site of sites) {
    if (!site.locationId) {
      divergences.push({ kind: "unlinked", siteId: site.id });
      continue;
    }
    const location = byId.get(site.locationId);
    if (!location) {
      divergences.push({
        kind: "missingLocation",
        siteId: site.id,
        locationId: site.locationId,
      });
      continue;
    }
    if (!associations.has(`${site.projectId}:${site.locationId}`)) {
      divergences.push({
        kind: "missingAssociation",
        siteId: site.id,
        locationId: site.locationId,
      });
      continue;
    }
    const fields = comparedFieldsThatDiffer(site, location);
    if (fields.length > 0) {
      divergences.push({
        kind: "fieldMismatch",
        siteId: site.id,
        locationId: site.locationId,
        fields,
      });
    }
  }

  const counts: Record<SiteDivergence["kind"], number> = {
    unlinked: 0,
    missingLocation: 0,
    missingAssociation: 0,
    fieldMismatch: 0,
  };
  for (const divergence of divergences) counts[divergence.kind] += 1;

  const linkedSites = sites.filter((site) => site.locationId !== null).length;

  return {
    totalSites: sites.length,
    linkedSites,
    cleanSites: sites.length - divergences.length,
    divergences,
    counts,
  };
}

/** El corte es seguro sólo si ningún site perdería datos al leerse canónico. */
export function isCutoverSafe(report: DivergenceReport): boolean {
  return report.divergences.length === 0;
}

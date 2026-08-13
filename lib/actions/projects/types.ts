/**
 * Tipos compartidos por los casos de uso de proyectos.
 *
 * Vive aparte de `context.ts` a propósito: los componentes cliente importan
 * `ActionState` e `ImportResult`, y este archivo no arrastra nada de servidor.
 */

export type ActionState = { error: string | null; ok?: boolean; id?: string };

export type ImportResult = {
  error: string | null;
  inserted: number;
  skipped: { row: number; reason: string }[];
  /**
   * Lote de la confirmación. Falta cuando se rechazó antes de llegar a crearlo
   * (acceso denegado, proyecto ajeno, planilla ilegible): en esos casos no hay
   * nada que reanudar ni que reportar.
   */
  importId?: string;
};

/**
 * Resultado de analizar la planilla sin escribir nada.
 *
 * `expected` es la cantidad de locaciones que el proyecto declara tener
 * (`planned_installations`) y `difference` cuánto falta para llegar a esa
 * cantidad: es el control que evita dar por cerrada una carga a la que le
 * faltan sucursales.
 */
export type ImportPreflight = {
  error: string | null;
  expected: number;
  found: number;
  valid: number;
  incomplete: number;
  outsideZone: number;
  duplicated: number;
  difference: number;
  issues: { row: number; reason: string }[];
};

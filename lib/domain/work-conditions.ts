/**
 * Condiciones objetivas de un trabajo (DEC-16).
 *
 * La dificultad no se declara como un nivel ("media", "alta"): se declara como
 * un conjunto de condiciones verificables. El motivo es que la reputación está
 * pensada para cruzar empresas, y un nivel que cada empresa llena con su propia
 * vara hace que "7 trabajos complejos" deje de significar lo mismo entre dos
 * inquilinos. "Altura + nocturno" significa lo mismo en todos lados.
 *
 * Por la misma razón NO se infiere de `priority` ni del texto libre: REQ-10.3
 * lo prohíbe explícitamente.
 *
 * **Acá no hay pesos.** Cuánto suma cada condición es parte de la fórmula, y la
 * fórmula tiene su propia versión (Fase 2). Este módulo sólo dice qué
 * condiciones existen y cuáles tiene un trabajo.
 */

import type { ExplicitWorkCondition } from "@/types/database";

export type { ExplicitWorkCondition };

/**
 * Las que alguien declara sobre la orden y se guardan en
 * `work_order_conditions`.
 *
 * El tipo sale de la base (`ExplicitWorkCondition`, estrechado desde el CHECK)
 * y el array de acá es el orden de presentación. El `satisfies` los ata: si
 * una migración saca una condición, este array deja de compilar en vez de
 * ofrecer una casilla que la base va a rechazar.
 */
export const EXPLICIT_WORK_CONDITIONS = [
  "altura",
  "electrico",
  "nocturno",
  "gran_formato",
  "acceso_restringido",
] as const satisfies readonly ExplicitWorkCondition[];

/**
 * Las que NO se guardan porque el dato ya existe en `work_orders`.
 *
 * Copiarlas a la tabla de condiciones daría dos fuentes de verdad para el mismo
 * hecho: alguien edita `requires_freight` y la fila de condición queda vieja,
 * contradiciendo a la orden que dice representar. Se derivan al leer.
 */
export const DERIVED_WORK_CONDITIONS = ["exterior", "flete"] as const;

/** El orden es el de presentación, y es estable a propósito. */
export const WORK_CONDITIONS = [
  ...EXPLICIT_WORK_CONDITIONS,
  ...DERIVED_WORK_CONDITIONS,
] as const;

export type WorkCondition = (typeof WORK_CONDITIONS)[number];

/** Las columnas de `work_orders` de las que salen las condiciones derivadas. */
export type DerivedConditionSource = {
  indoor: boolean;
  requiresFreight: boolean;
};

function isExplicit(value: unknown): value is ExplicitWorkCondition {
  return (
    typeof value === "string" &&
    (EXPLICIT_WORK_CONDITIONS as readonly string[]).includes(value)
  );
}

/**
 * Filtra y deduplica lo que llega del cliente o de la base.
 *
 * Devuelve las condiciones en el orden del catálogo y no en el de llegada: dos
 * órdenes con las mismas condiciones tienen que verse igual, sin depender de
 * en qué orden se tildaron las casillas.
 */
export function parseExplicitConditions(
  values: readonly unknown[],
): ExplicitWorkCondition[] {
  const present = new Set(values.filter(isExplicit));
  return EXPLICIT_WORK_CONDITIONS.filter((condition) => present.has(condition));
}

/**
 * Las condiciones que se deducen de la orden.
 *
 * `indoor` invertido: la condición es estar a la intemperie, no bajo techo.
 */
export function derivedWorkConditions(
  source: DerivedConditionSource,
): WorkCondition[] {
  return DERIVED_WORK_CONDITIONS.filter((condition) =>
    condition === "exterior" ? !source.indoor : source.requiresFreight,
  );
}

/** Todas las condiciones de un trabajo: las declaradas más las derivadas. */
export function workConditionsOf(
  explicit: readonly unknown[],
  source: DerivedConditionSource,
): WorkCondition[] {
  const all = new Set<WorkCondition>([
    ...parseExplicitConditions(explicit),
    ...derivedWorkConditions(source),
  ]);
  return WORK_CONDITIONS.filter((condition) => all.has(condition));
}

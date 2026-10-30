/**
 * Los importes comerciales —lo que la empresa le cobra a su cliente— viven en
 * tablas propias (`work_order_pricing`, `project_pricing`) que sólo ve quien
 * pasa `auth_can_see_commercials` (hoy, el gerente). Ver
 * docs/specs/2026-09-24-privacidad-de-importes.
 *
 * Los lectores de la empresa los piden como recurso anidado en la misma
 * consulta (`work_orders(..., work_order_pricing(amount))`). Para quien no puede
 * verlos, la RLS devuelve el recurso vacío: acá eso es simplemente `null`, el
 * mismo valor que ya significaba «sin importe cargado».
 *
 * PostgREST entrega un recurso anidado como objeto cuando la relación es
 * uno-a-uno y como arreglo cuando no lo reconoce como tal (la clave foránea es
 * compuesta). Se aceptan ambas formas para no depender de esa inferencia.
 */

export const ORDER_PRICING_SELECT = "work_order_pricing(amount)";
export const PROJECT_PRICING_SELECT = "project_pricing(contract_amount)";

type Embedded<T> = T | T[] | null | undefined;

export type OrderPricingEmbed = {
  work_order_pricing?: Embedded<{ amount: number | string }>;
};

export type ProjectPricingEmbed = {
  project_pricing?: Embedded<{ contract_amount: number | string }>;
};

function first<T>(value: Embedded<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Importe comercial de la orden, o `null` si no hay o no se puede ver. */
export function embeddedOrderAmount(row: OrderPricingEmbed): number | null {
  return toNumber(first(row.work_order_pricing)?.amount);
}

/** Monto de contrato del proyecto, o `null` si no hay o no se puede ver. */
export function embeddedProjectContractAmount(row: ProjectPricingEmbed): number | null {
  return toNumber(first(row.project_pricing)?.contract_amount);
}

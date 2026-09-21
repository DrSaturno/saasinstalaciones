/**
 * Límites del alta de una empresa, compartidos entre la ruta
 * `/api/master/companies` y su formulario (`create-company-dialog.tsx`). Una
 * ruta de Next sólo puede exportar sus handlers, así que viven acá.
 */
export const COMPANY_LIMITS = {
  name: { min: 2, max: 150 },
  /** Prefijo de los números de orden: sólo letras, en mayúsculas. */
  orderPrefix: { min: 2, max: 5, pattern: "[A-Za-z]{2,5}" },
} as const;

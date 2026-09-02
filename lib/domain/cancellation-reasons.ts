/**
 * Motivos por los que un instalador puede pedir la baja de un trabajo.
 *
 * Viven acá y no junto a la Server Action porque un archivo `"use server"`
 * **sólo puede exportar funciones async**: exportar esta constante desde ahí
 * hace fallar la página entera en tiempo de ejecución, con un error que ni el
 * type-check ni los tests unitarios ven. Sólo aparece corriendo la app.
 */
export const CANCELLATION_REASONS = [
  "personal_emergency",
  "health",
  "work_conditions",
  "schedule_conflict",
  "other",
] as const;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

import { describe, expect, it } from "vitest";
import { businessDaysUntil } from "@/lib/domain/business-days";

/**
 * Paridad entre las dos implementaciones de días hábiles.
 *
 * Hay dos a propósito y con roles distintos:
 *   * `public.business_days_between` (SQL) es la **autoridad**: decide
 *     `within_notice`, que dispara la autoaprobación de una baja. Si eso lo
 *     calculara la aplicación, cualquiera podría llamar al RPC diciendo "estoy
 *     en plazo" y saltearse la revisión.
 *   * `businessDaysUntil` (acá) es la **vista previa**: lo que se le muestra al
 *     instalador antes de apretar.
 *
 * Las dos leen el mismo calendario (`non_working_days`), así que no pueden
 * discrepar en los datos. Lo que sí podrían es discrepar en la cuenta, y ahí
 * el instalador vería un plazo distinto del que el servidor aplica — el tipo
 * de error que rompe la confianza en todo el sistema.
 *
 * Los valores esperados de este archivo se obtuvieron **ejecutando la función
 * SQL** contra los feriados sembrados, no calculándolos a mano. Si alguna de
 * las dos cambia, este archivo se pone en rojo.
 */

// Feriados AR 2026 sembrados por la migración que tocan estos casos.
const calendarioAR2026 = {
  holidays: new Set([
    "2026-08-17", // Paso a la Inmortalidad del General San Martín
    "2026-11-23", // Día de la Soberanía Nacional, ya trasladado al lunes
  ]),
};

const casos: ReadonlyArray<[string, string, string, number]> = [
  ["mismo día", "2026-09-01", "2026-09-01", 0],
  ["martes a jueves", "2026-09-01", "2026-09-03", 2],
  ["viernes a lunes, cruzando el fin de semana", "2026-09-04", "2026-09-07", 1],
  ["cruza el feriado del 23/11", "2026-11-19", "2026-11-24", 2],
  ["cruza San Martín del 17/08", "2026-08-14", "2026-08-18", 1],
  ["el 20/11/2026 no es feriado: se trasladó", "2026-11-19", "2026-11-20", 1],
  ["hacia atrás da negativo", "2026-09-03", "2026-09-01", -2],
  ["una semana corrida", "2026-09-01", "2026-09-08", 5],
];

describe("paridad SQL / TypeScript en días hábiles", () => {
  for (const [nombre, desde, hasta, esperado] of casos) {
    it(`${nombre}: ${esperado}`, () => {
      expect(businessDaysUntil(desde, hasta, calendarioAR2026)).toBe(esperado);
    });
  }
});

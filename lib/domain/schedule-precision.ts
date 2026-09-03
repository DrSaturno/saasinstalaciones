/**
 * Qué tan precisa es la agenda de una actividad, y qué se puede afirmar con eso.
 *
 * **La regla que este módulo existe para sostener** (AG-R10): *no verificable*
 * no es lo mismo que *sin conflicto*. Dos trabajos el mismo día en ciudades
 * distintas, ambos sin hora, no son un choque demostrable — pero tampoco son un
 * visto bueno. Confundir las dos cosas es el error fácil de este punto, y sale
 * caro en las dos direcciones: bloquear de más frustra, y dejar pasar de menos
 * termina en una cancelación.
 *
 * **Acá no se arman instantes.** Combinar una fecha, una hora y una zona
 * horaria da un momento en el tiempo, y eso lo hace SQL con
 * `timestamp at time zone`, que conoce los husos de verdad. Hacerlo en
 * JavaScript sería reimplementar un calendario para volver a equivocarse con
 * el mismo tipo de bug que ya nos costó una corrida de CI. Este módulo trabaja
 * con las piezas sueltas: fecha `YYYY-MM-DD` y hora `HH:MM`.
 */

import type { SchedulePrecision } from "@/types/database";

export type { SchedulePrecision };

/** Lo que el formulario puede haber cargado. */
export type ScheduleInput = {
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
};

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(value: string | null | undefined): value is string {
  return typeof value === "string" && TIME.test(value);
}

function minutesOf(time: string): number {
  const [hours, minutes] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function timeOf(totalMinutes: number): string {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = String(Math.floor(wrapped / 60)).padStart(2, "0");
  const minutes = String(wrapped % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * El fin propuesto a partir del inicio y una duración estimada.
 *
 * Devuelve la hora dando la vuelta al reloj si hace falta: un trabajo nocturno
 * que empieza 22:00 y dura tres horas termina 01:00 del día siguiente, y eso es
 * un caso real —`nocturno` es una de las condiciones de dificultad—, no una
 * entrada inválida.
 */
export function endFromDuration(
  startTime: string,
  durationMinutes: number,
): string | null {
  if (!isValidTime(startTime)) return null;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
  return timeOf(minutesOf(startTime) + Math.round(durationMinutes));
}

/** `true` cuando el trabajo cruza la medianoche y termina al día siguiente. */
export function endsNextDay(startTime: string, endTime: string): boolean {
  if (!isValidTime(startTime) || !isValidTime(endTime)) return false;
  return minutesOf(endTime) <= minutesOf(startTime);
}

/**
 * La precisión que corresponde a lo que efectivamente se cargó.
 *
 * No se infiere ni se completa: si falta la hora de fin y no hay duración con
 * qué derivarla, la respuesta es `day`. Inventarle una franja a una orden para
 * poder bloquearla es exactamente lo que AC-11-C prohíbe.
 */
export function precisionFor(input: ScheduleInput): SchedulePrecision {
  if (!input.date) return "unknown";

  const hasStart = isValidTime(input.startTime);
  if (!hasStart) return "day";

  const hasEnd =
    isValidTime(input.endTime) ||
    (input.durationMinutes !== null &&
      endFromDuration(input.startTime as string, input.durationMinutes) !== null);

  return hasEnd ? "exact" : "day";
}

/**
 * Si dos actividades con estas precisiones admiten una afirmación sobre si
 * chocan.
 *
 * Sólo `exact` contra `exact` permite decir que sí o que no. Cualquier otra
 * combinación deja la pregunta abierta, y la pantalla tiene que decirlo así en
 * vez de mostrar un visto bueno que no se ganó.
 */
export function canDecideConflict(
  a: SchedulePrecision,
  b: SchedulePrecision,
): boolean {
  return a === "exact" && b === "exact";
}

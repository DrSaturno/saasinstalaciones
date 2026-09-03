/**
 * Cómo se combinan la disponibilidad personal y la de cada empresa (AG-R9).
 *
 * **La regla.** La disponibilidad global es de la persona: dice cuándo trabaja,
 * valga para la empresa que valga. La de cada empresa es una preferencia dentro
 * de eso. Entonces lo efectivo es la **intersección**, y no una suma: una
 * empresa puede pedir menos horas de las que la persona ofrece, nunca más.
 *
 * Decir "la global tiene precedencia" y después dejar que una empresa amplíe la
 * ventana sería lo mismo que no tener disponibilidad personal: bastaría con que
 * una empresa declarara horario corrido para que la persona quedara disponible
 * un domingo que dijo que no trabajaba.
 *
 * **No declarar nada no es declarar que no.** Quien todavía no cargó su
 * disponibilidad global no queda bloqueado en todas partes: queda sin
 * restricción propia, y manda la de la empresa. Lo contrario dejaría a todo el
 * mundo sin poder recibir trabajo el día que esto se active.
 */

export type WeeklyWindow = {
  /** 0 = domingo, como en `installer_weekly_availability.weekday`. */
  weekday: number;
  /** `HH:MM`. */
  startsAt: string;
  endsAt: string;
};

export type AbsenceRange = {
  /** ISO. */
  startsAt: string;
  endsAt: string;
};

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function overlapOf(a: WeeklyWindow, b: WeeklyWindow): WeeklyWindow | null {
  const start = Math.max(toMinutes(a.startsAt), toMinutes(b.startsAt));
  const end = Math.min(toMinutes(a.endsAt), toMinutes(b.endsAt));
  if (start >= end) return null;
  return {
    weekday: a.weekday,
    startsAt: start === toMinutes(a.startsAt) ? a.startsAt : b.startsAt,
    endsAt: end === toMinutes(a.endsAt) ? a.endsAt : b.endsAt,
  };
}

/**
 * Las ventanas en que la persona efectivamente trabaja para una empresa.
 *
 * Sin ventanas globales, manda la empresa. Sin ventanas de empresa, mandan las
 * globales. Con las dos, la intersección.
 */
export function effectiveWeeklyWindows(
  global: readonly WeeklyWindow[],
  company: readonly WeeklyWindow[],
): WeeklyWindow[] {
  if (global.length === 0) return [...company];
  if (company.length === 0) return [...global];

  const result: WeeklyWindow[] = [];
  for (const own of global) {
    for (const theirs of company) {
      if (own.weekday !== theirs.weekday) continue;
      const overlap = overlapOf(own, theirs);
      if (overlap) result.push(overlap);
    }
  }
  return result;
}

/** Dos rangos de tiempo que se tocan. Los extremos no cuentan como choque. */
export function absenceOverlaps(
  absence: AbsenceRange,
  range: AbsenceRange,
): boolean {
  return absence.startsAt < range.endsAt && range.startsAt < absence.endsAt;
}

/**
 * Si algún ausencia tapa el rango propuesto.
 *
 * Las globales valen en todas las empresas; las de una empresa, sólo ahí. Quien
 * llama decide qué lista pasa, y por eso acá no se filtra por estado: una
 * ausencia rechazada o cancelada no debería ni llegar a esta lista, y
 * silenciarla acá escondería un error de la consulta.
 */
export function isBlockedByAbsence(
  absences: readonly AbsenceRange[],
  range: AbsenceRange,
): boolean {
  return absences.some((absence) => absenceOverlaps(absence, range));
}

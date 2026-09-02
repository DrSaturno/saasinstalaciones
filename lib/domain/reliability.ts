/**
 * Índice de confiabilidad del instalador.
 *
 * **Por qué vive acá y no en SQL.** En modo sombra nada del servidor depende
 * de este número: no filtra ofertas, no bloquea, no cambia prioridades. Sólo
 * se muestra. Mientras eso siga siendo cierto, una función pura es el mejor
 * lugar — se prueba sin base, sin reloj y sin sesión, y la propiedad que más
 * importa (recalcular con los mismos eventos da el mismo resultado) es trivial
 * de verificar. Si algún día el índice pasa a gatear ofertas, se muda a SQL:
 * ahí sí sería una decisión de seguridad y el cliente no podría ser la
 * autoridad. Ese día es el R6-GATE y requiere aprobación explícita.
 *
 * **Qué representa.** El requisito pide que no dependa sólo de la cantidad de
 * cancelaciones sino del nivel general de cumplimiento, que la penalización
 * sea progresiva, y que se pueda recuperar. Las tres cosas salen de la misma
 * mecánica:
 *
 *   * Se arranca en 100 y las faltas restan. Un historial limpio no necesita
 *     acumular méritos para estar bien.
 *   * Cada falta pesa MÁS que la anterior dentro de la ventana: una situación
 *     puntual no es lo mismo que una conducta repetida.
 *   * El peso de cada falta se desvanece con el tiempo y los cumplimientos lo
 *     compensan. Así una penalización es una consecuencia del comportamiento
 *     reciente, no una marca permanente.
 */

export const FORMULA_VERSION = "v1";
/** Ventana de comportamiento reciente. Lo anterior ya no pesa. */
export const WINDOW_DAYS = 180;
/** Debajo de esto no se afirma un nivel: no hay historia suficiente. */
export const MIN_SAMPLE = 5;

export type ReliabilityKind =
  | "order_accepted"
  | "order_completed"
  | "cancel_in_notice"
  | "cancel_late"
  | "cancel_justified"
  | "reschedule_accepted"
  | "reschedule_declined"
  | "reschedule_no_response";

export type ReliabilityEvent = {
  id: string;
  kind: ReliabilityKind;
  occurredAt: string;
  orderId: string | null;
  revertedAt: string | null;
};

/**
 * Cuánto suma o resta cada hecho.
 *
 * Los ceros son deliberados y son la parte del requisito que más fácil se
 * rompe: darse de baja EN PLAZO y una baja fuera de plazo que la empresa
 * consideró JUSTIFICADA no penalizan. Están en la tabla con peso 0, y no
 * omitidos, para que se vean en el desglose — el instalador tiene que poder
 * comprobar que ese evento no le costó nada.
 */
export const WEIGHTS: Readonly<Record<ReliabilityKind, number>> = {
  order_accepted: 1,
  order_completed: 3,
  reschedule_accepted: 2,
  cancel_in_notice: 0,
  cancel_justified: 0,
  reschedule_declined: 0,
  cancel_late: -6,
  reschedule_no_response: -6,
};

/** Cuánto más pesa cada falta sucesiva dentro de la ventana. */
const ESCALATION_STEP = 0.5;
const MAX_ESCALATION = 3;

export type ReliabilityContribution = {
  event: ReliabilityEvent;
  /** Peso base según el tipo, antes de antigüedad y reincidencia. */
  baseWeight: number;
  /** 1 recién ocurrido, 0 al borde de la ventana. */
  recency: number;
  /** 1 la primera falta, más alto en las siguientes. */
  escalation: number;
  /** Lo que efectivamente movió el índice. */
  effect: number;
  /** Cuándo deja de pesar del todo. */
  fadesOn: string;
};

export type ReliabilitySummary = {
  formulaVersion: string;
  windowDays: number;
  /** Eventos que cuentan: dentro de la ventana y no revertidos. */
  sampleSize: number;
  /** Null cuando no hay historia suficiente para afirmar un nivel. */
  score: number | null;
  hasEnoughHistory: boolean;
  counts: Record<ReliabilityKind, number>;
  contributions: ReliabilityContribution[];
  /** Las faltas que hoy están restando, de la más pesada a la más liviana. */
  penalties: ReliabilityContribution[];
};

function dayDiff(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  return (to - from) / 86_400_000;
}

function addDaysIso(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
}

const EMPTY_COUNTS = (): Record<ReliabilityKind, number> => ({
  order_accepted: 0,
  order_completed: 0,
  reschedule_accepted: 0,
  cancel_in_notice: 0,
  cancel_justified: 0,
  reschedule_declined: 0,
  cancel_late: 0,
  reschedule_no_response: 0,
});

/**
 * Calcula el índice a una fecha dada.
 *
 * `asOf` es obligatorio y no tiene default a propósito: si leyera el reloj por
 * dentro, dos llamadas con los mismos eventos podrían dar distinto y la
 * propiedad que ADR-011 exige dejaría de ser verificable.
 */
export function summarizeReliability(
  events: readonly ReliabilityEvent[],
  asOf: string,
): ReliabilitySummary {
  const counts = EMPTY_COUNTS();

  // Una reversa borra el efecto del evento sin borrar el evento. Se filtra acá
  // y no al leer de la base para que el motivo siga estando disponible.
  const live = events
    .filter((event) => !event.revertedAt)
    .filter((event) => {
      const age = dayDiff(event.occurredAt, asOf);
      return age >= 0 && age <= WINDOW_DAYS;
    })
    // Cronológico: la reincidencia se cuenta en el orden en que pasó, no en el
    // que vino de la base.
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  let faults = 0;
  const contributions: ReliabilityContribution[] = live.map((event) => {
    const baseWeight = WEIGHTS[event.kind];
    const age = dayDiff(event.occurredAt, asOf);
    const recency = Math.max(0, 1 - age / WINDOW_DAYS);

    let escalation = 1;
    if (baseWeight < 0) {
      escalation = Math.min(1 + faults * ESCALATION_STEP, MAX_ESCALATION);
      faults += 1;
    }

    counts[event.kind] += 1;
    return {
      event,
      baseWeight,
      recency,
      escalation,
      effect: baseWeight * recency * escalation,
      fadesOn: addDaysIso(event.occurredAt, WINDOW_DAYS),
    };
  });

  // Deuda acumulada, recorrida en orden cronológico.
  //
  // No alcanza con sumar todo y recortar a 100: los cumplimientos previos
  // crearían margen por encima del techo y absorberían la falta siguiente sin
  // que se vea. Una persona con muchos trabajos hechos podría faltar gratis, y
  // el índice dejaría de significar lo que dice.
  //
  // Con deuda, una falta SIEMPRE baja el nivel en el momento en que ocurre, y
  // sólo el cumplimiento POSTERIOR la recupera — que es textualmente lo que
  // pide el requisito: "la realización satisfactoria de nuevos trabajos...
  // deberán contribuir a recuperar el nivel perdido".
  let debt = 0;
  for (const contribution of contributions) {
    debt = Math.max(0, debt - contribution.effect);
  }
  const score = Math.round(Math.max(0, 100 - debt));

  return {
    formulaVersion: FORMULA_VERSION,
    windowDays: WINDOW_DAYS,
    sampleSize: live.length,
    score: live.length >= MIN_SAMPLE ? score : null,
    hasEnoughHistory: live.length >= MIN_SAMPLE,
    counts,
    contributions,
    penalties: contributions
      .filter((c) => c.effect < 0)
      .sort((a, b) => a.effect - b.effect),
  };
}

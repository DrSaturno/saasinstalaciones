import {
  addBusinessDays,
  businessDaysUntil,
  type BusinessCalendar,
} from "@/lib/domain/business-days";

/**
 * Estado de una reprogramación, **derivado**: no hay ninguna columna "vencido"
 * en la base y no la va a haber.
 *
 * El requisito dice que el instalador no puede ser penalizado por exceder un
 * plazo que no le fue comunicado. Si el vencimiento lo escribiera un job, un
 * job que no corre (o que corre dos veces, o tarde) cambiaría el resultado. Al
 * calcularlo acá desde `notified_at`, el estado es el mismo lo hayan mirado
 * cuando lo hayan mirado, y se puede probar sin reloj ni scheduler.
 */

export type RescheduleResponse = "accepted" | "declined";

export type RescheduleSource = {
  notifiedAt: string | null;
  response: RescheduleResponse | null;
  respondedAt: string | null;
  supersededAt: string | null;
  responseWindowDays: number;
};

export type RescheduleState =
  /** Se movió la fecha pero todavía no se avisó: el plazo ni empezó. */
  | { kind: "not_notified" }
  /** Volvieron a mover la fecha antes de que contestara: la pregunta caducó. */
  | { kind: "superseded" }
  | { kind: "answered"; response: RescheduleResponse; onTime: boolean }
  | { kind: "awaiting"; deadline: string; businessDaysLeft: number }
  /** Notificado, sin respuesta y con el plazo cumplido. */
  | { kind: "expired"; deadline: string };

/**
 * Fecha calendario de un instante en una zona horaria dada.
 *
 * Hace falta porque `notified_at` es un `timestamptz` y el plazo se cuenta en
 * días. Usar `toISOString().slice(0, 10)` daría el día UTC: una notificación
 * de las 22:00 en Buenos Aires caería al día siguiente y le regalaría o le
 * robaría un día hábil al instalador según el caso.
 */
export function dateKeyInTimeZone(instant: string, timeZone: string): string {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) throw new Error("invalid_instant");
  // `en-CA` formatea como YYYY-MM-DD, que es exactamente la clave que usa
  // business-days.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Fecha límite para contestar, o null si todavía no se notificó. */
export function responseDeadline(
  source: Pick<RescheduleSource, "notifiedAt" | "responseWindowDays">,
  timeZone: string,
  calendar: BusinessCalendar = {},
): string | null {
  if (!source.notifiedAt) return null;
  return addBusinessDays(
    dateKeyInTimeZone(source.notifiedAt, timeZone),
    source.responseWindowDays,
    calendar,
  );
}

export function rescheduleState(
  source: RescheduleSource,
  todayKey: string,
  timeZone: string,
  calendar: BusinessCalendar = {},
): RescheduleState {
  // El orden importa. Una reprogramación superada por otra posterior no vence
  // ni penaliza: la pregunta que quedó sin contestar ya no es la vigente.
  if (source.supersededAt) return { kind: "superseded" };
  if (!source.notifiedAt) return { kind: "not_notified" };

  const deadline = responseDeadline(source, timeZone, calendar);
  if (!deadline) return { kind: "not_notified" };

  if (source.response && source.respondedAt) {
    return {
      kind: "answered",
      response: source.response,
      onTime:
        dateKeyInTimeZone(source.respondedAt, timeZone) <= deadline,
    };
  }

  const left = businessDaysUntil(todayKey, deadline, calendar);
  // El día del vencimiento todavía cuenta: se vence cuando ya pasó.
  if (todayKey > deadline) return { kind: "expired", deadline };
  return { kind: "awaiting", deadline, businessDaysLeft: Math.max(left, 0) };
}

/**
 * Si este estado debe restar confiabilidad.
 *
 * Es la traducción literal del principio funcional del requisito: aceptar en
 * plazo no penaliza, darse de baja en plazo tampoco, y **sólo** el silencio
 * posterior a una notificación correctamente hecha puede afectar el nivel.
 */
export function rescheduleHarmsReliability(state: RescheduleState): boolean {
  return state.kind === "expired";
}

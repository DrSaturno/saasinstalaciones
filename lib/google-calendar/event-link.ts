/**
 * Link que abre Google Calendar con una orden ya cargada, listo para guardar.
 *
 * No usa OAuth ni la API: es una URL. Por eso le sirve al instalador, que no
 * tiene —ni va a tener— la cuenta de la empresa conectada, y funciona en el
 * celular sin pasar por la cola offline: es navegación, no una mutación que
 * haya que encolar y reconciliar. Ver DEC-GCAL-03.
 *
 * Lo que se pierde a cambio: el evento es una copia. Si después reprograman la
 * orden, el calendario de quien lo guardó queda con la fecha vieja.
 */

/** Abre un calendario concreto en Google Calendar. */
export function googleCalendarUrl(calendarId: string) {
  return `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(calendarId)}`;
}

/** `YYYY-MM-DD` → `YYYYMMDD`. */
function compact(date: string) {
  return date.replaceAll("-", "");
}

/**
 * El día siguiente, porque en un evento de día completo Google trata el fin
 * como **exclusivo**: un trabajo de un solo día que termina "ese día" se
 * dibuja de dos días.
 *
 * El mediodía UTC evita que un corrimiento de zona horaria mueva la fecha un
 * día para atrás al redondear.
 */
export function exclusiveEndDate(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

export type CalendarEventInput = {
  orderNumber: string;
  title: string;
  /** `YYYY-MM-DD`. Sin fecha no hay nada que agendar y no se llama a esto. */
  scheduledDate: string;
  scheduledEndDate?: string | null;
  description?: string | null;
  location?: string | null;
  /** Link a la orden dentro de Se Instala. */
  orderUrl?: string | null;
};

export function googleCalendarEventUrl({
  orderNumber,
  title,
  scheduledDate,
  scheduledEndDate,
  description,
  location,
  orderUrl,
}: CalendarEventInput): string {
  const end = exclusiveEndDate(scheduledEndDate || scheduledDate);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `[${orderNumber}] ${title}`,
    dates: `${compact(scheduledDate)}/${compact(end)}`,
  });
  const details = [description, orderUrl].filter(Boolean).join("\n\n");
  if (details) params.set("details", details);
  if (location) params.set("location", location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

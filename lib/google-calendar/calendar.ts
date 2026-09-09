import "server-only";

import type { OAuth2Client } from "google-auth-library";
import { EXTERNAL_TIMEOUT_MS } from "@/lib/http/timeout";

const API = "https://www.googleapis.com/calendar/v3";

/** Cómo se llama el calendario que la app crea en la cuenta de quien conecta. */
export function companyCalendarName(companyName: string) {
  return `Se Instala — ${companyName}`;
}

async function calendarExists(client: OAuth2Client, calendarId: string) {
  try {
    await client.request({
      url: `${API}/calendars/${encodeURIComponent(calendarId)}`,
      method: "GET",
      timeout: EXTERNAL_TIMEOUT_MS,
    });
    return true;
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status;
    // 404 (no existe) y 410 (borrado) son respuestas, no fallas: hay que crear
    // uno nuevo. Cualquier otro error —red, permisos, cuota— sí es una falla y
    // no puede terminar en "creo otro calendario", que duplicaría.
    if (status === 404 || status === 410) return false;
    throw error;
  }
}

/**
 * El calendario de la empresa dentro de la cuenta de Google que conectó.
 *
 * Reutiliza el que ya se creó y sólo crea uno nuevo si no queda ninguno. La
 * identificación es por `calendar_id` guardado, **no por nombre**: el nombre
 * lo puede cambiar la persona desde Google y buscar por ahí terminaría
 * creando un calendario nuevo cada vez que alguien lo renombra.
 *
 * Escribir en el calendario primario —lo que hacía antes— mezclaba las
 * órdenes con la vida privada de quien conectaba, y hacía imposible compartir
 * el calendario sin exponer todo lo demás.
 */
export async function ensureCompanyCalendar(
  client: OAuth2Client,
  companyName: string,
  currentCalendarId: string | null,
): Promise<string> {
  if (currentCalendarId && currentCalendarId !== "primary") {
    if (await calendarExists(client, currentCalendarId)) return currentCalendarId;
  }

  const response = await client.request<{ id: string }>({
    url: `${API}/calendars`,
    method: "POST",
    data: { summary: companyCalendarName(companyName) },
    timeout: EXTERNAL_TIMEOUT_MS,
  });
  return response.data.id;
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { logEvent } from "@/lib/observability";
import { clientIp, enforceRateLimit } from "@/lib/security/rate-limit";

/**
 * Recolector de errores de cliente (OPS-09 de la auditoría de producción).
 *
 * Antes, un crash en el navegador no dejaba rastro en ningún lado: los boundary
 * de error recibían `error` con su `digest` y lo descartaban, y encima
 * `useAutoReloadOnError` recargaba la página, borrando la evidencia. En la
 * práctica, cada crash de producción era invisible e irreproducible.
 *
 * ## Qué se registra, y qué NO
 *
 * Se registra el **`digest`**, que es la pieza que sirve: Next lo genera del
 * lado servidor, ya escribió ahí el error completo con su stack, y este valor
 * es lo que permite encontrarlo. Con el digest y la ruta se llega al error real.
 *
 * NO se registra el mensaje del error. Un mensaje de cliente puede arrastrar
 * datos de quien lo produjo (contenido de un formulario, un nombre, un fragmento
 * de URL firmada), y este endpoint es público. El digest da la misma capacidad
 * de diagnóstico sin ese riesgo.
 *
 * ## Por qué es público
 *
 * Tiene que serlo: el caso que más importa es justamente el que rompe antes de
 * que haya sesión, o cuando el layout raíz falla. Se compensa con un límite por
 * IP y un esquema estricto que descarta cualquier cosa que no encaje.
 */

const reportSchema = z.object({
  digest: z.string().trim().max(120).optional(),
  name: z.string().trim().max(80).optional(),
  path: z.string().trim().max(300).optional(),
  boundary: z.enum(["route", "global"]),
});

export async function POST(request: Request) {
  // 30 informes cada 5 minutos por IP: alcanza para una sesión con problemas
  // reales y ahoga a quien quiera usar esto como amplificador de logs.
  const gate = await enforceRateLimit("client_errors", await clientIp(), 30, 300);
  if (!gate.allowed) {
    return new NextResponse(null, { status: 429 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const parsed = reportSchema.safeParse(payload);
  if (!parsed.success) {
    return new NextResponse(null, { status: 400 });
  }

  logEvent("error", "client.crash", {
    digest: parsed.data.digest ?? "none",
    error_name: parsed.data.name ?? "unknown",
    path: parsed.data.path ?? "unknown",
    boundary: parsed.data.boundary,
  });

  // 204: al cliente no le sirve ninguna respuesta y ya está en un camino de
  // error; no tiene sentido darle nada más que hacer.
  return new NextResponse(null, { status: 204 });
}

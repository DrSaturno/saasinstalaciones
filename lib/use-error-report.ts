"use client";

import { useEffect, useRef } from "react";

/**
 * Envía un crash de cliente al recolector del servidor (OPS-09).
 *
 * Se usa en los boundary de error, que hasta ahora recibían el `error` y lo
 * descartaban. Manda sólo `digest`, `name` y ruta — nunca el mensaje, que puede
 * arrastrar datos de la persona (ver `app/api/client-errors/route.ts`).
 *
 * Dos detalles que importan:
 *
 * - **Se envía una sola vez por error.** El boundary puede re-renderizar, y
 *   `useAutoReloadOnError` además recarga la página; sin el guard, un mismo
 *   crash generaba varios informes.
 * - **Usa `keepalive`.** El envío compite con la recarga automática: sin esto,
 *   el navegador cancela el `fetch` al empezar a navegar y el informe se pierde
 *   justo en el caso que más interesa registrar.
 *
 * Nunca lanza: un fallo al reportar no puede empeorar una pantalla que ya está
 * en estado de error.
 */
export function useErrorReport(
  error: (Error & { digest?: string }) | undefined,
  boundary: "route" | "global",
) {
  const reported = useRef(false);

  useEffect(() => {
    if (!error || reported.current) return;
    reported.current = true;

    try {
      void fetch("/api/client-errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          digest: error.digest,
          name: error.name,
          path: typeof window === "undefined" ? undefined : window.location.pathname,
          boundary,
        }),
        keepalive: true,
      }).catch(() => {
        // Sin red, o el endpoint caído. No hay nada que hacer acá.
      });
    } catch {
      // `fetch` puede no existir en algún entorno degradado.
    }
  }, [error, boundary]);
}

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
/** Clases de fallo reconocibles sin mirar el texto del error. */
export type ClientErrorKind = "chunk_load" | "network" | "other";

/**
 * Clasifica el crash en un conjunto CERRADO de valores.
 *
 * Existe porque el digest no alcanza para los errores que nacen en el
 * navegador: ahí Next no genera ninguno y el informe llega como
 * "TypeError / digest none", que no distingue un chunk que no bajó de un bug
 * de render. La diferencia importa —el primero se arregla en el service
 * worker, el segundo en el componente— y hasta ahora había que adivinarla.
 *
 * Se manda la ETIQUETA, nunca el mensaje: al ser un enum fijo, no hay forma
 * de que arrastre datos de quien lo produjo, que es la razón por la que el
 * mensaje sigue sin viajar (ver `app/api/client-errors/route.ts`).
 */
export function classifyClientError(error: Error): ClientErrorKind {
  const text = `${error.name}: ${error.message}`.toLowerCase();
  if (
    error.name === "ChunkLoadError" ||
    text.includes("dynamically imported module") ||
    text.includes("importing a module script failed") ||
    text.includes("loading chunk")
  ) {
    return "chunk_load";
  }
  if (
    text.includes("failed to fetch") ||
    text.includes("networkerror") ||
    text.includes("load failed") ||
    text.includes("network request failed")
  ) {
    return "network";
  }
  return "other";
}

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
          kind: classifyClientError(error),
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

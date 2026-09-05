import "server-only";

import { logEvent } from "@/lib/observability";

/**
 * Evita convertir silenciosamente un fallo de lectura en una lista vacía.
 * El detalle queda en observabilidad; la UI recibe un error estable y seguro
 * que activa el error boundary de la ruta.
 */
export function throwIfDataError(scope: string, error: unknown): void {
  if (!error) return;

  logEvent("error", "data.fetch_failed", { scope, error });
  throw new Error("data_fetch_failed", { cause: scope });
}

import "server-only";

import { EXTERNAL_TIMEOUT_MS } from "@/lib/http/timeout";
import {
  geocodeQueryFor,
  parseGeocodeResponse,
  type Coordinates,
  type GeocodeFailure,
  type GeocodeOutcome,
  type GeocodeQuery,
} from "@/lib/domain/geocoding";
import { logEvent } from "@/lib/observability";

/**
 * Geocodificación con la Geocoding API de Google, siempre desde el servidor.
 *
 * Usa su PROPIA clave (`GOOGLE_GEOCODING_API_KEY`): la del mapa del navegador
 * (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`) está restringida por dominio y Google
 * rechazaría una llamada hecha desde el servidor. Ver
 * docs/specs/2026-09-24-sin-latitud-longitud.
 *
 * Reglas que este módulo no negocia:
 * - Una falla NUNCA hace fallar a quien llama: devuelve «no ubicado». Guardar
 *   el local es lo importante; ubicarlo es una mejora.
 * - Sin clave, todo sigue andando con las coordenadas en blanco.
 * - Ni la dirección ni la URL (que lleva la clave) se escriben en los logs:
 *   sólo el motivo.
 */

const ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";

/** Cuántas consultas simultáneas. Google admite decenas por segundo; esto es prudente. */
const DEFAULT_CONCURRENCY = 5;
/** Tiempo total para una tanda: por encima de esto, lo que falte queda sin ubicar. */
const DEFAULT_BUDGET_MS = 20_000;

function apiKey(): string {
  return process.env.GOOGLE_GEOCODING_API_KEY?.trim() ?? "";
}

export function geocodingConfigured(): boolean {
  return apiKey() !== "";
}

/** Una consulta. Nunca lanza: devuelve el motivo de la falla. */
export async function geocode(query: GeocodeQuery): Promise<GeocodeOutcome> {
  const key = apiKey();
  if (!key) return { ok: false, reason: "no_key" };

  const url = new URL(ENDPOINT);
  url.searchParams.set("address", query.address);
  url.searchParams.set("components", `country:${query.country}`);
  url.searchParams.set("language", "es");
  url.searchParams.set("key", key);

  let outcome: GeocodeOutcome;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS) });
    if (!response.ok) {
      outcome = { ok: false, reason: "http_error" };
    } else {
      outcome = parseGeocodeResponse(await response.json());
    }
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    outcome = { ok: false, reason: timedOut ? "timeout" : "network" };
  }

  // «Sin resultados» es un dato normal (una dirección mal escrita), no una
  // alarma; lo demás sí conviene verlo en los logs.
  if (!outcome.ok && outcome.reason !== "zero_results" && outcome.reason !== "vague_result") {
    logEvent("warn", "geocode.failed", { reason: outcome.reason });
  }
  return outcome;
}

/**
 * Ubica una dirección suelta, o `null`. Es lo que usan las acciones de un solo
 * registro (alta de local, cobertura de instalador, convocatoria).
 */
export async function locateAddress(
  parts: { address?: string | null; city?: string | null; state?: string | null; country?: string | null },
  options: { allowCityOnly?: boolean } = {},
): Promise<Coordinates | null> {
  const query = geocodeQueryFor(parts, options);
  if (!query) return null;
  const outcome = await geocode(query);
  return outcome.ok ? outcome.coordinates : null;
}

export type BatchItem = { id: string; query: GeocodeQuery };

export type BatchResult = {
  located: Map<string, Coordinates>;
  /** Las que Google no pudo ubicar (sin resultados, vagas, con error). */
  failed: string[];
  /** Las que no se intentaron por el tope o el presupuesto de tiempo. */
  skipped: string[];
};

/**
 * Ubica muchas direcciones con concurrencia y tiempo acotados. Lo que no entre
 * en `max` o en `budgetMs` no se intenta y se informa como `skipped`, para que
 * una importación de miles de filas no cuelgue la solicitud.
 */
export async function geocodeBatch(
  items: BatchItem[],
  options: { max?: number; concurrency?: number; budgetMs?: number } = {},
): Promise<BatchResult> {
  const max = options.max ?? items.length;
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const deadline = Date.now() + (options.budgetMs ?? DEFAULT_BUDGET_MS);

  const located = new Map<string, Coordinates>();
  const failed: string[] = [];
  const skipped: string[] = items.slice(max).map((item) => item.id);
  const queue = items.slice(0, max);

  // Sin clave no se intenta nada: todo queda «sin ubicar», sin pedir a Google.
  if (!geocodingConfigured()) {
    return { located, failed, skipped: [...queue.map((item) => item.id), ...skipped] };
  }

  let next = 0;
  const worker = async () => {
    while (true) {
      const index = next++;
      const item = queue[index];
      if (!item) return;
      if (Date.now() >= deadline) {
        skipped.push(item.id);
        continue;
      }
      const outcome = await geocode(item.query);
      if (outcome.ok) located.set(item.id, outcome.coordinates);
      else failed.push(item.id);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return { located, failed, skipped };
}

export type { GeocodeFailure };

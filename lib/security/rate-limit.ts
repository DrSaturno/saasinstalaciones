import "server-only";
import { headers } from "next/headers";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { logEvent } from "@/lib/observability";

/**
 * Rate limiting distribuido (SEC-08 de la auditoría de seguridad).
 *
 * En Vercel serverless cada request puede caer en otra instancia, así que un
 * contador en memoria no sirve: el estado tiene que estar afuera. Se usa Redis
 * de Upstash (REST, sin conexión persistente, pensado para serverless).
 *
 * **Degrada a no-op si faltan las credenciales.** Sin URL+token de Redis —dev
 * local, CI, o antes de aprovisionar el servicio— `enforceRateLimit` deja pasar
 * todo y avisa una vez. Así el código se puede mergear y desplegar sin romper
 * nada, y el límite se activa solo cuando esas variables existen en producción.
 *
 * Acepta dos convenciones de nombres: `UPSTASH_REDIS_REST_URL`/`_TOKEN` (Upstash
 * directo, dev local) y `KV_REST_API_URL`/`KV_REST_API_TOKEN` (los que inyecta
 * la integración de Upstash en Vercel). Se prefiere la primera si están las dos.
 */

let redis: Redis | null = null;
let warned = false;

function client(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    if (!warned) {
      // Una sola vez por proceso: en dev/CI es lo esperado, no un error.
      logEvent("warn", "rate_limit.disabled", { reason: "missing_upstash_env" });
      warned = true;
    }
    return null;
  }
  if (!redis) redis = new Redis({ url, token });
  return redis;
}

/** Los limitadores se cachean por config: crearlos por request desperdicia la ventana deslizante. */
const limiters = new Map<string, Ratelimit>();

function limiter(bucket: string, limit: number, windowSeconds: number): Ratelimit | null {
  const redisClient = client();
  if (!redisClient) return null;
  const key = `${bucket}:${limit}:${windowSeconds}`;
  let instance = limiters.get(key);
  if (!instance) {
    instance = new Ratelimit({
      redis: redisClient,
      // Ventana deslizante: más justa que la fija en los bordes, y Upstash la
      // resuelve en un solo round-trip.
      limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
      prefix: `rl:${bucket}`,
      analytics: false,
    });
    limiters.set(key, instance);
  }
  return instance;
}

/**
 * La IP del cliente, para limitar flujos anónimos (login, reset).
 *
 * Vercel escribe la IP real en `x-forwarded-for` (el primer valor); el resto
 * de la cadena son proxies. Si no está, cae a un marcador fijo — que agrupa a
 * todos bajo un mismo cubo, conservador pero nunca menos estricto.
 */
export async function clientIp(): Promise<string> {
  try {
    const store = await headers();
    const forwarded = store.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]!.trim();
    return store.get("x-real-ip")?.trim() || "unknown";
  } catch {
    // `headers()` lanza fuera de un scope de request (tests unitarios, o
    // ciertos contextos de render). Sin IP se agrupa bajo un cubo único, que
    // es conservador; el límite igual degrada a no-op si no hay Upstash.
    return "unknown";
  }
}

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

/**
 * Aplica un límite sobre `identifier` en el cubo dado.
 *
 * Devuelve `allowed: true` cuando no hay límite configurado (no-op) o cuando
 * queda cupo. `retryAfterSeconds` es cuánto falta para el próximo intento.
 *
 * Falla ABIERTO ante un error de Redis: un problema de infraestructura del
 * limitador no puede dejar a la gente afuera de su propia cuenta. Se registra.
 */
export async function enforceRateLimit(
  bucket: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const instance = limiter(bucket, limit, windowSeconds);
  if (!instance) return { allowed: true, retryAfterSeconds: 0 };

  try {
    const { success, reset } = await instance.limit(identifier);
    return {
      allowed: success,
      retryAfterSeconds: success ? 0 : Math.max(0, Math.ceil((reset - Date.now()) / 1000)),
    };
  } catch (error) {
    logEvent("error", "rate_limit.backend_error", {
      bucket,
      message: error instanceof Error ? error.message : String(error),
    });
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

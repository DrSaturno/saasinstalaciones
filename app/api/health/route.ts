import { NextResponse } from "next/server";
import { logEvent } from "@/lib/observability";

/**
 * Sonda de salud (OPS-10 de la auditoría de producción).
 *
 * Existe para que un monitor externo pueda preguntar "¿esto anda?" y obtener
 * una respuesta que signifique algo. Un 200 vacío no sirve: la app puede
 * responder perfectamente mientras Supabase está caído, que es justo el modo de
 * falla que más duele (y el que hoy se manifiesta como un deslogueo masivo).
 *
 * Por eso comprueba las dependencias de verdad:
 *  - Supabase: alcanza la raíz de PostgREST. No consulta ninguna tabla, así que
 *    no depende del esquema ni de la RLS — sólo de que el servicio conteste.
 *  - Redis: sólo si está configurado. Que falte no es una falla: el limitador
 *    degrada a no-op a propósito.
 *
 * Códigos: 200 si se puede operar (aunque Redis esté caído), 503 si Supabase no
 * responde — ahí la aplicación no puede hacer nada útil.
 *
 * No expone versiones, URLs ni mensajes de error del proveedor: un endpoint sin
 * autenticar no es lugar para detalles internos.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TIMEOUT_MS = 3_000;

type CheckResult = {
  status: "ok" | "down" | "not_configured";
  duration_ms: number;
};

async function timed(operation: () => Promise<boolean>): Promise<CheckResult> {
  const startedAt = Date.now();
  try {
    const ok = await operation();
    return { status: ok ? "ok" : "down", duration_ms: Date.now() - startedAt };
  } catch {
    return { status: "down", duration_ms: Date.now() - startedAt };
  }
}

async function checkSupabase(): Promise<CheckResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { status: "not_configured", duration_ms: 0 };

  return timed(async () => {
    const response = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    return response.ok;
  });
}

async function checkRedis(): Promise<CheckResult> {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return { status: "not_configured", duration_ms: 0 };

  return timed(async () => {
    const response = await fetch(`${url}/ping`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    return response.ok;
  });
}

export async function GET() {
  const [supabase, redis] = await Promise.all([checkSupabase(), checkRedis()]);

  // Supabase es la única dependencia sin la cual no se puede operar. Redis caído
  // significa perder el freno de fuerza bruta, no perder el servicio.
  const healthy = supabase.status === "ok";
  const degraded = redis.status === "down";

  const body = {
    status: healthy ? (degraded ? "degraded" : "ok") : "down",
    checks: { supabase, redis },
    deployment: process.env.VERCEL_DEPLOYMENT_ID ?? "local",
    timestamp: new Date().toISOString(),
  };

  if (!healthy || degraded) {
    logEvent(healthy ? "warn" : "error", "health.check_failed", {
      supabase_status: supabase.status,
      redis_status: redis.status,
    });
  }

  return NextResponse.json(body, {
    status: healthy ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

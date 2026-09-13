import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/observability", () => ({ logEvent: vi.fn() }));

import { GET } from "./route";

const ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
] as const;

const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proyecto.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  vi.unstubAllGlobals();
});

describe("sonda de Supabase", () => {
  it("pega a /auth/v1/health, no a la raíz de PostgREST", async () => {
    // En este proyecto (verificado en producción el 11-09-2026) la raíz de
    // PostgREST exige `service_role` y devuelve 401 al anon key: la app
    // andaba perfecto —lecturas reales con 200— mientras esta sonda decía
    // `down`. GoTrue expone un endpoint de salud público hecho para esto.
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    await GET();

    expect(fetch).toHaveBeenCalledWith(
      "https://proyecto.supabase.co/auth/v1/health",
      expect.objectContaining({ headers: { apikey: "anon-key" } }),
    );
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/rest/v1/"),
      expect.anything(),
    );
  });

  it("reporta 'ok' cuando GoTrue contesta", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.checks.supabase.status).toBe("ok");
  });

  it("reporta 'down' con 503 cuando Supabase no contesta", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("down");
    expect(body.checks.supabase.status).toBe("down");
  });

  it("no revienta si falta la configuración de Supabase", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    const response = await GET();
    const body = await response.json();

    expect(fetch).not.toHaveBeenCalled();
    expect(body.checks.supabase.status).toBe("not_configured");
    expect(response.status).toBe(503);
  });
});

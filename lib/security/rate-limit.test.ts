import { describe, expect, it } from "vitest";
import { enforceRateLimit } from "@/lib/security/rate-limit";

// En el entorno de test no hay UPSTASH_REDIS_REST_URL/TOKEN, así que el
// limitador degrada a no-op. Esta es la propiedad de seguridad que hay que
// blindar: sin las credenciales el límite NUNCA debe bloquear, o dev y CI
// (y producción antes de aprovisionar Upstash) quedarían con la gente afuera.
describe("enforceRateLimit sin backend configurado", () => {
  it("deja pasar aunque se exceda el límite nominal", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => enforceRateLimit("test", "mismo-id", 1, 60)),
    );
    for (const r of results) {
      expect(r.allowed).toBe(true);
      expect(r.retryAfterSeconds).toBe(0);
    }
  });

  it("no lanza ante identificadores vacíos o raros", async () => {
    await expect(enforceRateLimit("test", "", 5, 60)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });
});

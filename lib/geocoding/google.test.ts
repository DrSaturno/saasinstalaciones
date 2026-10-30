import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geocode, geocodeBatch, geocodingConfigured, locateAddress } from "@/lib/geocoding/google";

const ROOFTOP = {
  status: "OK",
  results: [{ geometry: { location: { lat: -34.6, lng: -58.4 }, location_type: "ROOFTOP" } }],
};

function fetchReturning(body: unknown, init: { ok?: boolean } = {}) {
  return vi.fn(async () => ({ ok: init.ok ?? true, json: async () => body }) as Response);
}

beforeEach(() => {
  vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "clave-de-prueba");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("geocode", () => {
  it("sin clave no llama a Google y devuelve «no_key»", async () => {
    vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "");
    const fetchMock = fetchReturning(ROOFTOP);
    vi.stubGlobal("fetch", fetchMock);
    expect(geocodingConfigured()).toBe(false);
    expect(await geocode({ address: "Av. Corrientes 1234", country: "AR" })).toEqual({ ok: false, reason: "no_key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("consulta con país y clave, y devuelve las coordenadas", async () => {
    const fetchMock = fetchReturning(ROOFTOP);
    vi.stubGlobal("fetch", fetchMock);
    const out = await geocode({ address: "Av. Corrientes 1234, CABA", country: "AR" });
    expect(out).toEqual({ ok: true, coordinates: { lat: -34.6, lng: -58.4 } });
    const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("components=country%3AAR");
    expect(url).toContain("key=clave-de-prueba");
  });

  it("un error de red no lanza: es «no ubicado»", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await geocode({ address: "X 1", country: "AR" })).toEqual({ ok: false, reason: "network" });
  });

  it("un timeout no lanza y se distingue de un error de red", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("timeout", "TimeoutError"); }));
    expect(await geocode({ address: "X 1", country: "AR" })).toEqual({ ok: false, reason: "timeout" });
  });

  it("una respuesta HTTP de error no lanza", async () => {
    vi.stubGlobal("fetch", fetchReturning({}, { ok: false }));
    expect(await geocode({ address: "X 1", country: "AR" })).toEqual({ ok: false, reason: "http_error" });
  });

  it("no escribe la dirección ni la clave en los logs", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await geocode({ address: "Calle Secreta 999, Ciudad Privada", country: "AR" });
    expect(warn).toHaveBeenCalled();
    const logged = warn.mock.calls.map((call) => String(call[0])).join(" ");
    expect(logged).not.toContain("Secreta");
    expect(logged).not.toContain("clave-de-prueba");
  });
});

describe("locateAddress", () => {
  it("sin nada que ubicar ni siquiera consulta", async () => {
    const fetchMock = fetchReturning(ROOFTOP);
    vi.stubGlobal("fetch", fetchMock);
    expect(await locateAddress({ address: "", city: "Córdoba" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("devuelve las coordenadas de un local con calle", async () => {
    vi.stubGlobal("fetch", fetchReturning(ROOFTOP));
    expect(await locateAddress({ address: "Av. Corrientes 1234", city: "CABA", country: "AR" })).toEqual({
      lat: -34.6,
      lng: -58.4,
    });
  });
});

describe("geocodeBatch", () => {
  const items = ["a", "b", "c", "d"].map((id) => ({ id, query: { address: `${id} 1`, country: "AR" as const } }));

  it("ubica todas las que puede y separa las que Google no encontró", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL) =>
        ({ ok: true, json: async () => (String(url).includes("b+1") ? { status: "ZERO_RESULTS", results: [] } : ROOFTOP) }) as Response,
      ),
    );
    const out = await geocodeBatch(items, { concurrency: 2 });
    expect([...out.located.keys()].sort()).toEqual(["a", "c", "d"]);
    expect(out.failed).toEqual(["b"]);
    expect(out.skipped).toEqual([]);
  });

  it("respeta el tope: lo que excede no se intenta", async () => {
    const fetchMock = fetchReturning(ROOFTOP);
    vi.stubGlobal("fetch", fetchMock);
    const out = await geocodeBatch(items, { max: 2, concurrency: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out.skipped.sort()).toEqual(["c", "d"]);
  });

  it("sin clave no consulta nada y devuelve todo como no intentado", async () => {
    vi.stubEnv("GOOGLE_GEOCODING_API_KEY", "");
    const fetchMock = fetchReturning(ROOFTOP);
    vi.stubGlobal("fetch", fetchMock);
    const out = await geocodeBatch(items);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out.located.size).toBe(0);
    expect(out.skipped.sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("se corta por presupuesto de tiempo", async () => {
    vi.stubGlobal("fetch", fetchReturning(ROOFTOP));
    const out = await geocodeBatch(items, { budgetMs: -1 });
    expect(out.located.size).toBe(0);
    expect(out.skipped.sort()).toEqual(["a", "b", "c", "d"]);
  });
});

import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

type Listener = (event: Record<string, unknown>) => void;

type RuntimeOptions = {
  cacheKeys?: string[];
  /** Contenido inicial de la caché, por clave exacta. */
  cached?: Record<string, unknown>;
  networkFails?: boolean;
};

type FakeRequest = {
  method: string;
  mode?: string;
  url: string;
  headers?: { get: (name: string) => string | null };
};

/** Pide un payload RSC de la misma pantalla, como lo hace el router al navegar. */
function rscRequest(url: string): FakeRequest {
  return {
    method: "GET",
    url,
    headers: { get: (name: string) => (name === "RSC" ? "1" : null) },
  };
}

function documentRequest(url: string): FakeRequest {
  return { method: "GET", mode: "navigate", url, headers: { get: () => null } };
}

function serviceWorkerRuntime(options: RuntimeOptions = {}) {
  const listeners = new Map<string, Listener>();
  const source = readFileSync(new URL("./sw.js", import.meta.url), "utf8");
  const entries = new Map<string, unknown>(Object.entries(options.cached ?? {}));
  const cache = {
    match: vi.fn(async (key: string | FakeRequest) =>
      entries.get(typeof key === "string" ? key : key.url),
    ),
    put: vi.fn(async (key: string | FakeRequest, value: unknown) => {
      entries.set(typeof key === "string" ? key : key.url, value);
    }),
  };
  const response = { ok: true, clone: vi.fn() };
  response.clone.mockReturnValue(response);
  const networkError = new Error("network_unavailable");
  const fetchMock = vi.fn(async () => {
    if (options.networkFails) throw networkError;
    return response;
  });
  const cacheDelete = vi.fn(async () => true);

  runInNewContext(source, {
    URL,
    fetch: fetchMock,
    caches: {
      keys: vi.fn(async () => options.cacheKeys ?? []),
      delete: cacheDelete,
      open: vi.fn(async () => cache),
    },
    self: {
      location: { origin: "https://app.test" },
      clients: { claim: vi.fn() },
      skipWaiting: vi.fn(),
      addEventListener: (name: string, listener: Listener) => {
        listeners.set(name, listener);
      },
    },
  });

  return { listeners, cache, cacheDelete, fetchMock, entries, response, networkError };
}

describe("service worker cache policy", () => {
  it("cachea las pantallas de campo para reabrirlas sin conexión", async () => {
    const { listeners, cache } = serviceWorkerRuntime();
    const respondWith = vi.fn();

    listeners.get("fetch")?.({
      request: documentRequest("https://app.test/tasks/123"),
      respondWith,
    });

    expect(respondWith).toHaveBeenCalledOnce();
    await respondWith.mock.calls[0]?.[0];
    expect(cache.put).toHaveBeenCalledWith(
      "https://app.test/tasks/123?__sw=doc",
      expect.anything(),
    );
  });

  it("no cachea pantallas autenticadas ajenas al trabajo de campo", () => {
    const { listeners } = serviceWorkerRuntime();
    const respondWith = vi.fn();

    listeners.get("fetch")?.({
      request: documentRequest("https://app.test/dashboard"),
      respondWith,
    });

    expect(respondWith).not.toHaveBeenCalled();
  });

  it("reabre la pantalla exacta cacheada cuando la red falla", async () => {
    const cachedResponse = { source: "field-cache" };
    const { listeners } = serviceWorkerRuntime({
      cached: { "https://app.test/tasks/123?__sw=doc": cachedResponse },
      networkFails: true,
    });
    const respondWith = vi.fn();

    listeners.get("fetch")?.({
      request: documentRequest("https://app.test/tasks/123"),
      respondWith,
    });

    await expect(respondWith.mock.calls[0]?.[0]).resolves.toBe(cachedResponse);
  });

  it("ignora el query efímero de RSC al reabrir la misma pantalla", async () => {
    const cachedPayload = { source: "rsc-cache" };
    const { listeners } = serviceWorkerRuntime({
      cached: { "https://app.test/tasks/123?__sw=rsc": cachedPayload },
      networkFails: true,
    });
    const respondWith = vi.fn();

    // `_rsc` cambia en cada navegación: si formara parte de la clave, lo
    // guardado en la visita anterior no volvería a encontrarse nunca.
    listeners.get("fetch")?.({
      request: rscRequest("https://app.test/tasks/123?_rsc=otro-valor"),
      respondWith,
    });

    await expect(respondWith.mock.calls[0]?.[0]).resolves.toBe(cachedPayload);
  });

  it("nunca sirve el documento HTML en lugar del payload RSC", async () => {
    // El router pide un stream; recibir el HTML de la misma pantalla lo mata
    // con un TypeError que después se arregla solo al recargar.
    const { listeners, networkError } = serviceWorkerRuntime({
      cached: { "https://app.test/tasks/123?__sw=doc": { source: "html" } },
      networkFails: true,
    });
    const respondWith = vi.fn();

    listeners.get("fetch")?.({
      request: rscRequest("https://app.test/tasks/123?_rsc=abc"),
      respondWith,
    });

    await expect(respondWith.mock.calls[0]?.[0]).rejects.toBe(networkError);
  });

  it("no convierte un tropezón de red en una respuesta vacía", async () => {
    // Un chunk que todavía no se abrió en la sesión no tiene copia local. Si
    // este camino resuelve en algo que no es una Response, `respondWith` falla
    // y el módulo entero se cae en vez de reintentar.
    const { listeners, networkError } = serviceWorkerRuntime({ networkFails: true });
    const respondWith = vi.fn();

    listeners.get("fetch")?.({
      request: {
        method: "GET",
        url: "https://app.test/_next/static/chunks/messages.js",
        headers: { get: () => null },
      },
      respondWith,
    });

    await expect(respondWith.mock.calls[0]?.[0]).rejects.toBe(networkError);
  });

  it("sirve el estático cacheado y revalida por detrás", async () => {
    const cachedChunk = { source: "static-cache" };
    const { listeners, fetchMock } = serviceWorkerRuntime({
      cached: { "https://app.test/_next/static/chunks/app.js": cachedChunk },
    });
    const respondWith = vi.fn();

    listeners.get("fetch")?.({
      request: {
        method: "GET",
        url: "https://app.test/_next/static/chunks/app.js",
        headers: { get: () => null },
      },
      respondWith,
    });

    await expect(respondWith.mock.calls[0]?.[0]).resolves.toBe(cachedChunk);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("elimina todas las cachés al cerrar sesión o cambiar de cuenta", async () => {
    const { listeners, cacheDelete } = serviceWorkerRuntime({
      cacheKeys: ["static-v7", "field-v7"],
    });
    const waitUntil = vi.fn();

    listeners.get("message")?.({ data: "clear-cache", waitUntil });

    expect(waitUntil).toHaveBeenCalledOnce();
    await waitUntil.mock.calls[0]?.[0];
    expect(cacheDelete).toHaveBeenCalledTimes(2);
    expect(cacheDelete).toHaveBeenCalledWith("static-v7");
    expect(cacheDelete).toHaveBeenCalledWith("field-v7");
  });
});

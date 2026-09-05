import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

type Listener = (event: Record<string, unknown>) => void;

type RuntimeOptions = {
  cacheKeys?: string[];
  cachedResponses?: unknown[];
  networkFails?: boolean;
};

function serviceWorkerRuntime(options: RuntimeOptions = {}) {
  const listeners = new Map<string, Listener>();
  const source = readFileSync(new URL("./sw.js", import.meta.url), "utf8");
  const cachedResponses = [...(options.cachedResponses ?? [])];
  const cache = {
    match: vi.fn(async () => cachedResponses.shift()),
    put: vi.fn(async () => undefined),
  };
  const response = { ok: true, clone: vi.fn() };
  response.clone.mockReturnValue(response);
  const fetchMock = vi.fn(async () => {
    if (options.networkFails) throw new Error("network_unavailable");
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

  return { listeners, cache, cacheDelete, fetchMock };
}

describe("service worker cache policy", () => {
  it("cachea las pantallas de campo para reabrirlas sin conexión", async () => {
    const { listeners, cache } = serviceWorkerRuntime();
    const respondWith = vi.fn();
    const request = {
      method: "GET",
      mode: "navigate",
      url: "https://app.test/tasks/123",
    };

    listeners.get("fetch")?.({
      request,
      respondWith,
    });

    expect(respondWith).toHaveBeenCalledOnce();
    await respondWith.mock.calls[0]?.[0];
    expect(cache.put).toHaveBeenCalledWith(request, expect.anything());
  });

  it("no cachea pantallas autenticadas ajenas al trabajo de campo", () => {
    const { listeners } = serviceWorkerRuntime();
    const respondWith = vi.fn();

    listeners.get("fetch")?.({
      request: {
        method: "GET",
        mode: "navigate",
        url: "https://app.test/dashboard",
      },
      respondWith,
    });

    expect(respondWith).not.toHaveBeenCalled();
  });

  it("reabre la pantalla exacta cacheada cuando la red falla", async () => {
    const cachedResponse = { source: "field-cache" };
    const { listeners, cache } = serviceWorkerRuntime({
      cachedResponses: [cachedResponse],
      networkFails: true,
    });
    const respondWith = vi.fn();
    const request = {
      method: "GET",
      mode: "navigate",
      url: "https://app.test/tasks/123",
    };

    listeners.get("fetch")?.({ request, respondWith });

    await expect(respondWith.mock.calls[0]?.[0]).resolves.toBe(cachedResponse);
    expect(cache.match).toHaveBeenCalledWith(request);
  });

  it("ignora el query efímero de RSC al buscar el último fallback", async () => {
    const cachedResponse = { source: "path-cache" };
    const { listeners, cache } = serviceWorkerRuntime({
      cachedResponses: [undefined, cachedResponse],
      networkFails: true,
    });
    const respondWith = vi.fn();
    const request = {
      method: "GET",
      mode: "navigate",
      url: "https://app.test/tasks/123?_rsc=temporary",
    };

    listeners.get("fetch")?.({ request, respondWith });

    await expect(respondWith.mock.calls[0]?.[0]).resolves.toBe(cachedResponse);
    expect(cache.match).toHaveBeenNthCalledWith(2, request, { ignoreSearch: true });
  });

  it("elimina todas las cachés al cerrar sesión o cambiar de cuenta", async () => {
    const { listeners, cacheDelete } = serviceWorkerRuntime({
      cacheKeys: ["static-v6", "field-v6"],
    });
    const waitUntil = vi.fn();

    listeners.get("message")?.({ data: "clear-cache", waitUntil });

    expect(waitUntil).toHaveBeenCalledOnce();
    await waitUntil.mock.calls[0]?.[0];
    expect(cacheDelete).toHaveBeenCalledTimes(2);
    expect(cacheDelete).toHaveBeenCalledWith("static-v6");
    expect(cacheDelete).toHaveBeenCalledWith("field-v6");
  });
});

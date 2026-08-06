import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

type Listener = (event: Record<string, unknown>) => void;

function serviceWorkerListeners() {
  const listeners = new Map<string, Listener>();
  const source = readFileSync(new URL("./sw.js", import.meta.url), "utf8");

  runInNewContext(source, {
    URL,
    fetch: vi.fn(),
    caches: {
      keys: vi.fn(async () => []),
      delete: vi.fn(async () => true),
      open: vi.fn(),
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

  return listeners;
}

describe("service worker cache policy", () => {
  it("no intercepta ni cachea navegaciones autenticadas", () => {
    const listeners = serviceWorkerListeners();
    const respondWith = vi.fn();

    listeners.get("fetch")?.({
      request: {
        method: "GET",
        mode: "navigate",
        url: "https://app.test/tasks/123",
      },
      respondWith,
    });

    expect(respondWith).not.toHaveBeenCalled();
  });
});

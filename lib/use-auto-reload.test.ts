import { describe, expect, it } from "vitest";

import { RETRY_WINDOW_MS, shouldAutoReload } from "@/lib/use-auto-reload";

function fakeStorage(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set("instalapro:last-auto-reload", initial);

  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

function brokenStorage() {
  return {
    getItem: () => {
      throw new Error("storage bloqueado");
    },
    setItem: () => {
      throw new Error("storage bloqueado");
    },
  };
}

describe("shouldAutoReload", () => {
  it("recarga la primera vez que se activa el boundary", () => {
    expect(shouldAutoReload(fakeStorage(), 1_000_000)).toBe(true);
  });

  it("no recarga si el error se repite dentro de la ventana", () => {
    const storage = fakeStorage();
    const start = 1_000_000;

    expect(shouldAutoReload(storage, start)).toBe(true);
    expect(shouldAutoReload(storage, start + RETRY_WINDOW_MS - 1)).toBe(false);
  });

  it("vuelve a recargar si el error reaparece pasada la ventana", () => {
    const storage = fakeStorage();
    const start = 1_000_000;

    expect(shouldAutoReload(storage, start)).toBe(true);
    expect(shouldAutoReload(storage, start + RETRY_WINDOW_MS)).toBe(true);
  });

  it("registra el intento aunque no corresponda recargar", () => {
    const storage = fakeStorage();
    const start = 1_000_000;

    shouldAutoReload(storage, start);
    shouldAutoReload(storage, start + 1);

    // El segundo intento corrió el reloj: desde él vuelve a contar la ventana.
    expect(shouldAutoReload(storage, start + RETRY_WINDOW_MS)).toBe(false);
  });

  it("no recarga si el almacenamiento no está disponible", () => {
    expect(shouldAutoReload(brokenStorage(), 1_000_000)).toBe(false);
  });
});

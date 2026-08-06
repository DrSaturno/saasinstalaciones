import { describe, expect, it, vi } from "vitest";
import {
  clearOfflineSession,
  OFFLINE_OWNER_KEY,
  prepareOfflineStorageForUser,
  type OfflineStorageRuntime,
} from "@/lib/offline/session-storage";

function runtimeFor(owner: string | null) {
  const values = new Map<string, string>();
  if (owner) values.set(OFFLINE_OWNER_KEY, owner);

  const runtime: OfflineStorageRuntime = {
    storage: {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    },
    cacheStorage: {
      keys: vi.fn(async () => ["static-v4", "pages-v4"]),
      delete: vi.fn(async () => true),
    },
    clearDatabase: vi.fn(async () => undefined),
    notifyServiceWorker: vi.fn(),
  };

  return { runtime, values };
}

describe("offline session storage", () => {
  it("conserva los datos cuando pertenecen a la misma cuenta", async () => {
    const { runtime } = runtimeFor("user-a");

    await expect(
      prepareOfflineStorageForUser("user-a", runtime),
    ).resolves.toBe(true);

    expect(runtime.clearDatabase).not.toHaveBeenCalled();
    expect(runtime.cacheStorage?.keys).not.toHaveBeenCalled();
  });

  it("limpia Cache Storage e IndexedDB antes de aceptar otra cuenta", async () => {
    const { runtime, values } = runtimeFor("user-a");

    await expect(
      prepareOfflineStorageForUser("user-b", runtime),
    ).resolves.toBe(true);

    expect(runtime.clearDatabase).toHaveBeenCalledOnce();
    expect(runtime.cacheStorage?.delete).toHaveBeenCalledTimes(2);
    expect(runtime.notifyServiceWorker).toHaveBeenCalledOnce();
    expect(values.get(OFFLINE_OWNER_KEY)).toBe("user-b");
  });

  it("falla cerrado si no puede identificar al propietario", async () => {
    const { runtime } = runtimeFor(null);
    runtime.storage = null;

    await expect(
      prepareOfflineStorageForUser("user-a", runtime),
    ).resolves.toBe(false);

    expect(runtime.clearDatabase).toHaveBeenCalledOnce();
    expect(runtime.cacheStorage?.delete).toHaveBeenCalledTimes(2);
  });

  it("borra datos y la marca de cuenta al cerrar sesión", async () => {
    const { runtime, values } = runtimeFor("user-a");

    await expect(clearOfflineSession(runtime)).resolves.toBe(true);

    expect(runtime.clearDatabase).toHaveBeenCalledOnce();
    expect(runtime.cacheStorage?.delete).toHaveBeenCalledTimes(2);
    expect(values.has(OFFLINE_OWNER_KEY)).toBe(false);
  });
});

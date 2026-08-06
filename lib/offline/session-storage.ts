import { clearOfflineDatabase } from "@/lib/offline/db";

export const OFFLINE_OWNER_KEY = "instalapro:offline-owner:v1";
const LEGACY_OWNER_KEY = "instalapro:sw-cache-owner";

type OwnerStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type AppCacheStorage = Pick<CacheStorage, "keys" | "delete">;

export type OfflineStorageRuntime = {
  storage: OwnerStorage | null;
  cacheStorage: AppCacheStorage | null;
  clearDatabase: () => Promise<void>;
  notifyServiceWorker: () => void;
};

function browserRuntime(): OfflineStorageRuntime {
  let storage: OwnerStorage | null = null;
  try {
    storage = typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Algunos navegadores bloquean por completo el acceso a localStorage.
  }

  return {
    storage,
    cacheStorage:
      typeof globalThis.caches === "undefined" ? null : globalThis.caches,
    clearDatabase: clearOfflineDatabase,
    notifyServiceWorker: () => {
      if (typeof navigator === "undefined") return;
      navigator.serviceWorker?.controller?.postMessage("clear-cache");
    },
  };
}

async function clearData(
  runtime: OfflineStorageRuntime,
  removeOwner: boolean,
): Promise<boolean> {
  const cleanupResults = await Promise.allSettled([
    runtime.clearDatabase(),
    runtime.cacheStorage
      ? runtime.cacheStorage
          .keys()
          .then((keys) => Promise.all(keys.map((key) => runtime.cacheStorage!.delete(key))))
      : Promise.resolve(),
  ]);

  // También avisamos al SW activo para cerrar una carrera con requests que
  // estuvieran en curso mientras Cache Storage se vaciaba desde la ventana.
  try {
    runtime.notifyServiceWorker();
  } catch {
    // El borrado directo ya se intentó; el mensaje es una segunda defensa.
  }

  let ownerCleared = true;
  if (removeOwner) {
    try {
      runtime.storage?.removeItem(OFFLINE_OWNER_KEY);
      runtime.storage?.removeItem(LEGACY_OWNER_KEY);
    } catch {
      ownerCleared = false;
    }
  }

  return cleanupResults.every((result) => result.status === "fulfilled") && ownerCleared;
}

/**
 * Prepara Cache Storage e IndexedDB para la cuenta autenticada.
 *
 * Si no podemos demostrar que los datos pertenecen a la misma cuenta,
 * limpiamos primero. La marca de propietario se escribe solamente después de
 * una limpieza exitosa; así un fallo no queda registrado falsamente como sano.
 */
async function prepareWithRuntime(
  userId: string,
  runtime: OfflineStorageRuntime,
): Promise<boolean> {
  let previousOwner: string | null = null;
  let canTrackOwner = runtime.storage !== null;

  try {
    previousOwner = runtime.storage?.getItem(OFFLINE_OWNER_KEY) ?? null;
  } catch {
    canTrackOwner = false;
  }

  if (!canTrackOwner || previousOwner !== userId) {
    const cleaned = await clearData(runtime, true);
    if (!cleaned || !canTrackOwner) return false;
  }

  try {
    runtime.storage!.setItem(OFFLINE_OWNER_KEY, userId);
    runtime.storage!.removeItem(LEGACY_OWNER_KEY);
    return true;
  } catch {
    await clearData(runtime, true);
    return false;
  }
}

let browserOperation: Promise<boolean> = Promise.resolve(true);

/** Serializa preparaciones concurrentes de componentes hermanos. */
export function prepareOfflineStorageForUser(
  userId: string,
  runtime?: OfflineStorageRuntime,
): Promise<boolean> {
  if (runtime) return prepareWithRuntime(userId, runtime);

  browserOperation = browserOperation.then(
    () => prepareWithRuntime(userId, browserRuntime()),
    () => prepareWithRuntime(userId, browserRuntime()),
  );
  return browserOperation;
}

/** Limpieza previa al cierre de sesión. Siempre intenta todos los almacenes. */
export function clearOfflineSession(
  runtime?: OfflineStorageRuntime,
): Promise<boolean> {
  if (runtime) return clearData(runtime, true);

  browserOperation = browserOperation.then(
    () => clearData(browserRuntime(), true),
    () => clearData(browserRuntime(), true),
  );
  return browserOperation;
}

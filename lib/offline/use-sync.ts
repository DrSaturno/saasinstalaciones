"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { flush, pendingCount } from "./sync";
import { prepareOfflineStorageForUser } from "./session-storage";

function subscribeOnlineState(onStoreChange: () => void) {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function getOnlineSnapshot() {
  return navigator.onLine;
}

function getOnlineServerSnapshot() {
  return true;
}

/**
 * Estado de conexión + cola de sincronización del instalador.
 * Auto-flush al montar, al recuperar conexión y tras cada mutación local.
 */
export function useSync(userId: string) {
  const online = useSyncExternalStore(
    subscribeOnlineState,
    getOnlineSnapshot,
    getOnlineServerSnapshot,
  );
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    const ready = await prepareOfflineStorageForUser(userId);
    if (!ready) {
      setPending(0);
      return;
    }
    setPending(await pendingCount());
  }, [userId]);

  const runFlush = useCallback(async () => {
    if (!navigator.onLine) return;
    const ready = await prepareOfflineStorageForUser(userId);
    if (!ready) return;
    setSyncing(true);
    try {
      await flush();
    } finally {
      setSyncing(false);
      await refresh();
    }
  }, [refresh, userId]);

  useEffect(() => {
    prepareOfflineStorageForUser(userId).then(async (ready) => {
      if (!ready) return;
      const count = await pendingCount();
      setPending(count);
      if (count > 0 && navigator.onLine) runFlush();
    });

    const onOnline = () => runFlush();
    // Otras pestañas / componentes avisan que encolaron algo.
    const onQueued = () => {
      refresh();
      runFlush();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("instalapro:queued", onQueued);

    // Reintento periódico por si un flush falló a mitad.
    const interval = setInterval(runFlush, 20_000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("instalapro:queued", onQueued);
      clearInterval(interval);
    };
  }, [refresh, runFlush, userId]);

  return { online, pending, syncing, refresh: runFlush };
}

/** Señal para que el hook refresque/flushee tras encolar una mutación. */
export function notifyQueued() {
  window.dispatchEvent(new Event("instalapro:queued"));
}

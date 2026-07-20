"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { flush, pendingCount } from "./sync";

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
export function useSync() {
  const online = useSyncExternalStore(
    subscribeOnlineState,
    getOnlineSnapshot,
    getOnlineServerSnapshot,
  );
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    setPending(await pendingCount());
  }, []);

  const runFlush = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    try {
      await flush();
    } finally {
      setSyncing(false);
      await refresh();
    }
  }, [refresh]);

  useEffect(() => {
    pendingCount().then((count) => {
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
  }, [refresh, runFlush]);

  return { online, pending, syncing, refresh: runFlush };
}

/** Señal para que el hook refresque/flushee tras encolar una mutación. */
export function notifyQueued() {
  window.dispatchEvent(new Event("instalapro:queued"));
}

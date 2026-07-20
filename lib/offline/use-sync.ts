"use client";

import { useCallback, useEffect, useState } from "react";
import { flush, pendingCount } from "./sync";

/**
 * Estado de conexión + cola de sincronización del instalador.
 * Auto-flush al montar, al recuperar conexión y tras cada mutación local.
 */
export function useSync() {
  const [online, setOnline] = useState(true);
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
    setOnline(navigator.onLine);
    refresh();

    const onOnline = () => {
      setOnline(true);
      runFlush();
    };
    const onOffline = () => setOnline(false);
    // Otras pestañas / componentes avisan que encolaron algo.
    const onQueued = () => {
      refresh();
      runFlush();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("instalapro:queued", onQueued);

    // Reintento periódico por si un flush falló a mitad.
    const interval = setInterval(runFlush, 20_000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
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

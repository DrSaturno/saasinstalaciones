"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  discardOutboxItem,
  flush,
  queueSnapshot,
  retryOutboxItem,
  type QueueSnapshot,
} from "./sync";
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
  const [queue, setQueue] = useState<QueueSnapshot>({
    pending: 0,
    blocked: 0,
    issues: [],
  });
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    const ready = await prepareOfflineStorageForUser(userId);
    if (!ready) {
      setQueue({ pending: 0, blocked: 0, issues: [] });
      return;
    }
    setQueue(await queueSnapshot());
  }, [userId]);

  const runFlush = useCallback(async () => {
    if (!navigator.onLine) return;
    const ready = await prepareOfflineStorageForUser(userId);
    if (!ready) return;
    const before = await queueSnapshot();
    let sent = 0;
    setSyncing(true);
    try {
      sent = await flush();
    } finally {
      setSyncing(false);
      const after = await queueSnapshot();
      setQueue(after);
      if (
        sent > 0 ||
        before.pending !== after.pending ||
        before.blocked !== after.blocked ||
        before.issues.length !== after.issues.length
      ) {
        window.dispatchEvent(new Event("instalapro:sync-settled"));
      }
    }
  }, [userId]);

  useEffect(() => {
    prepareOfflineStorageForUser(userId).then(async (ready) => {
      if (!ready) return;
      const snapshot = await queueSnapshot();
      setQueue(snapshot);
      if (snapshot.pending > snapshot.blocked && navigator.onLine) runFlush();
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

  const retryIssue = useCallback(
    async (id: string) => {
      await retryOutboxItem(id);
      await runFlush();
    },
    [runFlush],
  );

  const discardIssue = useCallback(
    async (id: string) => {
      await discardOutboxItem(id);
      await refresh();
    },
    [refresh],
  );

  return {
    online,
    pending: queue.pending,
    blocked: queue.blocked,
    issues: queue.issues,
    syncing,
    refresh: runFlush,
    retryIssue,
    discardIssue,
  };
}

/** Señal para que el hook refresque/flushee tras encolar una mutación. */
export function notifyQueued() {
  window.dispatchEvent(new Event("instalapro:queued"));
}

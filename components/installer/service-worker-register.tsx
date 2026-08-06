"use client";

import { useEffect } from "react";
import { prepareOfflineStorageForUser } from "@/lib/offline/session-storage";

/**
 * Prepara los almacenes offline para la cuenta actual y registra el service
 * worker. Silencioso si el navegador no ofrece alguna de esas capacidades.
 */
export function ServiceWorkerRegister({ userId }: { userId: string }) {
  useEffect(() => {
    let cancelled = false;
    let listeningForLoad = false;

    const register = () => {
      if (cancelled) return;
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* sin SW la app sigue funcionando y la cola Dexie conserva los cambios */
      });
    };

    const initialize = async () => {
      await prepareOfflineStorageForUser(userId);
      if (cancelled || !("serviceWorker" in navigator)) return;
      if (process.env.NODE_ENV !== "production") return;

      if (document.readyState === "complete") {
        register();
      } else {
        listeningForLoad = true;
        window.addEventListener("load", register, { once: true });
      }
    };

    void initialize();
    return () => {
      cancelled = true;
      if (listeningForLoad) window.removeEventListener("load", register);
    };
  }, [userId]);

  return null;
}

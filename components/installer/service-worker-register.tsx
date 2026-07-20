"use client";

import { useEffect } from "react";

/** Registra el service worker del área instalador. Silencioso si falla. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return; // el SW sólo en prod
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* sin SW la app sigue funcionando, sólo pierde el offline de lectura */
      });
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}

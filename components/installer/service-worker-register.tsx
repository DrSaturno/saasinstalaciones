"use client";

import { useEffect } from "react";

const LAST_USER_KEY = "instalapro:sw-cache-owner";

/**
 * Registra el service worker del área instalador. Silencioso si falla.
 *
 * Además vacía la caché de páginas cuando cambia la persona logueada. El SW
 * guarda navegaciones autenticadas (`/tasks`, `/jobs`, `/profile`) en una caché
 * del navegador, compartida por todas las cuentas que usen ese teléfono. Sin
 * esta limpieza, quien entra después puede recibir páginas servidas desde la
 * caché de la cuenta anterior.
 */
export function ServiceWorkerRegister({ userId }: { userId: string }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return; // el SW sólo en prod

    let previousUser: string | null = null;
    try {
      previousUser = window.localStorage.getItem(LAST_USER_KEY);
      window.localStorage.setItem(LAST_USER_KEY, userId);
    } catch {
      // Sin almacenamiento no podemos detectar el cambio de cuenta. Igual
      // registramos el SW: perder el offline sería peor que el riesgo de caché.
    }

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then(async () => {
          if (!previousUser || previousUser === userId) return;
          const registration = await navigator.serviceWorker.ready;
          registration.active?.postMessage("clear-cache");
        })
        .catch(() => {
          /* sin SW la app sigue funcionando, sólo pierde el offline de lectura */
        });
    };

    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, [userId]);

  return null;
}

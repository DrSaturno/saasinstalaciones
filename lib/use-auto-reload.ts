"use client";

import { useEffect } from "react";

const KEY = "instalapro:last-auto-reload";

/**
 * Ventana dentro de la cual NO se vuelve a recargar. Si el boundary de error se
 * monta otra vez antes de que pase este tiempo, quiere decir que la recarga
 * anterior no resolvió nada y el error es determinístico: en ese caso mostramos
 * la pantalla de error en vez de quedar en un bucle de recargas.
 */
export const RETRY_WINDOW_MS = 10_000;

type ReloadStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * Decide si corresponde recargar y deja registrado el intento. Separada del
 * hook para poder testearla sin DOM.
 *
 * Devuelve false si el almacenamiento no está disponible (modo privado, cookies
 * bloqueadas): sin forma de contar los intentos, no recargamos, porque el riesgo
 * es un bucle infinito de recargas.
 */
export function shouldAutoReload(
  storage: ReloadStorage,
  now: number = Date.now(),
): boolean {
  let last: number;

  try {
    last = Number(storage.getItem(KEY)) || 0;
    storage.setItem(KEY, String(now));
  } catch {
    return false;
  }

  return now - last >= RETRY_WINDOW_MS;
}

/**
 * Recarga la página una sola vez cuando un boundary de error se activa.
 *
 * Cubre el caso común de un fallo transitorio (sesión vencida, respuesta cortada,
 * chunk que no llegó), donde un F5 alcanza. Si el error persiste, la segunda
 * activación cae dentro de la ventana y el usuario ve la pantalla de error con
 * sus botones.
 */
export function useAutoReloadOnError() {
  useEffect(() => {
    let reload = false;

    try {
      reload = shouldAutoReload(window.sessionStorage);
    } catch {
      return;
    }

    if (reload) window.location.reload();
  }, []);
}

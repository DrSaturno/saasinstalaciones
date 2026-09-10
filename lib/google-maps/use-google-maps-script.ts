"use client";

import { useEffect, useState } from "react";
import { googleMapsApiKey } from "@/lib/google-maps/config";

declare global {
  interface Window {
    google?: typeof google;
    /**
     * Callback que Google invoca para errores de autenticación —clave
     * inválida, dominio no autorizado, facturación no habilitada— que NO
     * siempre rechazan la promesa de `importLibrary`. Es el único gancho
     * oficial para enterarse de esa clase de falla.
     * https://developers.google.com/maps/documentation/javascript/events#auth-errors
     */
    gm_authFailure?: () => void;
  }
}

const SCRIPT_ID = "google-maps-js-api";
// Un solo script para toda la sesión de navegación: montar y desmontar el
// mapa varias veces (cambiar de pestaña y volver, revalidar la página) no
// puede volver a pedirlo cada vez ni pisar una carga en curso.
let loadPromise: Promise<void> | null = null;

/**
 * Con `loading=async`, el script que baja es sólo un cargador: cuando dispara
 * `onload`, `google.maps.Map` TODAVÍA NO EXISTE y construirlo revienta con
 * "is not a constructor". Hay que pedir explícitamente cada librería y
 * esperarla. Eso es lo que hace `importLibrary`.
 */
async function waitForLibraries(): Promise<void> {
  await Promise.all([
    google.maps.importLibrary("maps"),
    google.maps.importLibrary("marker"),
  ]);
  // Comprobar el constructor y no sólo que la promesa resolvió: si por lo que
  // sea no quedó disponible, es preferible fallar acá —el bloque muestra su
  // aviso— que dejar que el componente lo llame y reviente la página entera.
  if (typeof google.maps.Map !== "function") {
    throw new Error("Google Maps cargó sin el constructor de Map");
  }
}

function loadScript(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve, reject) => {
    // Clave inválida, dominio no autorizado o facturación sin habilitar no
    // siempre rechazan una promesa: Google los reporta por este callback
    // global. Sin engancharlo, esa clase de error queda completamente muda —
    // ni consola, ni catch, nada.
    window.gm_authFailure = () => {
      reject(new Error("Google rechazó la clave: revisar restricciones de dominio, API habilitada o facturación en Google Cloud."));
    };

    if (typeof window.google?.maps?.importLibrary === "function") {
      resolve();
      return;
    }
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("No se pudo cargar el script de Google Maps (bloqueado o sin red).")));
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    // `libraries` las precarga; `importLibrary` de abajo resuelve enseguida.
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsApiKey())}&loading=async&libraries=maps,marker`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar el script de Google Maps (bloqueado o sin red)."));
    document.head.appendChild(script);
  }).then(waitForLibraries);
  return loadPromise;
}

export function useGoogleMapsScript(): { loaded: boolean; error: boolean } {
  // `window` no existe durante el renderizado del servidor: arranca en falso
  // y `useEffect` (sólo cliente) corrige si el script ya estaba cargado.
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadScript()
      .then(() => { if (!cancelled) setLoaded(true); })
      .catch((err: unknown) => {
        // Antes se descartaba el motivo real acá mismo: el bloque mostraba
        // "no se pudo cargar" y la consola quedaba muda, como si la falla no
        // hubiera dejado ningún rastro. Ahora queda logueado.
        console.error("[OperationalMap] Google Maps no cargó:", err);
        if (!cancelled) setError(true);
      });
    return () => { cancelled = true; };
  }, []);

  return { loaded, error };
}

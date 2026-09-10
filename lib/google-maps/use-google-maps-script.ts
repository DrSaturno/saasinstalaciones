"use client";

import { useEffect, useState } from "react";
import { googleMapsApiKey } from "@/lib/google-maps/config";

declare global {
  interface Window {
    google?: typeof google;
    /**
     * Callback que Google invoca para errores de autenticación —clave
     * inválida, dominio no autorizado, facturación no habilitada—. Es el
     * único gancho oficial para enterarse de esa clase de falla; sin él
     * quedan completamente mudas.
     * https://developers.google.com/maps/documentation/javascript/events#auth-errors
     */
    gm_authFailure?: () => void;
  }
}

const SCRIPT_ID = "google-maps-js-api";
const CALLBACK_NAME = "__seInstalaGoogleMapsReady";
// Un solo script para toda la sesión de navegación: montar y desmontar el
// mapa varias veces (cambiar de pestaña y volver, revalidar la página) no
// puede volver a pedirlo cada vez ni pisar una carga en curso.
let loadPromise: Promise<void> | null = null;

/**
 * `?loading=async` + `google.maps.importLibrary` es el patrón nuevo de
 * Google, pero `importLibrary` sólo queda definido si se implementa su
 * "bootstrap loader" completo (un wrapper que hay que declarar ANTES de
 * pedir el script). Pedir el script por URL sola —lo que hacía la versión
 * anterior— nunca lo define: revienta con "importLibrary is not a function"
 * siempre, con cualquier clave, en cualquier proyecto.
 *
 * Como el mapa sólo usa objetos clásicos (`Marker`, no `AdvancedMarker` —
 * DEC-MAPA-02), no hace falta nada de eso: el parámetro `callback` clásico,
 * que existe hace más de una década, garantiza que TODO esté listo cuando se
 * ejecuta, sin el wrapper adicional.
 */
function loadScript(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve, reject) => {
    if (typeof window.google?.maps?.Map === "function") {
      resolve();
      return;
    }

    window.gm_authFailure = () => {
      reject(new Error("Google rechazó la clave: revisar restricciones de dominio, API habilitada o facturación en Google Cloud."));
    };

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      // El script ya se pidió (remount en la misma sesión): esperar a que su
      // callback original termine de poblar `google.maps`.
      const check = () => {
        if (typeof window.google?.maps?.Map === "function") resolve();
        else setTimeout(check, 50);
      };
      check();
      return;
    }

    (window as unknown as Record<string, () => void>)[CALLBACK_NAME] = () => resolve();

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsApiKey())}&callback=${CALLBACK_NAME}`;
    script.async = true;
    script.onerror = () => reject(new Error("No se pudo cargar el script de Google Maps (bloqueado o sin red)."));
    document.head.appendChild(script);
  });
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
        console.error("[OperationalMap] Google Maps no cargó:", err);
        if (!cancelled) setError(true);
      });
    return () => { cancelled = true; };
  }, []);

  return { loaded, error };
}

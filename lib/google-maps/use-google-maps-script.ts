"use client";

import { useEffect, useState } from "react";
import { googleMapsApiKey } from "@/lib/google-maps/config";

declare global {
  interface Window {
    google?: typeof google;
  }
}

const SCRIPT_ID = "google-maps-js-api";
// Un solo script para toda la sesión de navegación: montar y desmontar el
// mapa varias veces (cambiar de pestaña y volver, revalidar la página) no
// puede volver a pedirlo cada vez ni pisar una carga en curso.
let loadPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    if (window.google?.maps) {
      resolve();
      return;
    }
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("No se pudo cargar Google Maps")));
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsApiKey())}&loading=async`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar Google Maps"));
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
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);

  return { loaded, error };
}

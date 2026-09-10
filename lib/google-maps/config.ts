/**
 * A diferencia de `lib/google-calendar/config.ts`, esto NO es `server-only`:
 * el mapa corre en el navegador, así que tanto el Server Component que decide
 * si mostrar el aviso de "falta configurar" como el Client Component que
 * carga el script necesitan leer esto.
 */
export function googleMapsConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim());
}

export function googleMapsApiKey() {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";
}

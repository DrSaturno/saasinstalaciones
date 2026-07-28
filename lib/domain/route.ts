/**
 * Armado de rutas para Google Maps a partir de las paradas del día.
 *
 * Se prefieren las coordenadas cuando el punto las tiene: una dirección escrita
 * a mano puede resolver a otra ciudad, mientras que lat/lng es inequívoco.
 */

export type RouteStop = {
  lat: number | null;
  lng: number | null;
  address: string;
  city: string;
};

/** Google acepta hasta 23 waypoints intermedios en la API de direcciones. */
export const MAX_WAYPOINTS = 23;

/** Punto utilizable por Maps, o null si la parada no tiene ubicación. */
export function stopLocation(stop: RouteStop): string | null {
  if (stop.lat !== null && stop.lng !== null) return `${stop.lat},${stop.lng}`;
  const written = [stop.address, stop.city].filter(Boolean).join(", ");
  return written || null;
}

/** Link para navegar a una sola parada desde donde esté el instalador. */
export function stopHref(stop: RouteStop): string | null {
  const location = stopLocation(stop);
  return location
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(location)}&travelmode=driving`
    : null;
}

/**
 * Ruta completa del día.
 *
 * Si el instalador cargó su dirección base, esa es el ORIGEN: el recorrido
 * arranca de su casa o depósito, que es como sale realmente a la calle. Sin
 * base, se cae al comportamiento anterior — la primera parada oficia de origen.
 *
 * La última parada es el destino y el resto van como waypoints en orden.
 *
 * Devuelve null si no hay al menos dos puntos ubicables — con uno solo, el link
 * correcto es el de esa parada (stopHref), no una "ruta".
 */
export function buildRouteUrl(
  stops: RouteStop[],
  base?: RouteStop | null,
): string | null {
  const stopPoints = stops
    .map(stopLocation)
    .filter((value): value is string => value !== null);

  const basePoint = base ? stopLocation(base) : null;
  const points = basePoint ? [basePoint, ...stopPoints] : stopPoints;
  if (points.length < 2) return null;

  const origin = encodeURIComponent(points[0]);
  const destination = encodeURIComponent(points[points.length - 1]);
  const middle = points
    .slice(1, -1)
    .slice(0, MAX_WAYPOINTS)
    .map(encodeURIComponent)
    .join("|");

  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${
    middle ? `&waypoints=${middle}` : ""
  }&travelmode=driving`;
}

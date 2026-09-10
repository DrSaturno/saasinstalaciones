"use client";

import { useEffect, useRef } from "react";
import { useGoogleMapsScript } from "@/lib/google-maps/use-google-maps-script";
import type { DashboardOverview } from "@/lib/data/dashboard";

type MapSite = DashboardOverview["mapSites"][number];

/** Mismos tokens que `StatusBadge`, para que mapa y lista cuenten lo mismo. */
const STATUS_COLOR: Record<string, string> = {
  pendiente: "#868c98",
  relevamiento: "#2196f3",
  planificada: "#c0d5ff",
  en_camino: "#2597d0",
  en_sitio: "#2597d0",
  en_proceso: "#2597d0",
  en_revision: "#ffecc0",
  finalizada: "#43a047",
  cancelada: "#d32f2f",
};

/**
 * El mapa real: todos los pines de la semana a la vez, encuadrados solos.
 *
 * Reemplaza el `<iframe>` de búsqueda anterior, que sólo podía centrarse en
 * UN lugar — por eso el mapa operativo nunca mostraba el circuito completo,
 * aunque los datos (lat/lng por orden) ya estuvieran. Ver DEC-MAPA-01.
 */
export function OperationalMap({
  sites,
  selectedId,
  onSelect,
}: {
  sites: MapSite[];
  selectedId: string;
  onSelect: (orderId: string) => void;
}) {
  const { loaded, error } = useGoogleMapsScript();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  // El callback de selección cambia de identidad en cada render del padre
  // (recrea la función). Guardarlo en un ref evita recrear TODOS los
  // marcadores —con su listener de click— cada vez que cambia la selección.
  // La escritura va en un efecto: mutar un ref durante el render está
  // prohibido, aunque acá no dispare ningún re-render.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const withCoords = sites.filter(
    (site): site is MapSite & { lat: number; lng: number } => site.lat !== null && site.lng !== null,
  );

  // Crea el mapa una sola vez.
  useEffect(() => {
    if (!loaded || !containerRef.current || mapRef.current) return;
    mapRef.current = new google.maps.Map(containerRef.current, {
      center: { lat: -34.6, lng: -58.4 },
      zoom: 5,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
    });
  }, [loaded]);

  // Reconstruye los marcadores cuando cambia el CONJUNTO de locaciones (no en
  // cada cambio de selección — eso lo maneja el efecto de abajo).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const marker of markersRef.current.values()) marker.setMap(null);
    markersRef.current = new Map();

    if (withCoords.length === 0) return;

    const bounds = new google.maps.LatLngBounds();
    for (const site of withCoords) {
      const position = { lat: site.lat, lng: site.lng };
      bounds.extend(position);
      const marker = new google.maps.Marker({
        map,
        position,
        title: `${site.number} · ${site.siteName}`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: STATUS_COLOR[site.status] ?? "#868c98",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
          scale: 9,
        },
      });
      marker.addListener("click", () => onSelectRef.current(site.orderId));
      markersRef.current.set(site.orderId, marker);
    }

    // Un solo pin no tiene "encuadre": `fitBounds` lo dejaría pegado al borde
    // con zoom exagerado. Se centra con un zoom fijo y razonable en cambio.
    if (withCoords.length === 1) {
      map.setCenter({ lat: withCoords[0].lat, lng: withCoords[0].lng });
      map.setZoom(14);
    } else {
      map.fitBounds(bounds, 48);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `withCoords` se recalcula cada render; comparar por ids evita reconstruir sin necesidad.
  }, [loaded, withCoords.map((s) => s.orderId).join(",")]);

  // Resalta el pin seleccionado sin tocar el resto.
  useEffect(() => {
    for (const [orderId, marker] of markersRef.current) {
      marker.setZIndex(orderId === selectedId ? 10 : 1);
      marker.setAnimation(orderId === selectedId ? google.maps.Animation.DROP : null);
    }
    const selectedMarker = markersRef.current.get(selectedId);
    if (selectedMarker && mapRef.current) mapRef.current.panTo(selectedMarker.getPosition()!);
  }, [selectedId]);

  if (error) {
    return (
      <div className="flex size-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        No se pudo cargar el mapa. Probá de nuevo en un momento.
      </div>
    );
  }

  return <div ref={containerRef} className="size-full" />;
}

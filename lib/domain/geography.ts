import type { Country } from "@/types/database";

/**
 * Taxonomía geográfica por país.
 *
 * La provincia (AR) / estado (BR) es una lista FIJA — no cambia, por eso vive en
 * código y no en la base. La ciudad es texto libre (con autocompletado alimentado
 * por los sites ya cargados). El "estar cerca" para la bolsa se resuelve por
 * provincia y, si hay coordenadas, se afina por distancia (haversine).
 *
 * Foco actual: Argentina. Brasil queda definido como estructura (27 estados) pero
 * sin ciudades sembradas.
 */

/** 23 provincias + CABA. */
export const AR_PROVINCES = [
  "Buenos Aires",
  "Ciudad Autónoma de Buenos Aires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
] as const;

/**
 * 26 estados + DF, por sigla (formato heredado; BR está diferido). Se mantienen
 * las abreviaturas para no cambiar el comportamiento de proyectos BR existentes.
 */
export const BR_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT",
  "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO",
  "RR", "SC", "SP", "SE", "TO",
] as const;

/** Lista de provincias/estados válidos para un país. */
export function provincesFor(country: Country): readonly string[] {
  return country === "BR" ? BR_STATES : AR_PROVINCES;
}

/** ¿La provincia pertenece a la taxonomía del país? */
export function isValidProvince(country: Country, province: string): boolean {
  return provincesFor(country).includes(province.trim());
}

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Distancia en kilómetros entre dos puntos (fórmula de haversine).
 * Devuelve null si falta alguna coordenada.
 */
export function haversineKm(
  a: { lat: number | null; lng: number | null },
  b: { lat: number | null; lng: number | null },
): number | null {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * ¿Un instalador alcanza geográficamente a un trabajo?
 *
 * Regla base: cubre la provincia del trabajo. Si el instalador declaró una base
 * (lat/lng) y un radio, y el trabajo tiene coordenadas, además debe estar dentro
 * del radio. Sin coordenadas suficientes, alcanza con la provincia.
 */
export function installerReachesJob(
  installer: {
    zones: string[];
    baseLat: number | null;
    baseLng: number | null;
    serviceRadiusKm: number | null;
  },
  job: { province: string; lat: number | null; lng: number | null },
): boolean {
  const covers = installer.zones.map((z) => z.trim()).includes(job.province.trim());
  if (!covers) return false;
  if (installer.serviceRadiusKm == null) return true;
  const distance = haversineKm(
    { lat: installer.baseLat, lng: installer.baseLng },
    { lat: job.lat, lng: job.lng },
  );
  if (distance == null) return true; // faltan coordenadas → no filtra por radio
  return distance <= installer.serviceRadiusKm;
}

import { z } from "zod";

/**
 * Lógica pura de la geocodificación: armar la consulta, interpretar la
 * respuesta de Google y decidir cuándo hace falta volver a preguntar.
 *
 * Nadie escribe coordenadas a mano: se calculan a partir de la dirección
 * (docs/specs/2026-09-24-sin-latitud-longitud). Acá no hay red ni estado, para
 * que las reglas —sobre todo qué se acepta como resultado— se prueben sin
 * simular a Google.
 */

export type GeocodeCountry = "AR" | "BR";

export type Coordinates = { lat: number; lng: number };

export type GeocodeQuery = {
  /** Texto libre que se le manda a Google: «dirección, ciudad, provincia». */
  address: string;
  /** Restringe la búsqueda al país del proyecto. */
  country: GeocodeCountry;
};

export type GeocodeFailure =
  | "no_key"
  | "empty_address"
  | "zero_results"
  | "vague_result"
  | "over_query_limit"
  | "request_denied"
  | "invalid_response"
  | "timeout"
  | "network"
  | "http_error";

export type GeocodeOutcome =
  | { ok: true; coordinates: Coordinates }
  | { ok: false; reason: GeocodeFailure };

type AddressParts = {
  address?: string | null;
  city?: string | null;
  state?: string | null;
};

const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

/** Normaliza para comparar: mayúsculas, tildes y espacios no cuentan como cambio. */
const comparable = (value: string | null | undefined) =>
  clean(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Arma la consulta para Google, o `null` si no hay nada que ubicar.
 *
 * Con `allowCityOnly` alcanza una ciudad (la base de un instalador: para un
 * radio de servicio de decenas de kilómetros, el centro de la ciudad sirve). Un
 * local, en cambio, exige calle: ubicar «Córdoba» y dibujarlo como si fuera el
 * local sería falsa precisión.
 */
export function geocodeQueryFor(
  parts: AddressParts & { country?: string | null },
  options: { allowCityOnly?: boolean } = {},
): GeocodeQuery | null {
  const street = clean(parts.address);
  const city = clean(parts.city);
  const state = clean(parts.state);
  if (!street && !(options.allowCityOnly && city)) return null;
  const address = [street, city, state].filter(Boolean).join(", ");
  if (!address) return null;
  return { address, country: parts.country === "BR" ? "BR" : "AR" };
}

/** ¿Cambió lo que se le pregunta a Google? Sólo entonces vale la pena repreguntar. */
export function addressChanged(
  before: AddressParts & { zone?: string | null },
  after: AddressParts & { zone?: string | null },
): boolean {
  return (
    comparable(before.address) !== comparable(after.address) ||
    comparable(before.city) !== comparable(after.city) ||
    comparable(before.state) !== comparable(after.state) ||
    comparable(before.zone) !== comparable(after.zone)
  );
}

const geocodeResponseSchema = z.object({
  status: z.string(),
  results: z
    .array(
      z.object({
        partial_match: z.boolean().optional(),
        geometry: z.object({
          location: z.object({ lat: z.number(), lng: z.number() }),
          location_type: z.string().optional(),
        }),
      }),
    )
    .default([]),
});

/**
 * Interpreta la respuesta de la Geocoding API.
 *
 * Toma el primer resultado, salvo que sea una conjetura: `partial_match` con
 * `location_type = APPROXIMATE` es Google diciendo «no encontré esa dirección,
 * pero algo parecido está por acá». El matching por radio y la viabilidad de
 * traslado deciden con estos números; una ubicación que parece precisa y no lo
 * es puede bloquear una asignación legítima. Sin ubicación esos controles se
 * saltean, que es lo que pasaba con la coordenada en blanco.
 */
export function parseGeocodeResponse(json: unknown): GeocodeOutcome {
  const parsed = geocodeResponseSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: "invalid_response" };
  const { status, results } = parsed.data;

  if (status === "ZERO_RESULTS") return { ok: false, reason: "zero_results" };
  if (status === "OVER_QUERY_LIMIT" || status === "OVER_DAILY_LIMIT") {
    return { ok: false, reason: "over_query_limit" };
  }
  if (status === "REQUEST_DENIED") return { ok: false, reason: "request_denied" };
  if (status !== "OK") return { ok: false, reason: "invalid_response" };

  const first = results[0];
  if (!first) return { ok: false, reason: "zero_results" };
  if (first.partial_match && first.geometry.location_type === "APPROXIMATE") {
    return { ok: false, reason: "vague_result" };
  }
  const { lat, lng } = first.geometry.location;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { ok: false, reason: "invalid_response" };
  }
  return { ok: true, coordinates: { lat, lng } };
}

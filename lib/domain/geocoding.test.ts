import { describe, expect, it } from "vitest";
import { addressChanged, geocodeQueryFor, parseGeocodeResponse } from "@/lib/domain/geocoding";

const ok = (over: Record<string, unknown> = {}) => ({
  status: "OK",
  results: [
    {
      geometry: { location: { lat: -34.6037, lng: -58.3816 }, location_type: "ROOFTOP" },
      ...over,
    },
  ],
});

describe("geocodeQueryFor", () => {
  it("arma dirección, ciudad y provincia en un solo texto", () => {
    expect(
      geocodeQueryFor({ address: "Av. Corrientes 1234", city: "CABA", state: "Buenos Aires", country: "AR" }),
    ).toEqual({ address: "Av. Corrientes 1234, CABA, Buenos Aires", country: "AR" });
  });

  it("un local sin calle no se ubica: una ciudad sola sería falsa precisión", () => {
    expect(geocodeQueryFor({ address: "", city: "Córdoba", state: "Córdoba", country: "AR" })).toBeNull();
    expect(geocodeQueryFor({ address: "   ", city: "Córdoba", country: "AR" })).toBeNull();
  });

  it("la base de un instalador sí puede ser sólo la ciudad", () => {
    expect(geocodeQueryFor({ address: "", city: "Rosario", country: "AR" }, { allowCityOnly: true })).toEqual({
      address: "Rosario",
      country: "AR",
    });
  });

  it("sin nada que ubicar, devuelve null", () => {
    expect(geocodeQueryFor({ country: "AR" }, { allowCityOnly: true })).toBeNull();
  });

  it("colapsa espacios y usa Brasil sólo si el proyecto es de Brasil", () => {
    expect(geocodeQueryFor({ address: "  Rua   Augusta   100 ", city: "São Paulo", country: "BR" })).toEqual({
      address: "Rua Augusta 100, São Paulo",
      country: "BR",
    });
    expect(geocodeQueryFor({ address: "X 1", country: null })?.country).toBe("AR");
  });
});

describe("addressChanged", () => {
  const base = { address: "Av. Corrientes 1234", city: "CABA", state: "Buenos Aires", zone: "Buenos Aires" };

  it("no cuenta mayúsculas, tildes ni espacios de más como cambio", () => {
    expect(addressChanged(base, { ...base, address: "  av.  CORRIENTES 1234 ", city: "caba" })).toBe(false);
    expect(addressChanged({ ...base, city: "Córdoba" }, { ...base, city: "cordoba" })).toBe(false);
  });

  it("cambiar calle, ciudad, estado o provincia sí cuenta", () => {
    expect(addressChanged(base, { ...base, address: "Av. Corrientes 1235" })).toBe(true);
    expect(addressChanged(base, { ...base, city: "Rosario" })).toBe(true);
    expect(addressChanged(base, { ...base, state: "Santa Fe" })).toBe(true);
    expect(addressChanged(base, { ...base, zone: "Santa Fe" })).toBe(true);
  });

  it("editar otra cosa (teléfono, notas) no toca la dirección", () => {
    expect(addressChanged(base, { ...base })).toBe(false);
  });
});

describe("parseGeocodeResponse", () => {
  it("toma el primer resultado preciso", () => {
    expect(parseGeocodeResponse(ok())).toEqual({ ok: true, coordinates: { lat: -34.6037, lng: -58.3816 } });
  });

  it("acepta una coincidencia parcial que no es una conjetura", () => {
    const out = parseGeocodeResponse(
      ok({ partial_match: true, geometry: { location: { lat: -31.4, lng: -64.2 }, location_type: "RANGE_INTERPOLATED" } }),
    );
    expect(out.ok).toBe(true);
  });

  it("descarta la conjetura: coincidencia parcial de nivel aproximado", () => {
    const out = parseGeocodeResponse(
      ok({ partial_match: true, geometry: { location: { lat: -31.4, lng: -64.2 }, location_type: "APPROXIMATE" } }),
    );
    expect(out).toEqual({ ok: false, reason: "vague_result" });
  });

  it("una ubicación aproximada pero sin coincidencia parcial se acepta (ruta, km)", () => {
    const out = parseGeocodeResponse(
      ok({ geometry: { location: { lat: -31.4, lng: -64.2 }, location_type: "APPROXIMATE" } }),
    );
    expect(out.ok).toBe(true);
  });

  it("distingue los motivos de falla", () => {
    expect(parseGeocodeResponse({ status: "ZERO_RESULTS", results: [] })).toEqual({ ok: false, reason: "zero_results" });
    expect(parseGeocodeResponse({ status: "OVER_QUERY_LIMIT" })).toEqual({ ok: false, reason: "over_query_limit" });
    expect(parseGeocodeResponse({ status: "REQUEST_DENIED" })).toEqual({ ok: false, reason: "request_denied" });
    expect(parseGeocodeResponse({ status: "OK", results: [] })).toEqual({ ok: false, reason: "zero_results" });
  });

  it("una respuesta que no tiene la forma esperada no rompe: es «no ubicado»", () => {
    expect(parseGeocodeResponse(null)).toEqual({ ok: false, reason: "invalid_response" });
    expect(parseGeocodeResponse({ nada: 1 })).toEqual({ ok: false, reason: "invalid_response" });
    expect(parseGeocodeResponse({ status: "UNKNOWN_ERROR" })).toEqual({ ok: false, reason: "invalid_response" });
  });

  it("rechaza coordenadas fuera de rango", () => {
    expect(
      parseGeocodeResponse(ok({ geometry: { location: { lat: 400, lng: 0 }, location_type: "ROOFTOP" } })),
    ).toEqual({ ok: false, reason: "invalid_response" });
  });
});

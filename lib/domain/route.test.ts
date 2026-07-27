import { describe, expect, it } from "vitest";
import { buildRouteUrl, MAX_WAYPOINTS, stopHref, stopLocation } from "@/lib/domain/route";

const withCoords = { lat: -34.6, lng: -58.38, address: "Av. Corrientes 1000", city: "CABA" };
const onlyAddress = { lat: null, lng: null, address: "Av. Siempreviva 742", city: "Springfield" };
const empty = { lat: null, lng: null, address: "", city: "" };

describe("stopLocation", () => {
  it("prefiere las coordenadas sobre la dirección escrita", () => {
    expect(stopLocation(withCoords)).toBe("-34.6,-58.38");
  });

  it("cae en la dirección cuando no hay coordenadas", () => {
    expect(stopLocation(onlyAddress)).toBe("Av. Siempreviva 742, Springfield");
  });

  it("devuelve null si no hay nada con qué ubicar", () => {
    expect(stopLocation(empty)).toBeNull();
  });
});

describe("stopHref", () => {
  it("arma el link de navegación a una parada", () => {
    const href = stopHref(withCoords);
    expect(href).toContain("destination=-34.6%2C-58.38");
    expect(href).toContain("travelmode=driving");
  });

  it("es null para una parada sin ubicación", () => {
    expect(stopHref(empty)).toBeNull();
  });
});

describe("buildRouteUrl", () => {
  it("necesita al menos dos paradas ubicables", () => {
    expect(buildRouteUrl([])).toBeNull();
    expect(buildRouteUrl([withCoords])).toBeNull();
    // una ubicable + una sin datos sigue siendo una sola
    expect(buildRouteUrl([withCoords, empty])).toBeNull();
  });

  it("usa la primera como origen y la última como destino", () => {
    const url = buildRouteUrl([withCoords, onlyAddress])!;
    expect(url).toContain("origin=-34.6%2C-58.38");
    expect(url).toContain("destination=Av.%20Siempreviva%20742%2C%20Springfield");
    expect(url).not.toContain("waypoints=");
  });

  it("manda las intermedias como waypoints en orden", () => {
    const medio = { lat: -31.42, lng: -64.18, address: "", city: "" };
    const url = buildRouteUrl([withCoords, medio, onlyAddress])!;
    expect(url).toContain("waypoints=-31.42%2C-64.18");
  });

  it("ignora las paradas sin ubicación", () => {
    const url = buildRouteUrl([withCoords, empty, onlyAddress])!;
    expect(url).not.toContain("waypoints=");
  });

  it("recorta los waypoints al máximo que acepta Google", () => {
    const many = Array.from({ length: MAX_WAYPOINTS + 10 }, (_, i) => ({
      lat: -30 - i / 100,
      lng: -60,
      address: "",
      city: "",
    }));
    const url = buildRouteUrl([withCoords, ...many, onlyAddress])!;
    const waypoints = new URL(url).searchParams.get("waypoints")!.split("|");
    expect(waypoints).toHaveLength(MAX_WAYPOINTS);
  });
});

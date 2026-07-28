import { describe, expect, it } from "vitest";

import { buildRouteUrl, stopHref, stopLocation } from "@/lib/domain/route";

const conCoords = { lat: -34.6, lng: -58.38, address: "Corrientes 100", city: "CABA" };
const soloTexto = { lat: null, lng: null, address: "Cabildo 2500", city: "CABA" };
const sinUbicacion = { lat: null, lng: null, address: "", city: "" };
const base = { lat: -34.9, lng: -57.95, address: "Casa", city: "La Plata" };

describe("stopLocation", () => {
  it("prefiere las coordenadas sobre el texto", () => {
    expect(stopLocation(conCoords)).toBe("-34.6,-58.38");
  });

  it("cae al texto cuando no hay coordenadas", () => {
    expect(stopLocation(soloTexto)).toBe("Cabildo 2500, CABA");
  });

  it("devuelve null si no hay nada ubicable", () => {
    expect(stopLocation(sinUbicacion)).toBeNull();
  });
});

describe("buildRouteUrl", () => {
  it("sin base, la primera parada oficia de origen", () => {
    const url = buildRouteUrl([conCoords, soloTexto]);
    expect(url).toContain("origin=-34.6%2C-58.38");
    expect(url).toContain("destination=Cabildo%202500%2C%20CABA");
  });

  it("con base cargada, el recorrido arranca ahí", () => {
    const url = buildRouteUrl([conCoords, soloTexto], base);
    expect(url).toContain("origin=-34.9%2C-57.95");
    // La que antes era origen pasa a ser waypoint intermedio.
    expect(url).toContain("waypoints=-34.6%2C-58.38");
  });

  it("una sola parada con base alcanza para armar ruta", () => {
    const url = buildRouteUrl([conCoords], base);
    expect(url).toContain("origin=-34.9%2C-57.95");
    expect(url).toContain("destination=-34.6%2C-58.38");
  });

  it("una sola parada sin base no es una ruta", () => {
    expect(buildRouteUrl([conCoords])).toBeNull();
  });

  it("ignora una base sin ubicación", () => {
    const url = buildRouteUrl([conCoords, soloTexto], sinUbicacion);
    expect(url).toContain("origin=-34.6%2C-58.38");
  });

  it("descarta paradas sin ubicación", () => {
    expect(buildRouteUrl([conCoords, sinUbicacion])).toBeNull();
  });
});

describe("stopHref", () => {
  it("arma el link a una parada", () => {
    expect(stopHref(conCoords)).toContain("destination=-34.6%2C-58.38");
  });

  it("devuelve null sin ubicación", () => {
    expect(stopHref(sinUbicacion)).toBeNull();
  });
});

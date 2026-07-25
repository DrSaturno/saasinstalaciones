import { describe, expect, it } from "vitest";
import {
  AR_PROVINCES,
  BR_STATES,
  haversineKm,
  installerReachesJob,
  isValidProvince,
  provincesFor,
} from "@/lib/domain/geography";

describe("taxonomía de provincias", () => {
  it("Argentina tiene 24 jurisdicciones (23 provincias + CABA)", () => {
    expect(AR_PROVINCES).toHaveLength(24);
    expect(AR_PROVINCES).toContain("Buenos Aires");
    expect(AR_PROVINCES).toContain("Ciudad Autónoma de Buenos Aires");
  });

  it("Brasil tiene 27 unidades (26 estados + DF, por sigla)", () => {
    expect(BR_STATES).toHaveLength(27);
    expect(BR_STATES).toContain("SP");
    expect(BR_STATES).toContain("DF");
  });

  it("provincesFor devuelve la lista del país", () => {
    expect(provincesFor("AR")).toBe(AR_PROVINCES);
    expect(provincesFor("BR")).toBe(BR_STATES);
  });

  it("valida provincia contra la taxonomía del país (trim incluido)", () => {
    expect(isValidProvince("AR", "Córdoba")).toBe(true);
    expect(isValidProvince("AR", "  Mendoza  ")).toBe(true);
    expect(isValidProvince("AR", "Lisboa")).toBe(false);
    expect(isValidProvince("BR", "BA")).toBe(true);
    expect(isValidProvince("BR", "Córdoba")).toBe(false);
  });
});

describe("haversineKm", () => {
  it("es 0 para el mismo punto", () => {
    const p = { lat: -34.6, lng: -58.38 };
    expect(haversineKm(p, p)).toBeCloseTo(0, 5);
  });

  it("aproxima la distancia Buenos Aires–Córdoba (~646 km)", () => {
    const ba = { lat: -34.6037, lng: -58.3816 };
    const cba = { lat: -31.4201, lng: -64.1888 };
    const d = haversineKm(ba, cba);
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(620);
    expect(d!).toBeLessThan(680);
  });

  it("devuelve null si falta una coordenada", () => {
    expect(haversineKm({ lat: -34.6, lng: null }, { lat: -31.4, lng: -64.1 })).toBeNull();
  });
});

describe("installerReachesJob", () => {
  const cordoba = { province: "Córdoba", lat: -31.4201, lng: -64.1888 };

  it("no alcanza si no cubre la provincia", () => {
    const inst = { zones: ["Buenos Aires"], baseLat: null, baseLng: null, serviceRadiusKm: null };
    expect(installerReachesJob(inst, cordoba)).toBe(false);
  });

  it("alcanza por provincia cuando no declara radio", () => {
    const inst = { zones: ["Córdoba"], baseLat: null, baseLng: null, serviceRadiusKm: null };
    expect(installerReachesJob(inst, cordoba)).toBe(true);
  });

  it("filtra por radio cuando hay base y coordenadas", () => {
    const cerca = { zones: ["Córdoba"], baseLat: -31.43, baseLng: -64.19, serviceRadiusKm: 30 };
    const lejos = { zones: ["Córdoba"], baseLat: -34.6, baseLng: -58.38, serviceRadiusKm: 30 };
    expect(installerReachesJob(cerca, cordoba)).toBe(true);
    expect(installerReachesJob(lejos, cordoba)).toBe(false);
  });

  it("con radio pero sin coordenadas del trabajo, no filtra por distancia", () => {
    const inst = { zones: ["Córdoba"], baseLat: -31.43, baseLng: -64.19, serviceRadiusKm: 30 };
    expect(installerReachesJob(inst, { province: "Córdoba", lat: null, lng: null })).toBe(true);
  });
});

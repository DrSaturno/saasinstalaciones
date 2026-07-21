import { describe, expect, it } from "vitest";
import { googleMapsHref, siteInputSchema } from "@/lib/domain/sites";

const base = {
  name: "Sucursal Centro",
  externalRef: "S-001",
  address: "Av. Corrientes 1000",
  city: "Buenos Aires",
  state: "CABA",
  zone: "AMBA",
  lat: "-34.6037",
  lng: "-58.3816",
  contactName: "Ana",
  contactPhone: "",
  contactEmail: "ana@example.com",
  openingHours: "Lunes a viernes",
  accessNotes: "",
  parkingNotes: "",
  technicalNotes: "",
  riskNotes: "",
  permanentNotes: "",
};

describe("siteInputSchema", () => {
  it("acepta una ficha completa", () => {
    expect(siteInputSchema.safeParse(base).success).toBe(true);
  });

  it("exige latitud y longitud juntas", () => {
    expect(siteInputSchema.safeParse({ ...base, lng: "" }).success).toBe(false);
  });
});

describe("googleMapsHref", () => {
  it("prioriza las coordenadas", () => {
    expect(googleMapsHref({ lat: -34.6, lng: -58.38, address: "", city: "" }))
      .toContain("-34.6%2C-58.38");
  });
});

import { describe, expect, it } from "vitest";
import { googleMapsHref, siteInputSchema } from "@/lib/domain/sites";

const base = {
  name: "Sucursal Centro",
  externalRef: "S-001",
  address: "Av. Corrientes 1000",
  city: "Buenos Aires",
  state: "CABA",
  zone: "AMBA",
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

  it("ya no pide ni acepta coordenadas: la ubicación sale de la dirección", () => {
    const parsed = siteInputSchema.safeParse({ ...base, lat: "-34.6", lng: "-58.3" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && "lat" in parsed.data).toBe(false);
    expect(parsed.success && "lng" in parsed.data).toBe(false);
  });
});

describe("googleMapsHref", () => {
  it("prioriza las coordenadas", () => {
    expect(googleMapsHref({ lat: -34.6, lng: -58.38, address: "", city: "" }))
      .toContain("-34.6%2C-58.38");
  });
});

import { describe, expect, it } from "vitest";

import {
  normalizeLocationExternalRef,
  toSiteProjection,
} from "@/lib/domain/canonical-locations";

describe("normalizeLocationExternalRef", () => {
  it("usa el mismo contrato alfanumerico que Postgres", () => {
    expect(normalizeLocationExternalRef(" YPF-001 / Norte ")).toBe("ypf001norte");
    expect(normalizeLocationExternalRef("---")).toBeNull();
    expect(normalizeLocationExternalRef(null)).toBeNull();
  });
});

describe("toSiteProjection", () => {
  it("conserva la identidad canonica en la proyeccion operativa", () => {
    const row = toSiteProjection(
      {
        id: "location-1",
        company_id: "company-1",
        client_id: "client-1",
        name: "Local Centro",
        address: "Av. Siempreviva 123",
        city: "Cordoba",
        state: "Cordoba",
        zone: "AR-CBA",
        country: "AR",
        lat: -31.4,
        lng: -64.2,
        external_ref: "LOC-1",
        contact_name: "Ana",
        contact_phone: "123",
        contact_email: "ana@example.com",
        opening_hours: "8 a 17",
        access_notes: "Porton lateral",
        parking_notes: "Carga atras",
        technical_notes: "Escalera",
        risk_notes: "Altura",
        permanent_notes: "Llamar antes",
      },
      {
        id: "project-1",
        company_id: "company-1",
        client_id: "client-1",
        country: "AR",
        zones: ["AR-CBA"],
      },
    );

    expect(row).toMatchObject({
      location_id: "location-1",
      name: "Local Centro",
      zone: "AR-CBA",
      state: "Cordoba",
      permanent_notes: "Llamar antes",
    });
  });
});

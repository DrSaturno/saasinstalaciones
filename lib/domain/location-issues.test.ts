import { describe, expect, it } from "vitest";

import {
  compareVariants,
  parseVariants,
  sortIssues,
  type LocationVariant,
} from "@/lib/domain/location-issues";

/** Caso real de producción: la misma referencia en dos ciudades distintas. */
const YPF001 = {
  matched_by: "company_client_external_ref",
  variants: [
    {
      city: "caba",
      name: "ypf - local 1",
      state: "ciudad autónoma de buenos aires",
      address: "monroe y libertador",
      contact_name: "raul perez",
      contact_phone: "114534 5676",
    },
    {
      city: "la plata",
      name: "local ypf 001",
      state: "buenos aires",
      address: "av. horizonte 473",
      contact_name: "",
      contact_phone: "",
    },
  ],
};

describe("parseVariants", () => {
  it("extrae las variantes del caso real", () => {
    const variants = parseVariants(YPF001);
    expect(variants).toHaveLength(2);
    expect(variants[0].name).toBe("ypf - local 1");
    expect(variants[1].city).toBe("la plata");
  });

  it("no rompe con un details corrupto: la cola es justamente para filas malas", () => {
    expect(parseVariants(null)).toEqual([]);
    expect(parseVariants({})).toEqual([]);
    expect(parseVariants({ variants: "no es un array" })).toEqual([]);
    expect(parseVariants({ variants: [null, 42, "x"] })).toEqual([]);
  });

  it("descarta campos que no son texto en vez de propagarlos", () => {
    const variants = parseVariants({
      variants: [{ name: "Local", city: 42, address: null }],
    });
    expect(variants).toEqual([{ name: "Local" }]);
  });

  it("ignora los campos que no participan de la comparación", () => {
    const variants = parseVariants({
      variants: [{ name: "Local", inventado: "x" }],
    });
    expect(variants[0]).not.toHaveProperty("inventado");
  });
});

describe("compareVariants", () => {
  it("señala qué campos difieren en el caso real", () => {
    const { differing, shared } = compareVariants(parseVariants(YPF001));
    // Dirección y ciudad distintas: son locales físicos distintos, no copias.
    expect(differing).toContain("address");
    expect(differing).toContain("city");
    expect(differing).toContain("name");
    expect(differing).toContain("state");
    expect(shared).toHaveLength(0);
  });

  it("un campo vacío en todas no cuenta como coincidencia", () => {
    const variants: LocationVariant[] = [
      { name: "Local 1", contact_phone: "" },
      { name: "Local 1", contact_phone: "" },
    ];
    const { differing, shared } = compareVariants(variants);
    expect(shared).toEqual(["name"]);
    expect(differing).toHaveLength(0);
  });

  it("un campo presente en una sola variante cuenta como diferencia", () => {
    const { differing } = compareVariants([
      { name: "Local", contact_name: "Ana" },
      { name: "Local" },
    ]);
    expect(differing).toEqual(["contact_name"]);
  });

  it("compara ignorando mayúsculas y espacios sobrantes", () => {
    const { shared, differing } = compareVariants([
      { name: "  Local UNO " },
      { name: "local uno" },
    ]);
    expect(shared).toEqual(["name"]);
    expect(differing).toHaveLength(0);
  });
});

describe("sortIssues", () => {
  it("pone primero los conflictos, que son los que muestran datos engañosos", () => {
    const orden = sortIssues([
      { code: "missing_external_ref", siteCount: 9, createdAt: "2026-08-01" },
      { code: "missing_client", siteCount: 1, createdAt: "2026-08-01" },
      { code: "conflicting_source_data", siteCount: 1, createdAt: "2026-08-01" },
    ] as const);
    expect(orden.map((i) => i.code)).toEqual([
      "conflicting_source_data",
      "missing_client",
      "missing_external_ref",
    ]);
  });

  it("dentro del mismo motivo, primero lo que afecta a más puntos", () => {
    const orden = sortIssues([
      { code: "conflicting_source_data", siteCount: 2, createdAt: "2026-08-01" },
      { code: "conflicting_source_data", siteCount: 7, createdAt: "2026-08-02" },
    ] as const);
    expect(orden.map((i) => i.siteCount)).toEqual([7, 2]);
  });

  it("no muta el arreglo recibido", () => {
    const original = [
      { code: "missing_client", siteCount: 1, createdAt: "2026-08-02" },
      { code: "conflicting_source_data", siteCount: 1, createdAt: "2026-08-01" },
    ] as const;
    const copia = [...original];
    sortIssues(original);
    expect(original).toEqual(copia);
  });
});

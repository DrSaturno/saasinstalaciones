import { describe, expect, it } from "vitest";
import { splitHighlight } from "@/lib/domain/text-highlight";

/** Reconstruye el texto para comprobar que resaltar nunca lo altera. */
function rebuild(segments: { text: string }[]) {
  return segments.map((segment) => segment.text).join("");
}

function matched(segments: { text: string; match: boolean }[]) {
  return segments.filter((segment) => segment.match).map((segment) => segment.text);
}

describe("splitHighlight", () => {
  it("sin búsqueda devuelve el texto entero sin marcar", () => {
    const result = splitHighlight("Material recibido", "");
    expect(result).toEqual([{ text: "Material recibido", match: false }]);
  });

  it("marca la coincidencia respetando mayúsculas del original", () => {
    const result = splitHighlight("Material recibido", "material");
    expect(matched(result)).toEqual(["Material"]);
    expect(rebuild(result)).toBe("Material recibido");
  });

  it("encuentra sin acento lo que está escrito con acento", () => {
    // La base busca con `unaccent`: si "dano" trae este mensaje pero no se
    // resalta nada, el resultado parece roto.
    const result = splitHighlight("Hay un daño en la fachada", "dano");
    expect(matched(result)).toEqual(["daño"]);
    expect(rebuild(result)).toBe("Hay un daño en la fachada");
  });

  it("y también al revés: con acento encuentra lo escrito sin acento", () => {
    const result = splitHighlight("Instalacion terminada", "instalación");
    expect(matched(result)).toEqual(["Instalacion"]);
  });

  it("separa la búsqueda igual que la base: por lo que no es letra ni número", () => {
    // "remito-material.pdf" es un solo token para Postgres si no se normaliza;
    // acá el término suelto tiene que marcar su parte.
    const result = splitHighlight("remito-material.pdf", "material");
    expect(matched(result)).toEqual(["material"]);
    expect(rebuild(result)).toBe("remito-material.pdf");
  });

  it("marca todas las apariciones, no solo la primera", () => {
    const result = splitHighlight("Material y más material", "material");
    expect(matched(result)).toEqual(["Material", "material"]);
  });

  it("marca cada palabra buscada por separado", () => {
    const result = splitHighlight("Material recibido en sucursal", "material sucursal");
    expect(matched(result)).toEqual(["Material", "sucursal"]);
  });

  it("fusiona tramos que se solapan en vez de partirlos", () => {
    const result = splitHighlight("abcdef", "abc bcd");
    expect(matched(result)).toEqual(["abcd"]);
    expect(rebuild(result)).toBe("abcdef");
  });

  it("un emoji no descoloca las posiciones", () => {
    // Un emoji ocupa dos unidades UTF-16: si se trabajara con índices de
    // string, la marca caería corrida y partiría la palabra al medio.
    const result = splitHighlight("🚧 daño en la obra", "obra");
    expect(matched(result)).toEqual(["obra"]);
    expect(rebuild(result)).toBe("🚧 daño en la obra");
  });

  it("sin coincidencias deja el texto intacto en un solo tramo", () => {
    const result = splitHighlight("Material recibido", "flete");
    expect(result).toEqual([{ text: "Material recibido", match: false }]);
  });

  it("una búsqueda de solo puntuación no marca nada", () => {
    const result = splitHighlight("Material recibido", "---");
    expect(matched(result)).toEqual([]);
    expect(rebuild(result)).toBe("Material recibido");
  });
});

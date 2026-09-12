import { describe, expect, it } from "vitest";
import { classifyClientError } from "@/lib/use-error-report";

/**
 * La etiqueta es lo único que separa "el navegador no pudo bajar el módulo"
 * de "el componente explotó". Los dos llegan al recolector como un TypeError
 * sin digest, y se arreglan en lugares distintos.
 */
describe("clasificación de crashes de cliente", () => {
  it("reconoce un chunk que no llegó, en las formas de cada navegador", () => {
    const chunkErrors = [
      Object.assign(new Error("Loading chunk 42 failed."), { name: "ChunkLoadError" }),
      new TypeError(
        "Failed to fetch dynamically imported module: https://app.test/_next/static/chunks/messages.js",
      ),
      new TypeError("Importing a module script failed."),
    ];

    for (const error of chunkErrors) {
      expect(classifyClientError(error)).toBe("chunk_load");
    }
  });

  it("reconoce un fallo de red suelto", () => {
    expect(classifyClientError(new TypeError("Failed to fetch"))).toBe("network");
    expect(classifyClientError(new TypeError("Load failed"))).toBe("network");
  });

  it("deja como 'other' lo que sí es un bug de la aplicación", () => {
    expect(
      classifyClientError(new TypeError("Cannot read properties of null (reading 'slice')")),
    ).toBe("other");
  });

  it("no arrastra el texto del error: sólo devuelve etiquetas de la lista", () => {
    const withPersonalData = new TypeError(
      "Cannot read properties of undefined (reading 'nicolas@ejemplo.com')",
    );

    expect(["chunk_load", "network", "other"]).toContain(
      classifyClientError(withPersonalData),
    );
  });
});

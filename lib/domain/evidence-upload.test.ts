import { describe, expect, it } from "vitest";
import { evidenceContentType, evidenceObjectName } from "./evidence-upload";

describe("evidenceObjectName", () => {
  it("descarta el nombre original: espacios, acentos y símbolos no llegan a la clave", () => {
    expect(evidenceObjectName("abc", "Instalación #3 (2).JPEG", "image/jpeg")).toBe("abc.jpeg");
  });

  it("sin extensión en el nombre, la toma del tipo", () => {
    expect(evidenceObjectName("abc", "image", "image/png")).toBe("abc.png");
  });

  it("sin extensión ni tipo, cae en jpg", () => {
    expect(evidenceObjectName("abc", "image", "")).toBe("abc.jpg");
  });
});

describe("evidenceContentType", () => {
  it("respeta el tipo que trae el archivo", () => {
    expect(evidenceContentType("x.jpg", "image/webp")).toBe("image/webp");
  });

  it("deduce HEIC de la extensión cuando Android no manda tipo", () => {
    expect(evidenceContentType("IMG_1234.HEIC", "")).toBe("image/heic");
  });

  it("sin pistas, declara jpeg (permitido por el bucket) en vez de octet-stream", () => {
    expect(evidenceContentType("foto", "")).toBe("image/jpeg");
  });
});

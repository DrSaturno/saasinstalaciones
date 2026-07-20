import { describe, expect, it } from "vitest";
import { parseCsv, detectDelimiter, normalizeHeader } from "./csv";

describe("detectDelimiter", () => {
  it("detecta punto y coma (Excel es-AR / pt-BR)", () => {
    expect(detectDelimiter("nombre;direccion;ciudad")).toBe(";");
  });

  it("detecta coma", () => {
    expect(detectDelimiter("nombre,direccion,ciudad")).toBe(",");
  });

  it("elige el separador mayoritario cuando hay comas dentro de los datos", () => {
    expect(detectDelimiter("nombre;direccion;ciudad\nA;Av. Roca 1, piso 2;CABA")).toBe(";");
  });
});

describe("parseCsv", () => {
  it("parsea filas simples", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("respeta el delimitador dentro de comillas", () => {
    const rows = parseCsv('nombre,direccion\n"Estación 1","Av. Roca 1234, piso 2"');
    expect(rows[1]).toEqual(["Estación 1", "Av. Roca 1234, piso 2"]);
  });

  it("maneja comillas escapadas", () => {
    const rows = parseCsv('a\n"dijo ""hola"""');
    expect(rows[1]).toEqual(['dijo "hola"']);
  });

  it("soporta CRLF de Windows", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("ignora filas vacías", () => {
    expect(parseCsv("a,b\n\n1,2\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("quita el BOM que agrega Excel", () => {
    const rows = parseCsv("﻿nombre,ciudad\nA,B");
    expect(rows[0][0]).toBe("nombre");
  });

  it("soporta saltos de línea dentro de un campo entrecomillado", () => {
    const rows = parseCsv('a,b\n"linea1\nlinea2",x');
    expect(rows[1]).toEqual(["linea1\nlinea2", "x"]);
  });
});

describe("normalizeHeader", () => {
  it("saca acentos, mayúsculas y espacios", () => {
    expect(normalizeHeader("Dirección")).toBe("direccion");
    expect(normalizeHeader("Código Externo")).toBe("codigoexterno");
    expect(normalizeHeader("  ZONA  ")).toBe("zona");
  });
});

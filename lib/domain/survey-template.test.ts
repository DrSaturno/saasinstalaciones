import { describe, expect, it } from "vitest";
import {
  hasEnoughToSubmit,
  parseSurveyTemplate,
  splitAnswers,
  type SurveyField,
} from "@/lib/domain/survey-template";

const plantilla: SurveyField[] = [
  { key: "ancho_m", label: "Ancho", type: "measure", unit: "m" },
  { key: "acceso", label: "¿Hay acceso?", type: "check" },
  { key: "obs", label: "Observaciones", type: "text" },
];

describe("leer la plantilla", () => {
  it("acepta una definición bien formada", () => {
    expect(parseSurveyTemplate(plantilla)).toHaveLength(3);
  });

  it("descarta los campos rotos pero conserva los buenos", () => {
    // Si la plantilla de una empresa quedó con basura, el instalador tiene que
    // poder relevar igual con lo que sí está bien.
    const sucia = [
      { key: "ok", label: "Bueno", type: "text" },
      { key: "", label: "Sin clave", type: "text" },
      { key: "sin_label", type: "text" },
      { key: "tipo_raro", label: "X", type: "firma" },
      "no es un objeto",
      null,
    ];
    expect(parseSurveyTemplate(sucia).map((f) => f.key)).toEqual(["ok"]);
  });

  it("descarta claves repetidas: la segunda pisaría a la primera al guardar", () => {
    const repetida = [
      { key: "ancho", label: "Ancho A", type: "measure" },
      { key: "ancho", label: "Ancho B", type: "measure" },
    ];
    const campos = parseSurveyTemplate(repetida);
    expect(campos).toHaveLength(1);
    expect(campos[0].label).toBe("Ancho A");
  });

  it("una definición que no es un array no rompe nada", () => {
    expect(parseSurveyTemplate(null)).toEqual([]);
    expect(parseSurveyTemplate({ campos: [] })).toEqual([]);
    expect(parseSurveyTemplate("[]")).toEqual([]);
  });
});

describe("repartir las respuestas", () => {
  it("cada tipo va a su columna", () => {
    const resultado = splitAnswers(plantilla, {
      ancho_m: "3.2",
      acceso: true,
      obs: "  Pared con revoque flojo  ",
    });
    expect(resultado.measurements).toEqual({ ancho_m: 3.2 });
    expect(resultado.checklist).toEqual({ acceso: true });
    expect(resultado.formData).toEqual({ obs: "Pared con revoque flojo" });
  });

  it("acepta la coma decimal, que es como se escribe acá", () => {
    expect(splitAnswers(plantilla, { ancho_m: "3,45" }).measurements).toEqual({
      ancho_m: 3.45,
    });
  });

  it("una medición que no es un número se descarta, no se guarda como NaN", () => {
    // Un NaN en la base contamina cualquier cálculo posterior.
    expect(splitAnswers(plantilla, { ancho_m: "como tres metros" }).measurements).toEqual(
      {},
    );
  });

  it("un casillero sin marcar queda en false, no ausente", () => {
    // Ausente y "no" son cosas distintas: una es que no lo miró.
    expect(splitAnswers(plantilla, {}).checklist).toEqual({ acceso: false });
  });

  it("los textos vacíos no se guardan", () => {
    expect(splitAnswers(plantilla, { obs: "   " }).formData).toEqual({});
  });
});

describe("cuándo se puede enviar", () => {
  it("sólo casilleros marcados no alcanza", () => {
    // Un relevamiento donde nadie midió ni describió nada no le sirve al
    // coordinador para planificar.
    expect(hasEnoughToSubmit(plantilla, { acceso: true })).toBe(false);
  });

  it("una medición alcanza", () => {
    expect(hasEnoughToSubmit(plantilla, { ancho_m: "3" })).toBe(true);
  });

  it("un texto también", () => {
    expect(hasEnoughToSubmit(plantilla, { obs: "Pared de chapa" })).toBe(true);
  });

  it("vacío no", () => {
    expect(hasEnoughToSubmit(plantilla, {})).toBe(false);
  });
});

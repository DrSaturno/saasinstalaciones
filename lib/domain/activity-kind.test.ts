import { describe, expect, it } from "vitest";
import {
  activitiesFor,
  requiresStartDate,
  type OrderActivityKind,
} from "@/lib/domain/activity-kind";

describe("qué actividades lleva una orden", () => {
  it("sólo ejecución: lo que hacían todas las órdenes hasta ahora", () => {
    expect(activitiesFor("execution")).toEqual({
      includeSurvey: false,
      includeExecution: true,
    });
  });

  it("sólo relevamiento: el caso que el requisito agrega", () => {
    expect(activitiesFor("survey")).toEqual({
      includeSurvey: true,
      includeExecution: false,
    });
  });

  it("las dos: el relevamiento es una etapa previa", () => {
    expect(activitiesFor("both")).toEqual({
      includeSurvey: true,
      includeExecution: true,
    });
  });

  it("ninguna combinación queda vacía", () => {
    const kinds: OrderActivityKind[] = ["execution", "survey", "both"];
    for (const kind of kinds) {
      const { includeSurvey, includeExecution } = activitiesFor(kind);
      expect(includeSurvey || includeExecution).toBe(true);
    }
  });
});

describe("cuándo se exige fecha de inicio", () => {
  it("un relevamiento puede no tener fecha todavía", () => {
    // El requisito: "la fecha de realización deberá ser opcional hasta que
    // pueda ser definida".
    expect(requiresStartDate("survey")).toBe(false);
  });

  it("un trabajo que se va a ejecutar sí la necesita", () => {
    expect(requiresStartDate("execution")).toBe(true);
    expect(requiresStartDate("both")).toBe(true);
  });
});

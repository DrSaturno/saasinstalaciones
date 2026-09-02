import { describe, expect, it } from "vitest";

import {
  derivedWorkConditions,
  parseExplicitConditions,
  workConditionsOf,
} from "@/lib/domain/work-conditions";

describe("parseExplicitConditions", () => {
  it("acepta las condiciones del catálogo", () => {
    expect(parseExplicitConditions(["altura", "nocturno"])).toEqual([
      "altura",
      "nocturno",
    ]);
  });

  it("descarta lo que no está en el catálogo", () => {
    // Llega del cliente: no se puede confiar en que sea una condición válida.
    expect(parseExplicitConditions(["altura", "dificil", 7, null])).toEqual([
      "altura",
    ]);
  });

  it("no permite inventar dificultad repitiendo una condición", () => {
    expect(parseExplicitConditions(["altura", "altura", "altura"])).toEqual([
      "altura",
    ]);
  });

  it("devuelve siempre el mismo orden, sin importar cómo se tildaron", () => {
    // Dos órdenes con las mismas condiciones tienen que verse igual.
    expect(parseExplicitConditions(["nocturno", "altura"])).toEqual(
      parseExplicitConditions(["altura", "nocturno"]),
    );
  });

  it("una orden sin condiciones no tiene ninguna", () => {
    expect(parseExplicitConditions([])).toEqual([]);
  });
});

describe("condiciones derivadas de la orden", () => {
  it("estar a la intemperie es condición; estar bajo techo no", () => {
    expect(derivedWorkConditions({ indoor: false, requiresFreight: false })).toEqual([
      "exterior",
    ]);
    expect(derivedWorkConditions({ indoor: true, requiresFreight: false })).toEqual(
      [],
    );
  });

  it("el flete sale de la columna que ya existe", () => {
    expect(derivedWorkConditions({ indoor: true, requiresFreight: true })).toEqual([
      "flete",
    ]);
  });
});

describe("workConditionsOf", () => {
  it("junta las declaradas con las derivadas", () => {
    expect(
      workConditionsOf(["altura"], { indoor: false, requiresFreight: true }),
    ).toEqual(["altura", "exterior", "flete"]);
  });

  it("no deja que una condición derivada se declare a mano y se cuente dos veces", () => {
    // `exterior` no es declarable: se descarta al parsear y vuelve a entrar una
    // sola vez por la derivación. Si se contara dos veces, la dificultad
    // dependería de si alguien la tildó además de que la orden ya lo dijera.
    expect(
      workConditionsOf(["exterior"], { indoor: false, requiresFreight: false }),
    ).toEqual(["exterior"]);
  });

  it("un trabajo bajo techo, sin flete y sin condiciones no tiene ninguna", () => {
    expect(workConditionsOf([], { indoor: true, requiresFreight: false })).toEqual(
      [],
    );
  });
});

import { describe, expect, it } from "vitest";
import { resolveBatchScope } from "@/lib/domain/order-batch";

const proyecto = ["s1", "s2", "s3", "s4"];

describe("resolveBatchScope", () => {
  it("sin elección, genera sólo en las que no tienen orden", () => {
    const scope = resolveBatchScope({
      projectSiteIds: proyecto,
      sitesWithOrders: new Set(["s1", "s2"]),
      requestedSiteIds: [],
    });
    expect(scope.toCreate).toEqual(["s3", "s4"]);
    expect(scope.skipped).toBe(2);
    expect(scope.revisits).toBe(0);
  });

  it("el caso que antes era imposible: segunda vuelta sobre TODAS", () => {
    // 200 locales ya trabajados y un imprevisto que obliga a volver a todos.
    // Con el alcance deducido esto daba cero, porque ninguna estaba libre.
    const scope = resolveBatchScope({
      projectSiteIds: proyecto,
      sitesWithOrders: new Set(proyecto),
      requestedSiteIds: proyecto,
    });
    expect(scope.toCreate).toEqual(proyecto);
    expect(scope.revisits).toBe(4);
  });

  it("cuenta como revisita sólo lo que ya tenía orden", () => {
    const scope = resolveBatchScope({
      projectSiteIds: proyecto,
      sitesWithOrders: new Set(["s1"]),
      requestedSiteIds: ["s1", "s3"],
    });
    expect(scope.toCreate).toEqual(["s1", "s3"]);
    expect(scope.revisits).toBe(1);
  });

  it("descarta locaciones que no son del proyecto", () => {
    // Los ids llegan en el cuerpo del pedido: uno de otro proyecto no entra
    // por venir escrito.
    const scope = resolveBatchScope({
      projectSiteIds: proyecto,
      sitesWithOrders: new Set(),
      requestedSiteIds: ["s1", "de-otro-proyecto", "s2"],
    });
    expect(scope.toCreate).toEqual(["s1", "s2"]);
  });

  it("no crea dos órdenes si la misma locación viene repetida", () => {
    const scope = resolveBatchScope({
      projectSiteIds: proyecto,
      sitesWithOrders: new Set(),
      requestedSiteIds: ["s1", "s1", "s1"],
    });
    expect(scope.toCreate).toEqual(["s1"]);
  });

  it("una elección que queda vacía no cae de vuelta al alcance deducido", () => {
    // Si todos los ids elegidos eran ajenos, la respuesta correcta es «nada»,
    // no «entonces generá en las que faltan»: elegir explícitamente y recibir
    // un lote que nadie pidió sería peor que no crear nada.
    const scope = resolveBatchScope({
      projectSiteIds: proyecto,
      sitesWithOrders: new Set(["s1"]),
      requestedSiteIds: ["ajena-1", "ajena-2"],
    });
    expect(scope.toCreate).toEqual([]);
  });
});

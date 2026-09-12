import { describe, expect, it } from "vitest";
import { ordersToFinish, resolveBatchScope } from "@/lib/domain/order-batch";

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

describe("ordersToFinish", () => {
  it("procesa lo que acaba de insertar", () => {
    expect(
      ordersToFinish({
        insertedIds: ["o1", "o2"],
        batchOrders: [
          { id: "o1", activityCount: 0 },
          { id: "o2", activityCount: 0 },
        ],
      }),
    ).toEqual(["o1", "o2"]);
  });

  it("recupera las que dejó a medias un intento anterior", () => {
    // El caso que importa: el bucle se cortó por tiempo, `o1` y `o2` quedaron
    // sin actividad, y el reintento no inserta nada porque el índice único del
    // lote lo frena. Antes esas dos quedaban rotas para siempre.
    expect(
      ordersToFinish({
        insertedIds: [],
        batchOrders: [
          { id: "o1", activityCount: 0 },
          { id: "o2", activityCount: 0 },
          { id: "o3", activityCount: 1 },
        ],
      }),
    ).toEqual(["o1", "o2"]);
  });

  it("no vuelve a tocar las que ya están terminadas", () => {
    expect(
      ordersToFinish({
        insertedIds: [],
        batchOrders: [
          { id: "o1", activityCount: 1 },
          { id: "o2", activityCount: 2 },
        ],
      }),
    ).toEqual([]);
  });

  it("no repite una orden que está en las dos listas", () => {
    // La consulta del lote devuelve también las recién insertadas, y todavía
    // sin actividad. Procesarlas dos veces sería pedirle a la compuerta de
    // asignación el mismo trabajo de nuevo, contando un aviso de más.
    expect(
      ordersToFinish({
        insertedIds: ["o1"],
        batchOrders: [{ id: "o1", activityCount: 0 }],
      }),
    ).toEqual(["o1"]);
  });

  it("tolera ids repetidos en lo insertado", () => {
    expect(
      ordersToFinish({ insertedIds: ["o1", "o1"], batchOrders: [] }),
    ).toEqual(["o1"]);
  });

  it("mezcla lo nuevo con lo reparado, sin perder el orden", () => {
    expect(
      ordersToFinish({
        insertedIds: ["o3"],
        batchOrders: [
          { id: "o1", activityCount: 0 },
          { id: "o2", activityCount: 1 },
          { id: "o3", activityCount: 0 },
        ],
      }),
    ).toEqual(["o3", "o1"]);
  });
});

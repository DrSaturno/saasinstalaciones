import { describe, expect, it } from "vitest";
import {
  findScheduleConflicts,
  rangesOverlap,
  type ScheduledOrder,
} from "@/lib/domain/schedule-conflicts";

const orden = (over: Partial<ScheduledOrder> = {}): ScheduledOrder => ({
  id: "otra",
  orderNumber: "OT-2",
  title: "Otro trabajo",
  scheduledDate: "2026-09-08",
  scheduledEndDate: null,
  ...over,
});

describe("solapamiento de rangos", () => {
  it("un mismo día suelto choca consigo mismo", () => {
    expect(
      rangesOverlap({ start: "2026-09-08", end: null }, { start: "2026-09-08", end: null }),
    ).toBe(true);
  });

  it("días distintos no chocan", () => {
    expect(
      rangesOverlap({ start: "2026-09-08", end: null }, { start: "2026-09-09", end: null }),
    ).toBe(false);
  });

  it("los bordes cuentan: terminar el día que el otro empieza es un choque", () => {
    // El instalador no puede estar en dos puntos el mismo día.
    expect(
      rangesOverlap(
        { start: "2026-09-05", end: "2026-09-08" },
        { start: "2026-09-08", end: "2026-09-10" },
      ),
    ).toBe(true);
  });

  it("un rango contenido dentro de otro choca", () => {
    expect(
      rangesOverlap(
        { start: "2026-09-05", end: "2026-09-15" },
        { start: "2026-09-08", end: "2026-09-09" },
      ),
    ).toBe(true);
  });

  it("una fecha final anterior al inicio se trata como un solo día", () => {
    // Dato roto: se degrada al día de inicio en vez de invertir el rango y
    // reportar un choque que no existe.
    expect(
      rangesOverlap(
        { start: "2026-09-10", end: "2026-09-01" },
        { start: "2026-09-05", end: null },
      ),
    ).toBe(false);
  });
});

describe("choques de la agenda del instalador", () => {
  const propuesta = { start: "2026-09-08", end: "2026-09-09" };

  it("encuentra la orden que se pisa", () => {
    const choques = findScheduleConflicts([orden()], propuesta, "esta");
    expect(choques.map((c) => c.orderNumber)).toEqual(["OT-2"]);
  });

  it("no se reporta a sí misma como choque", () => {
    // La orden que se está reprogramando siempre se pisaría consigo misma.
    const choques = findScheduleConflicts(
      [orden({ id: "esta", orderNumber: "OT-1" })],
      propuesta,
      "esta",
    );
    expect(choques).toEqual([]);
  });

  it("ignora las órdenes sin fecha comprometida", () => {
    expect(
      findScheduleConflicts([orden({ scheduledDate: null })], propuesta, "esta"),
    ).toEqual([]);
  });

  it("devuelve varias cuando la fecha nueva pisa a más de una", () => {
    const choques = findScheduleConflicts(
      [
        orden({ id: "a", orderNumber: "OT-A", scheduledDate: "2026-09-08" }),
        orden({ id: "b", orderNumber: "OT-B", scheduledDate: "2026-09-09" }),
        orden({ id: "c", orderNumber: "OT-C", scheduledDate: "2026-09-20" }),
      ],
      propuesta,
      "esta",
    );
    expect(choques.map((c) => c.orderNumber)).toEqual(["OT-A", "OT-B"]);
  });

  it("sin otras órdenes no hay nada que avisar", () => {
    expect(findScheduleConflicts([], propuesta, "esta")).toEqual([]);
  });
});

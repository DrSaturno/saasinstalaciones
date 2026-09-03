import { describe, expect, it } from "vitest";

import {
  absenceOverlaps,
  effectiveWeeklyWindows,
  isBlockedByAbsence,
} from "@/lib/domain/availability-precedence";

const lunes = (startsAt: string, endsAt: string) => ({
  weekday: 1,
  startsAt,
  endsAt,
});

describe("precedencia entre la disponibilidad personal y la de la empresa", () => {
  it("una empresa no puede ampliar lo que la persona ofrece", () => {
    // La regla entera de AG-R9: si la empresa pudiera ampliar, la
    // disponibilidad personal no serviría de nada.
    expect(
      effectiveWeeklyWindows([lunes("09:00", "17:00")], [lunes("08:00", "20:00")]),
    ).toEqual([lunes("09:00", "17:00")]);
  });

  it("pero sí puede pedir menos", () => {
    expect(
      effectiveWeeklyWindows([lunes("09:00", "17:00")], [lunes("10:00", "14:00")]),
    ).toEqual([lunes("10:00", "14:00")]);
  });

  it("toma la intersección cuando se solapan a medias", () => {
    expect(
      effectiveWeeklyWindows([lunes("09:00", "13:00")], [lunes("11:00", "18:00")]),
    ).toEqual([lunes("11:00", "13:00")]);
  });

  it("sin intersección no queda ninguna ventana", () => {
    expect(
      effectiveWeeklyWindows([lunes("09:00", "12:00")], [lunes("14:00", "18:00")]),
    ).toEqual([]);
  });

  it("días distintos no se mezclan", () => {
    const domingo = { weekday: 0, startsAt: "09:00", endsAt: "17:00" };
    expect(effectiveWeeklyWindows([domingo], [lunes("09:00", "17:00")])).toEqual([]);
  });

  it("no declarar nada no es declarar que no", () => {
    // Quien todavía no cargó su disponibilidad global no queda bloqueado en
    // todas partes: manda la de la empresa.
    expect(effectiveWeeklyWindows([], [lunes("08:00", "20:00")])).toEqual([
      lunes("08:00", "20:00"),
    ]);
  });

  it("y si la empresa no declaró nada, manda la de la persona", () => {
    expect(effectiveWeeklyWindows([lunes("09:00", "17:00")], [])).toEqual([
      lunes("09:00", "17:00"),
    ]);
  });
});

describe("ausencias", () => {
  const ausencia = {
    startsAt: "2026-09-10T00:00:00Z",
    endsAt: "2026-09-15T00:00:00Z",
  };

  it("tapa un trabajo que cae adentro", () => {
    expect(
      absenceOverlaps(ausencia, {
        startsAt: "2026-09-12T13:00:00Z",
        endsAt: "2026-09-12T18:00:00Z",
      }),
    ).toBe(true);
  });

  it("tapa también uno que empieza antes y termina adentro", () => {
    expect(
      absenceOverlaps(ausencia, {
        startsAt: "2026-09-09T20:00:00Z",
        endsAt: "2026-09-10T04:00:00Z",
      }),
    ).toBe(true);
  });

  it("un trabajo que arranca justo cuando la ausencia termina no choca", () => {
    // Los extremos no se pisan: volver el mismo día que termina la licencia es
    // válido, y tratarlo como conflicto sería bloquear de más.
    expect(
      absenceOverlaps(ausencia, {
        startsAt: "2026-09-15T00:00:00Z",
        endsAt: "2026-09-15T06:00:00Z",
      }),
    ).toBe(false);
  });

  it("alcanza con que una ausencia de la lista lo tape", () => {
    const otra = {
      startsAt: "2026-10-01T00:00:00Z",
      endsAt: "2026-10-05T00:00:00Z",
    };
    expect(
      isBlockedByAbsence([otra, ausencia], {
        startsAt: "2026-09-12T13:00:00Z",
        endsAt: "2026-09-12T18:00:00Z",
      }),
    ).toBe(true);
  });

  it("sin ausencias no hay nada que tape", () => {
    expect(
      isBlockedByAbsence([], {
        startsAt: "2026-09-12T13:00:00Z",
        endsAt: "2026-09-12T18:00:00Z",
      }),
    ).toBe(false);
  });
});

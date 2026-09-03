import { describe, expect, it } from "vitest";

import {
  canDecideConflict,
  endFromDuration,
  endsNextDay,
  isValidTime,
  precisionFor,
} from "@/lib/domain/schedule-precision";

describe("horas válidas", () => {
  it("acepta el formato de 24 horas", () => {
    expect(isValidTime("00:00")).toBe(true);
    expect(isValidTime("23:59")).toBe(true);
    expect(isValidTime("09:30")).toBe(true);
  });

  it("rechaza lo que no es una hora del reloj", () => {
    for (const value of ["24:00", "9:30", "12:60", "", "mañana", null]) {
      expect(isValidTime(value)).toBe(false);
    }
  });
});

describe("fin derivado de la duración", () => {
  it("suma los minutos estimados al inicio", () => {
    expect(endFromDuration("09:00", 90)).toBe("10:30");
  });

  it("da la vuelta al reloj en un trabajo nocturno", () => {
    // `nocturno` es una de las condiciones de dificultad: trabajar de noche es
    // un caso real del negocio, no una entrada inválida.
    expect(endFromDuration("22:00", 180)).toBe("01:00");
    expect(endsNextDay("22:00", "01:00")).toBe(true);
    expect(endsNextDay("09:00", "17:00")).toBe(false);
  });

  it("no inventa un fin con una duración que no sirve", () => {
    expect(endFromDuration("09:00", 0)).toBeNull();
    expect(endFromDuration("09:00", -30)).toBeNull();
    expect(endFromDuration("nueve", 60)).toBeNull();
  });
});

describe("precisión según lo que efectivamente se cargó", () => {
  const base = { date: "2026-09-10", startTime: null, endTime: null, durationMinutes: null };

  it("sin fecha no se sabe nada", () => {
    expect(precisionFor({ ...base, date: null })).toBe("unknown");
  });

  it("con fecha y sin hora, el día", () => {
    expect(precisionFor(base)).toBe("day");
  });

  it("con inicio y fin, exacta", () => {
    expect(
      precisionFor({ ...base, startTime: "14:00", endTime: "18:00" }),
    ).toBe("exact");
  });

  it("con inicio y duración también, porque el fin se deriva", () => {
    expect(
      precisionFor({ ...base, startTime: "14:00", durationMinutes: 240 }),
    ).toBe("exact");
  });

  it("con inicio solo, sigue siendo el día: no se inventa una franja", () => {
    // AC-11-C: a una orden sin hora de fin no se le fabrica una para poder
    // bloquearla o penalizarla.
    expect(precisionFor({ ...base, startTime: "14:00" })).toBe("day");
  });

  it("una hora malformada no asciende la precisión", () => {
    expect(
      precisionFor({ ...base, startTime: "25:00", endTime: "18:00" }),
    ).toBe("day");
  });
});

describe("cuándo se puede afirmar que hay o no conflicto", () => {
  it("sólo entre dos agendas exactas", () => {
    expect(canDecideConflict("exact", "exact")).toBe(true);
  });

  it("no verificable no es lo mismo que sin conflicto (AG-R10)", () => {
    // Dos trabajos el mismo día en ciudades distintas, sin hora, no son un
    // choque demostrable — pero tampoco un visto bueno.
    expect(canDecideConflict("day", "day")).toBe(false);
    expect(canDecideConflict("exact", "day")).toBe(false);
    expect(canDecideConflict("exact", "unknown")).toBe(false);
    expect(canDecideConflict("unknown", "unknown")).toBe(false);
  });
});

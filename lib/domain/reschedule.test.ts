import { describe, expect, it } from "vitest";
import {
  dateKeyInTimeZone,
  rescheduleHarmsReliability,
  rescheduleState,
  responseDeadline,
  type RescheduleSource,
} from "@/lib/domain/reschedule";

const TZ = "America/Argentina/Buenos_Aires";

const base: RescheduleSource = {
  notifiedAt: null,
  response: null,
  respondedAt: null,
  supersededAt: null,
  responseWindowDays: 2,
};

describe("estado derivado de una reprogramación", () => {
  it("sin notificar, el plazo no existe todavía", () => {
    // El requisito es explícito: la notificación es condición para que el
    // plazo empiece a correr.
    const state = rescheduleState(base, "2026-08-20", TZ);
    expect(state.kind).toBe("not_notified");
    expect(responseDeadline(base, TZ)).toBeNull();
  });

  it("cuenta dos días hábiles desde la notificación, salteando el fin de semana", () => {
    // Notificado un viernes: el plazo vence el martes, no el domingo.
    const source = { ...base, notifiedAt: "2026-08-14T15:00:00-03:00" };
    expect(responseDeadline(source, TZ)).toBe("2026-08-18");
  });

  it("respeta los feriados del calendario", () => {
    const source = { ...base, notifiedAt: "2026-08-14T15:00:00-03:00" };
    const calendar = { holidays: new Set(["2026-08-17"]) };
    expect(responseDeadline(source, TZ, calendar)).toBe("2026-08-19");
  });

  it("no vence el mismo día del vencimiento, sí al día siguiente", () => {
    const source = { ...base, notifiedAt: "2026-08-14T15:00:00-03:00" };
    expect(rescheduleState(source, "2026-08-18", TZ).kind).toBe("awaiting");
    expect(rescheduleState(source, "2026-08-19", TZ).kind).toBe("expired");
  });

  it("una respuesta dentro del plazo queda marcada como en término", () => {
    const source = {
      ...base,
      notifiedAt: "2026-08-14T15:00:00-03:00",
      response: "declined" as const,
      respondedAt: "2026-08-18T10:00:00-03:00",
    };
    const state = rescheduleState(source, "2026-08-25", TZ);
    expect(state).toEqual({ kind: "answered", response: "declined", onTime: true });
    // Darse de baja en plazo no penaliza, aunque la respuesta sea "no".
    expect(rescheduleHarmsReliability(state)).toBe(false);
  });

  it("una reprogramación superada por otra no vence ni penaliza", () => {
    // La empresa volvió a mover la fecha antes de que contestara: castigarlo
    // por no responder una pregunta que ya no es la vigente sería injusto.
    const source = {
      ...base,
      notifiedAt: "2026-08-14T15:00:00-03:00",
      supersededAt: "2026-08-15T09:00:00-03:00",
    };
    const state = rescheduleState(source, "2026-09-30", TZ);
    expect(state.kind).toBe("superseded");
    expect(rescheduleHarmsReliability(state)).toBe(false);
  });

  it("sólo el silencio tras una notificación correcta afecta la confiabilidad", () => {
    const source = { ...base, notifiedAt: "2026-08-14T15:00:00-03:00" };
    expect(rescheduleHarmsReliability(rescheduleState(source, "2026-08-25", TZ))).toBe(true);
    expect(rescheduleHarmsReliability(rescheduleState(base, "2026-08-25", TZ))).toBe(false);
  });

  it("informa cuántos días hábiles quedan", () => {
    const source = { ...base, notifiedAt: "2026-08-14T15:00:00-03:00" };
    const state = rescheduleState(source, "2026-08-17", TZ);
    expect(state).toEqual({
      kind: "awaiting",
      deadline: "2026-08-18",
      businessDaysLeft: 1,
    });
  });
});

describe("día calendario según zona horaria", () => {
  it("un aviso de la noche pertenece al día local, no al día UTC", () => {
    // 22:00 en Buenos Aires ya es el día siguiente en UTC. Tomar el día UTC
    // le correría el plazo un día entero.
    const tarde = "2026-08-14T22:00:00-03:00";
    expect(new Date(tarde).toISOString().slice(0, 10)).toBe("2026-08-15");
    expect(dateKeyInTimeZone(tarde, TZ)).toBe("2026-08-14");
  });

  it("funciona igual para São Paulo", () => {
    expect(dateKeyInTimeZone("2026-08-14T23:30:00-03:00", "America/Sao_Paulo")).toBe(
      "2026-08-14",
    );
  });

  it("rechaza un instante inválido", () => {
    expect(() => dateKeyInTimeZone("no es una fecha", TZ)).toThrow("invalid_instant");
  });
});

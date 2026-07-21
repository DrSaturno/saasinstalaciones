import { describe, expect, it } from "vitest";
import { isInstallerAvailableAt, weeklyAvailabilitySchema } from "@/lib/domain/availability";

describe("weeklyAvailabilitySchema", () => {
  it("rechaza un horario invertido", () => {
    expect(weeklyAvailabilitySchema.safeParse([{ weekday: 1, startsAt: "18:00", endsAt: "09:00", timezone: "America/Argentina/Buenos_Aires" }]).success).toBe(false);
  });
});

describe("isInstallerAvailableAt", () => {
  it("prioriza una excepción justificada", () => {
    const result = isInstallerAvailableAt({
      enabled: true,
      weekly: [],
      exceptions: [{ startsAt: "2026-07-21T10:00:00.000Z", endsAt: "2026-07-22T10:00:00.000Z", reason: "Turno médico" }],
      at: new Date("2026-07-21T12:00:00.000Z"),
    });
    expect(result).toEqual({ available: false, reason: "Turno médico" });
  });
});

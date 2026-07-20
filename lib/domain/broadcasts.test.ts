import { describe, expect, it } from "vitest";
import {
  applicationSchema,
  createBroadcastSchema,
  resolveApplicationSchema,
} from "@/lib/domain/broadcasts";

const ID = "11111111-1111-4111-8111-111111111111";

describe("broadcast schemas", () => {
  it("normaliza la zona y convierte cupos de FormData", () => {
    const parsed = createBroadcastSchema.parse({
      projectId: ID,
      zone: " ar-cba ",
      title: "Refuerzo Córdoba",
      description: "Seis estaciones",
      slots: "2",
    });
    expect(parsed.zone).toBe("AR-CBA");
    expect(parsed.slots).toBe(2);
  });

  it("rechaza cupos fuera del rango", () => {
    expect(
      createBroadcastSchema.safeParse({
        projectId: ID,
        zone: "AR-CBA",
        title: "Refuerzo Córdoba",
        description: "",
        slots: 0,
      }).success,
    ).toBe(false);
  });

  it("normaliza mensajes vacíos a null", () => {
    expect(
      applicationSchema.parse({ broadcastId: ID, message: "   " }).message,
    ).toBeNull();
  });

  it("limita una aceptación a 100 órdenes válidas", () => {
    expect(
      resolveApplicationSchema.safeParse({
        broadcastId: ID,
        installerId: ID,
        orderIds: Array.from({ length: 101 }, () => ID),
      }).success,
    ).toBe(false);
  });
});

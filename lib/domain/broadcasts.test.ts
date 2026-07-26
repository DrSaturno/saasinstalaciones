import { describe, expect, it } from "vitest";
import {
  applicationSchema,
  createBroadcastSchema,
  resolveApplicationSchema,
} from "@/lib/domain/broadcasts";

const ID = "11111111-1111-4111-8111-111111111111";

describe("broadcast schemas", () => {
  it("conserva la provincia tal cual y convierte cupos de FormData", () => {
    const parsed = createBroadcastSchema.parse({
      projectId: ID,
      zone: " Córdoba ",
      title: "Refuerzo Córdoba",
      description: "Seis estaciones",
      slots: "2",
    });
    // No se normaliza a mayúsculas: tiene que coincidir exactamente con la
    // provincia declarada en installers.zones para que el matching funcione.
    expect(parsed.zone).toBe("Córdoba");
    expect(parsed.slots).toBe(2);
  });

  it("exige las dos coordenadas o ninguna", () => {
    const base = {
      projectId: ID,
      zone: "Córdoba",
      title: "Refuerzo Córdoba",
      description: "",
      slots: "1",
    };
    expect(createBroadcastSchema.safeParse(base).success).toBe(true);
    expect(
      createBroadcastSchema.safeParse({ ...base, lat: "-31.42", lng: "-64.18" }).success,
    ).toBe(true);
    expect(createBroadcastSchema.safeParse({ ...base, lat: "-31.42" }).success).toBe(false);
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

  it("acepta UUID históricos de Postgres aunque no declaren versión RFC", () => {
    expect(
      resolveApplicationSchema.safeParse({
        broadcastId: "33333333-3333-3333-3333-333333333333",
        installerId: "a0000000-0000-0000-0000-000000000005",
        orderIds: ["44444444-4444-4444-4444-444444444444"],
      }).success,
    ).toBe(true);
  });
});

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

  it("la dirección aproximada es opcional y ya no existen las coordenadas", () => {
    const base = {
      projectId: ID,
      zone: "Córdoba",
      title: "Refuerzo Córdoba",
      description: "",
      slots: "1",
    };
    const sinDireccion = createBroadcastSchema.safeParse(base);
    expect(sinDireccion.success).toBe(true);
    expect(sinDireccion.success && sinDireccion.data.address).toBe("");
    const conDireccion = createBroadcastSchema.safeParse({ ...base, address: "  Av. Colón 100, Córdoba " });
    expect(conDireccion.success && conDireccion.data.address).toBe("Av. Colón 100, Córdoba");
    // Lo que alguien mande por afuera del formulario no se cuela al resultado.
    const conCoordenadas = createBroadcastSchema.safeParse({ ...base, lat: "-31.42", lng: "-64.18" });
    expect(conCoordenadas.success && "lat" in conCoordenadas.data).toBe(false);
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

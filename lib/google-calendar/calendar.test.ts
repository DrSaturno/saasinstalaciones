import { describe, expect, it, vi } from "vitest";
import type { OAuth2Client } from "google-auth-library";
import { companyCalendarName, ensureCompanyCalendar } from "@/lib/google-calendar/calendar";

/** Un cliente de Google falso: `request` responde según la URL y el método. */
function fakeClient(handler: (config: { url: string; method: string }) => unknown) {
  const request = vi.fn(async (config: { url: string; method: string }) => {
    const result = handler(config);
    if (result instanceof Error) throw result;
    return { data: result };
  });
  return { client: { request } as unknown as OAuth2Client, request };
}

/** El error que devuelve Google cuando un calendario no existe. */
function httpError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status } });
}

describe("ensureCompanyCalendar", () => {
  it("reutiliza el calendario guardado si todavía existe", async () => {
    const { client, request } = fakeClient(() => ({ id: "cal-existente" }));

    const id = await ensureCompanyCalendar(client, "Gráfica Sur", "cal-existente");

    expect(id).toBe("cal-existente");
    // Lo importante no es sólo el id devuelto: es que NO se creó nada.
    expect(request.mock.calls.every(([config]) => config.method === "GET")).toBe(true);
  });

  it("no duplica al reconectar: tres conexiones seguidas dejan un solo calendario", async () => {
    const creations: string[] = [];
    const { client } = fakeClient((config) => {
      if (config.method === "POST") {
        creations.push(config.url);
        return { id: "cal-nuevo" };
      }
      return { id: "cal-nuevo" };
    });

    let stored: string | null = null;
    for (let i = 0; i < 3; i++) {
      stored = await ensureCompanyCalendar(client, "Gráfica Sur", stored);
    }

    expect(stored).toBe("cal-nuevo");
    expect(creations).toHaveLength(1);
  });

  it("crea uno nuevo si el guardado fue borrado en Google", async () => {
    const { client } = fakeClient((config) =>
      config.method === "GET" ? httpError(404) : { id: "cal-recreado" },
    );

    expect(await ensureCompanyCalendar(client, "Gráfica Sur", "cal-borrado")).toBe("cal-recreado");
  });

  it("trata 410 como borrado, igual que 404", async () => {
    const { client } = fakeClient((config) =>
      config.method === "GET" ? httpError(410) : { id: "cal-recreado" },
    );

    expect(await ensureCompanyCalendar(client, "Gráfica Sur", "cal-viejo")).toBe("cal-recreado");
  });

  it("migra desde 'primary' sin intentar verificarlo", async () => {
    // El valor viejo apuntaba a la agenda personal. No hay que preguntarle a
    // Google si existe —siempre existe—: hay que dejar de usarla.
    const { client, request } = fakeClient(() => ({ id: "cal-dedicado" }));

    expect(await ensureCompanyCalendar(client, "Gráfica Sur", "primary")).toBe("cal-dedicado");
    expect(request.mock.calls.every(([config]) => config.method === "POST")).toBe(true);
  });

  it("ante un error que no es 'no existe', falla en vez de crear otro calendario", async () => {
    // Un 500 o un corte de red no significan que el calendario no esté. Crear
    // uno nuevo ahí dejaría dos calendarios y las órdenes partidas entre los
    // dos, que es peor que fallar y reintentar.
    const { client } = fakeClient((config) =>
      config.method === "GET" ? httpError(500) : { id: "no-deberia-crearse" },
    );

    await expect(ensureCompanyCalendar(client, "Gráfica Sur", "cal-existente")).rejects.toThrow();
  });

  it("nombra el calendario con la empresa, para distinguirlo entre varios", async () => {
    expect(companyCalendarName("Gráfica Sur")).toBe("Se Instala — Gráfica Sur");
  });
});

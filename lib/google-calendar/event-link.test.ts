import { describe, expect, it } from "vitest";
import { exclusiveEndDate, googleCalendarEventUrl } from "@/lib/google-calendar/event-link";

const base = {
  orderNumber: "OT-0001",
  title: "Cambio de gráfica",
  scheduledDate: "2026-09-09",
};

const paramsOf = (url: string) => new URL(url).searchParams;

describe("exclusiveEndDate", () => {
  it("devuelve el día siguiente", () => {
    expect(exclusiveEndDate("2026-09-09")).toBe("2026-09-10");
  });

  it("cruza fin de mes", () => {
    expect(exclusiveEndDate("2026-09-30")).toBe("2026-10-01");
  });

  it("cruza fin de año", () => {
    expect(exclusiveEndDate("2026-12-31")).toBe("2027-01-01");
  });

  it("resuelve el 29 de febrero de un año bisiesto", () => {
    expect(exclusiveEndDate("2028-02-28")).toBe("2028-02-29");
    expect(exclusiveEndDate("2028-02-29")).toBe("2028-03-01");
  });
});

describe("googleCalendarEventUrl", () => {
  it("una orden de un solo día ocupa un día, no dos", () => {
    // Google trata el fin de un evento de día completo como exclusivo: si se
    // mandara la misma fecha en los dos extremos, el evento se vería vacío.
    const dates = paramsOf(googleCalendarEventUrl(base)).get("dates");
    expect(dates).toBe("20260909/20260910");
  });

  it("respeta la fecha de fin cuando la orden dura varios días", () => {
    const url = googleCalendarEventUrl({ ...base, scheduledEndDate: "2026-09-12" });
    expect(paramsOf(url).get("dates")).toBe("20260909/20260913");
  });

  it("trata una fecha de fin vacía como si no estuviera", () => {
    const url = googleCalendarEventUrl({ ...base, scheduledEndDate: "" });
    expect(paramsOf(url).get("dates")).toBe("20260909/20260910");
  });

  it("antepone el número de orden al título", () => {
    expect(paramsOf(googleCalendarEventUrl(base)).get("text")).toBe("[OT-0001] Cambio de gráfica");
  });

  it("escapa acentos, símbolos y espacios sin romper la URL", () => {
    const url = googleCalendarEventUrl({
      ...base,
      title: "Instalación & señalética #3",
      location: "Ruta 9 km 42, Córdoba",
    });
    // Se parsea de vuelta: si el escape estuviera mal, estos valores no
    // volverían idénticos.
    expect(paramsOf(url).get("text")).toBe("[OT-0001] Instalación & señalética #3");
    expect(paramsOf(url).get("location")).toBe("Ruta 9 km 42, Córdoba");
  });

  it("junta descripción y link de la orden en los detalles", () => {
    const url = googleCalendarEventUrl({
      ...base,
      description: "Llevar andamio",
      orderUrl: "https://www.seinstala.com.ar/orders/abc",
    });
    expect(paramsOf(url).get("details")).toBe(
      "Llevar andamio\n\nhttps://www.seinstala.com.ar/orders/abc",
    );
  });

  it("omite los detalles cuando no hay ni descripción ni link", () => {
    expect(paramsOf(googleCalendarEventUrl(base)).has("details")).toBe(false);
  });
});

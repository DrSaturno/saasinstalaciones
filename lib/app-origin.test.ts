import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { applicationOrigin } from "@/lib/app-origin";

const ORIGINAL = {
  APP_URL: process.env.APP_URL,
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
};

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("origen público de la aplicación", () => {
  it("descarta el path y conserva sólo el origen", () => {
    process.env.APP_URL = "https://saasinstalaciones.vercel.app/algo?x=1";
    expect(applicationOrigin()).toBe("https://saasinstalaciones.vercel.app");
  });

  it("cae al dominio de producción de Vercel cuando no hay APP_URL", () => {
    delete process.env.APP_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "saasinstalaciones.vercel.app";
    expect(applicationOrigin()).toBe("https://saasinstalaciones.vercel.app");
  });

  it("permite http sólo en localhost", () => {
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    process.env.APP_URL = "http://localhost:3000";
    expect(applicationOrigin()).toBe("http://localhost:3000");

    process.env.APP_URL = "http://ejemplo.com";
    expect(() => applicationOrigin()).toThrow(/Invalid APP_URL/);
  });

  // `https://app.example.com@evil.com` apunta a evil.com, pero a simple vista
  // parece el dominio propio: es la forma clásica de disfrazar un link.
  it("rechaza orígenes con credenciales embebidas", () => {
    process.env.APP_URL = "https://usuario:clave@evil.com";
    expect(() => applicationOrigin()).toThrow(/Invalid APP_URL/);
  });
});

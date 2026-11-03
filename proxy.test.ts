import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROLE_AREAS } from "./proxy";
import type { UserRole } from "@/types/database";

/**
 * El proxy redirige cuando alguien entra a "el área de otro". Ese corte se
 * calcula sobre `ROLE_AREAS`, así que una ruta que no figure en ninguna lista
 * simplemente no está protegida por él.
 *
 * Es lo que pasó hasta la auditoría del 11-09-2026: el gerente declaraba sólo
 * `/dashboard`, y órdenes, proyectos, clientes, equipo, finanzas, agenda,
 * configuración y locaciones quedaban fuera de toda área. Cada layout vuelve a
 * comprobar el rol, así que no hubo acceso indebido — pero la defensa que este
 * archivo dice dar no estaba donde se creía, y nada lo señalaba.
 *
 * Enumerar a mano fue justamente el problema. Esto lee el disco: cualquier
 * ruta nueva de un área tiene que declararse, o el test la nombra.
 */

/** Route groups (`(company)`) no prefijan la URL; sus hijos son las rutas. */
function routeSegments(group: string): string[] {
  return readdirSync(`app/${group}`, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    // `[id]` y demás son hijos de una ruta, no rutas de primer nivel.
    .filter((name) => !name.startsWith("[") && !name.startsWith("("))
    .map((name) => `/${name}`);
}

const AREA_OF: Record<string, UserRole> = {
  "(company)": "company_manager",
  "(installer)": "installer",
};

describe("áreas declaradas en el proxy", () => {
  for (const [group, role] of Object.entries(AREA_OF)) {
    it(`declara todas las rutas de ${group}`, () => {
      const declared = ROLE_AREAS[role];
      const missing = routeSegments(group).filter(
        (segment) => !declared.includes(segment),
      );
      expect(missing).toEqual([]);
    });
  }

  it("el maestro sigue siendo su propia área", () => {
    expect(ROLE_AREAS.platform_admin).toEqual(["/master"]);
  });

  it("las pantallas compartidas no pertenecen a ningún área", () => {
    // Mensajería y Bandeja las usan empresa e instalador. Meterlas en un área
    // dejaría al otro rol fuera de una pantalla que sí le corresponde.
    const all = Object.values(ROLE_AREAS).flat();
    for (const shared of ["/messages", "/notifications"]) {
      expect(all).not.toContain(shared);
    }
  });

  it("ninguna ruta pertenece a dos áreas a la vez", () => {
    const all = Object.values(ROLE_AREAS).flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it("ningún área es prefijo de la ruta de otra", () => {
    // El corte usa `startsWith`: si un área declarara `/order` y otra
    // `/orders`, la primera se comería a la segunda sin que se note.
    const all = Object.values(ROLE_AREAS).flat();
    const collisions = all.flatMap((a) =>
      all
        .filter((b) => a !== b && b.startsWith(a))
        .map((b) => `${a} ⊃ ${b}`),
    );
    expect(collisions).toEqual([]);
  });
});

describe("link de recuperación que Supabase mandó a la página principal", () => {
  // `proxy` arma el cliente de Supabase antes de mirar la ruta; con estas
  // variables alcanza, porque el reenvío se decide antes de pedir la sesión.
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon-key";

  async function visit(path: string) {
    const { proxy } = await import("./proxy");
    const { NextRequest } = await import("next/server");
    return proxy(new NextRequest(`https://www.seinstala.com.ar${path}`));
  }

  it("reenvía el código al callback, que es el que lo canjea", async () => {
    const response = await visit("/?code=abc123");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://www.seinstala.com.ar/api/auth/callback?code=abc123",
    );
  });

  it("también desde el login, y con el formato token_hash", async () => {
    const response = await visit("/login?token_hash=h1&type=recovery");
    expect(response.headers.get("location")).toBe(
      "https://www.seinstala.com.ar/api/auth/callback?token_hash=h1&type=recovery",
    );
  });

  it("un link vencido va al callback, que ofrece pedir uno nuevo", async () => {
    const response = await visit("/?error=access_denied&error_code=otp_expired");
    expect(response.headers.get("location")).toContain("/api/auth/callback?");
  });
});

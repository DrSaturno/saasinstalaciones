import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireOperator, geocodeBatch, geocodingConfigured } = vi.hoisted(() => ({
  requireOperator: vi.fn(),
  geocodeBatch: vi.fn(),
  geocodingConfigured: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("./context", () => ({ requireOperator }));
vi.mock("@/lib/geocoding/google", () => ({ geocodeBatch, geocodingConfigured }));
vi.mock("@/lib/observability", () => ({ logEvent: vi.fn() }));

import { completeMissingLocations } from "./geocode";

type Call = [string, unknown[]];

/**
 * Cliente de Supabase de mentira: cada `from(tabla)` devuelve una cadena que
 * registra lo que se le pide y se resuelve según `resolve`. Alcanza para
 * afirmar QUÉ se escribe y dónde, que es lo que importa de esta acción.
 */
function fakeSupabase(resolve: (table: string, calls: Call[]) => unknown) {
  const writes: { table: string; values: unknown; filters: Call[] }[] = [];
  const from = (table: string) => {
    const calls: Call[] = [];
    let update: unknown = undefined;
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "neq", "order", "limit", "maybeSingle", "update"]) {
      chain[method] = (...args: unknown[]) => {
        calls.push([method, args]);
        if (method === "update") update = args[0];
        return chain;
      };
    }
    chain.then = (onFulfilled: (value: unknown) => unknown) => {
      if (update !== undefined) writes.push({ table, values: update, filters: calls });
      return Promise.resolve(resolve(table, calls)).then(onFulfilled);
    };
    return chain;
  };
  return { supabase: { from }, writes };
}

const SITES = [
  { id: "s1", location_id: "l1", address: "Av. Corrientes 1234", city: "CABA", state: "Buenos Aires", zone: "Buenos Aires" },
  { id: "s2", location_id: null, address: "Belgrano 500", city: "Córdoba", state: "", zone: "Córdoba" },
  { id: "s3", location_id: "l3", address: "Calle inexistente 9", city: "X", state: "Santa Fe", zone: "Santa Fe" },
];

function setup(overrides: { remaining?: number } = {}) {
  const { supabase, writes } = fakeSupabase((table, calls) => {
    const isCount = calls.some(([m, a]) => m === "select" && (a[1] as { head?: boolean } | undefined)?.head);
    if (table === "projects") return { data: { id: "p1", country: "AR" } };
    if (table === "sites" && isCount) return { count: overrides.remaining ?? 1 };
    if (table === "sites" && calls.some(([m]) => m === "select")) return { data: SITES, error: null };
    return { error: null };
  });
  requireOperator.mockResolvedValue({ supabase, companyId: "c1", userId: "u1" });
  return writes;
}

beforeEach(() => {
  vi.resetAllMocks();
  geocodingConfigured.mockReturnValue(true);
});

describe("completeMissingLocations", () => {
  it("sin clave configurada no consulta ni escribe nada", async () => {
    geocodingConfigured.mockReturnValue(false);
    const result = await completeMissingLocations("p1");
    expect(result).toEqual({ error: "locationUnavailable", located: 0, notFound: 0, remaining: 0 });
    expect(requireOperator).not.toHaveBeenCalled();
    expect(geocodeBatch).not.toHaveBeenCalled();
  });

  it("quien no es gerente no puede pedirlo", async () => {
    requireOperator.mockRejectedValue(new Error("Acceso denegado"));
    const result = await completeMissingLocations("p1");
    expect(result.error).toBe("accessDenied");
    expect(geocodeBatch).not.toHaveBeenCalled();
  });

  it("escribe en la ficha canónica si existe y en el punto si no, y sólo lo ubicado", async () => {
    const writes = setup({ remaining: 1 });
    geocodeBatch.mockResolvedValue({
      located: new Map([
        ["s1", { lat: -34.6, lng: -58.4 }],
        ["s2", { lat: -31.4, lng: -64.2 }],
      ]),
      failed: ["s3"],
      skipped: [],
    });

    const result = await completeMissingLocations("p1");

    expect(result).toEqual({ error: null, located: 2, notFound: 1, remaining: 1 });
    expect(writes).toHaveLength(2);
    const canonical = writes.find((w) => w.table === "locations");
    expect(canonical?.values).toEqual({ lat: -34.6, lng: -58.4, updated_by: "u1" });
    expect(canonical?.filters).toContainEqual(["eq", ["id", "l1"]]);
    expect(canonical?.filters).toContainEqual(["eq", ["company_id", "c1"]]);
    const direct = writes.find((w) => w.table === "sites");
    expect(direct?.values).toEqual({ lat: -31.4, lng: -64.2 });
    expect(direct?.filters).toContainEqual(["eq", ["id", "s2"]]);
    // El que Google no encontró no se toca.
    expect(writes.some((w) => JSON.stringify(w.filters).includes('"s3"') || JSON.stringify(w.filters).includes('"l3"'))).toBe(false);
  });

  it("consulta con el país del proyecto y un tope, y arma la consulta desde la dirección", async () => {
    setup();
    geocodeBatch.mockResolvedValue({ located: new Map(), failed: [], skipped: [] });
    await completeMissingLocations("p1");
    const [items, options] = geocodeBatch.mock.calls[0];
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({
      id: "s1",
      query: { address: "Av. Corrientes 1234, CABA, Buenos Aires", country: "AR" },
    });
    // Sin state, cae a la zona.
    expect(items[1].query.address).toBe("Belgrano 500, Córdoba, Córdoba");
    expect(options.max).toBeLessThanOrEqual(150);
  });

  it("si no se ubicó nada, informa cuántos no se encontraron y no escribe", async () => {
    const writes = setup({ remaining: 3 });
    geocodeBatch.mockResolvedValue({ located: new Map(), failed: ["s1", "s2", "s3"], skipped: [] });
    const result = await completeMissingLocations("p1");
    expect(result).toEqual({ error: null, located: 0, notFound: 3, remaining: 3 });
    expect(writes).toHaveLength(0);
  });
});

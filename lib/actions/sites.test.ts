import { beforeEach, describe, expect, it, vi } from "vitest";

const { locateAddress, getAuthorizedUser, createClient } = vi.hoisted(() => ({
  locateAddress: vi.fn(),
  getAuthorizedUser: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/auth-authorized", () => ({ getAuthorizedUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/geocoding/google", () => ({ locateAddress }));
vi.mock("@/lib/observability", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/actions/canonical-locations", () => ({ attachCanonicalLocations: vi.fn() }));

import { createSite, updateSite } from "./sites";

type Call = [string, unknown[]];

function fakeSupabase(resolve: (table: string, calls: Call[]) => unknown) {
  const writes: { table: string; kind: "insert" | "update"; values: Record<string, unknown> }[] = [];
  const from = (table: string) => {
    const calls: Call[] = [];
    let pending: { kind: "insert" | "update"; values: Record<string, unknown> } | undefined;
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "neq", "order", "limit", "single", "maybeSingle", "insert", "update"]) {
      chain[method] = (...args: unknown[]) => {
        calls.push([method, args]);
        if (method === "insert" || method === "update") {
          pending = { kind: method, values: args[0] as Record<string, unknown> };
        }
        return chain;
      };
    }
    chain.then = (onFulfilled: (value: unknown) => unknown) => {
      if (pending) writes.push({ table, ...pending });
      return Promise.resolve(resolve(table, calls)).then(onFulfilled);
    };
    return chain;
  };
  return { supabase: { from }, writes };
}

const PROJECT = { id: "p1", company_id: "c1", client_id: "cl1", country: "AR", zones: ["Buenos Aires"] };
const CURRENT = {
  id: "s1",
  location_id: "l1",
  address: "Av. Corrientes 1234",
  city: "CABA",
  state: "Buenos Aires",
  zone: "Buenos Aires",
  lat: -34.6037,
  lng: -58.3816,
};

function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  const fields: Record<string, string> = {
    name: "Estación Centro",
    zone: "Buenos Aires",
    address: "Av. Corrientes 1234",
    city: "CABA",
    state: "Buenos Aires",
    contactPhone: "",
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function setup(origin = "cl1") {
  const { supabase, writes } = fakeSupabase((table, calls) => {
    const isWrite = calls.some(([m]) => m === "insert" || m === "update");
    if (isWrite) {
      return table === "locations" && calls.some(([m]) => m === "insert")
        ? { data: { id: "l-new", company_id: "c1", client_id: "cl1" }, error: null }
        : { error: null };
    }
    if (table === "projects") return { data: PROJECT };
    if (table === "sites") return { data: CURRENT };
    if (table === "locations") return { data: { client_id: origin } };
    return { data: null };
  });
  createClient.mockResolvedValue(supabase);
  getAuthorizedUser.mockResolvedValue({ id: "u1", role: "company_manager", companyId: "c1" });
  return writes;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("updateSite — la ubicación sale de la dirección", () => {
  it("editar sólo el teléfono no consulta a Google y conserva la ubicación", async () => {
    const writes = setup();
    const result = await updateSite("p1", "s1", { error: null }, form({ contactPhone: "11 5555-5555" }));

    expect(result.ok).toBe(true);
    expect(locateAddress).not.toHaveBeenCalled();
    const location = writes.find((w) => w.table === "locations");
    expect(location?.values).toMatchObject({ lat: -34.6037, lng: -58.3816, contact_phone: "11 5555-5555" });
  });

  it("cambiar la dirección la vuelve a ubicar, con el país del proyecto", async () => {
    const writes = setup();
    locateAddress.mockResolvedValue({ lat: -34.61, lng: -58.39 });

    await updateSite("p1", "s1", { error: null }, form({ address: "Av. Corrientes 1500" }));

    expect(locateAddress).toHaveBeenCalledOnce();
    expect(locateAddress).toHaveBeenCalledWith({
      address: "Av. Corrientes 1500",
      city: "CABA",
      state: "Buenos Aires",
      country: "AR",
    });
    expect(writes.find((w) => w.table === "locations")?.values).toMatchObject({ lat: -34.61, lng: -58.39 });
  });

  it("si la nueva dirección no se puede ubicar, descarta la ubicación vieja", async () => {
    const writes = setup();
    locateAddress.mockResolvedValue(null);

    const result = await updateSite("p1", "s1", { error: null }, form({ city: "Rosario" }));

    // Guardar no falla, pero un punto que ya no corresponde es peor que ninguno.
    expect(result.ok).toBe(true);
    expect(writes.find((w) => w.table === "locations")?.values).toMatchObject({ lat: null, lng: null });
  });

  it("mayúsculas, tildes o espacios de más no cuentan como cambio de dirección", async () => {
    setup();
    await updateSite("p1", "s1", { error: null }, form({ address: "  av. CORRIENTES 1234 ", city: "caba" }));
    expect(locateAddress).not.toHaveBeenCalled();
  });

  it("no acepta coordenadas mandadas por afuera del formulario", async () => {
    const writes = setup();
    await updateSite("p1", "s1", { error: null }, form({ lat: "10", lng: "20" }));
    expect(writes.find((w) => w.table === "locations")?.values).toMatchObject({ lat: -34.6037, lng: -58.3816 });
  });
});

describe("updateSite — el código del local es del cliente", () => {
  it("si el cliente del proyecto es el de origen, el código va a la ficha y a su vínculo", async () => {
    const writes = setup("cl1");
    await updateSite("p1", "s1", { error: null }, form({ externalRef: "SUC-9" }));

    expect(writes.find((w) => w.table === "locations")?.values).toMatchObject({ external_ref: "SUC-9" });
    expect(writes.find((w) => w.table === "client_locations")?.values).toEqual({ external_ref: "SUC-9" });
  });

  it("si la locación es de OTRO cliente, el código sólo va al vínculo y no pisa el de origen", async () => {
    const writes = setup("otro-cliente");
    await updateSite("p1", "s1", { error: null }, form({ externalRef: "B-500", contactPhone: "11 1" }));

    const location = writes.find((w) => w.table === "locations")?.values ?? {};
    expect(location).not.toHaveProperty("external_ref");
    // Lo compartido sí se edita.
    expect(location).toMatchObject({ contact_phone: "11 1" });
    expect(writes.find((w) => w.table === "client_locations")?.values).toEqual({ external_ref: "B-500" });
    // Y la proyección de los puntos tampoco lleva el código: lo decide la base por cliente.
    const projection = writes.find((w) => w.table === "sites")?.values ?? {};
    expect(projection).not.toHaveProperty("external_ref");
  });
});

describe("createSite — ubica al crear", () => {
  it("ubica el local nuevo a partir de su dirección", async () => {
    const writes = setup();
    locateAddress.mockResolvedValue({ lat: -34.6, lng: -58.4 });

    await createSite("p1", { error: null }, form());

    expect(locateAddress).toHaveBeenCalledWith({
      address: "Av. Corrientes 1234",
      city: "CABA",
      state: "Buenos Aires",
      country: "AR",
    });
    expect(writes.find((w) => w.table === "locations" && w.kind === "insert")?.values).toMatchObject({
      lat: -34.6,
      lng: -58.4,
    });
  });

  it("si no se puede ubicar, el local se crea igual, sin ubicación", async () => {
    const writes = setup();
    locateAddress.mockResolvedValue(null);

    await createSite("p1", { error: null }, form());

    expect(writes.find((w) => w.table === "locations" && w.kind === "insert")?.values).toMatchObject({
      lat: null,
      lng: null,
    });
  });
});

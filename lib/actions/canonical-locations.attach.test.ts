import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attachCanonicalLocations } from "@/lib/actions/canonical-locations";
import type { CanonicalLocationProjection } from "@/lib/domain/canonical-locations";
import type { Database } from "@/types/database";

type Write = { table: string; kind: "insert" | "upsert"; values: unknown; options?: unknown };

/** Cliente de Supabase de mentira: registra las escrituras y contesta lecturas vacías. */
function fakeSupabase() {
  const writes: Write[] = [];
  const from = (table: string) => {
    let pending: Write | undefined;
    let wroteSites = false;
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "not", "range"]) {
      chain[method] = () => chain;
    }
    for (const method of ["insert", "upsert"] as const) {
      chain[method] = (values: unknown, options?: unknown) => {
        pending = { table, kind: method, values, options };
        wroteSites = table === "sites";
        return chain;
      };
    }
    chain.then = (onFulfilled: (value: unknown) => unknown) => {
      if (pending) {
        writes.push(pending);
        const rows = Array.isArray(pending.values) ? (pending.values as { location_id?: string }[]) : [];
        return Promise.resolve({
          data: wroteSites ? rows.map((row, index) => ({ id: `site-${index}`, location_id: row.location_id })) : null,
          error: null,
        }).then(onFulfilled);
      }
      return Promise.resolve({ data: [], error: null }).then(onFulfilled);
    };
    return chain;
  };
  return { supabase: { from } as unknown as SupabaseClient<Database>, writes };
}

const PROJECT = { id: "p2", company_id: "c1", client_id: "clientB", country: "AR" as const, zones: ["Buenos Aires"] };

function location(overrides: Partial<CanonicalLocationProjection> = {}): CanonicalLocationProjection {
  return {
    id: "l1",
    company_id: "c1",
    client_id: "clientA",
    name: "Shopping Centro",
    address: "Av. Siempreviva 742",
    city: "CABA",
    state: "Buenos Aires",
    zone: "Buenos Aires",
    country: "AR",
    lat: null,
    lng: null,
    external_ref: "SUC-001",
    contact_name: "",
    contact_phone: "",
    contact_email: "",
    opening_hours: "",
    access_notes: "",
    parking_notes: "",
    technical_notes: "",
    risk_notes: "",
    permanent_notes: "",
    ...overrides,
  };
}

describe("attachCanonicalLocations — una locación de otro cliente", () => {
  it("la vincula al cliente del proyecto SIN copiarle el código del cliente de origen", async () => {
    const { supabase, writes } = fakeSupabase();
    const result = await attachCanonicalLocations(supabase, PROJECT, [location()], "u1");

    expect(result.error).toBeNull();
    const link = writes.find((w) => w.table === "client_locations");
    expect(link?.kind).toBe("upsert");
    expect(link?.values).toEqual([
      { location_id: "l1", company_id: "c1", client_id: "clientB", external_ref: null, created_by: "u1" },
    ]);
    // Si el vínculo ya existe (otro proyecto del mismo cliente) no se toca su código.
    expect(link?.options).toMatchObject({ onConflict: "location_id,client_id", ignoreDuplicates: true });
  });

  it("primero el vínculo y después el punto y la asociación: la base los exige en ese orden", async () => {
    const { supabase, writes } = fakeSupabase();
    await attachCanonicalLocations(supabase, PROJECT, [location()], "u1");
    const order = writes.map((w) => w.table);
    expect(order.indexOf("client_locations")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("client_locations")).toBeLessThan(order.indexOf("sites"));
    expect(order.indexOf("client_locations")).toBeLessThan(order.indexOf("project_locations"));
  });

  it("una locación del propio cliente no crea vínculo: ya existe desde que se creó", async () => {
    const { supabase, writes } = fakeSupabase();
    await attachCanonicalLocations(supabase, PROJECT, [location({ client_id: "clientB" })], "u1");
    expect(writes.some((w) => w.table === "client_locations")).toBe(false);
    expect(writes.some((w) => w.table === "project_locations")).toBe(true);
  });

  it("nunca cruza de empresa: una locación de otra empresa se rechaza sin escribir nada", async () => {
    const { supabase, writes } = fakeSupabase();
    const result = await attachCanonicalLocations(
      supabase,
      PROJECT,
      [location({ company_id: "otra-empresa" })],
      "u1",
    );
    expect(result.error).toBe("canonical_location_scope_mismatch");
    expect(writes).toHaveLength(0);
  });

  it("sigue respetando el país y las zonas del proyecto", async () => {
    const { supabase, writes } = fakeSupabase();
    const result = await attachCanonicalLocations(supabase, PROJECT, [location({ zone: "Córdoba" })], "u1");
    expect(result.error).toBe("canonical_location_scope_mismatch");
    expect(writes).toHaveLength(0);
  });
});

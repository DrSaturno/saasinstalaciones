import { beforeEach, describe, expect, it, vi } from "vitest";

const { locateAddress, geocodingConfigured, getAuthorizedUser, createClient } = vi.hoisted(() => ({
  locateAddress: vi.fn(),
  geocodingConfigured: vi.fn(),
  getAuthorizedUser: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/auth-authorized", () => ({ getAuthorizedUser }));
vi.mock("@/lib/auth", () => ({ isInstallerArea: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/geocoding/google", () => ({ locateAddress, geocodingConfigured }));
vi.mock("@/lib/data/company-membership-roles", () => ({ hasActiveCompanyRole: vi.fn() }));

import { saveCoverage } from "./availability";

type Call = [string, unknown[]];

function fakeSupabase(current: Record<string, unknown> | null) {
  const updates: Record<string, unknown>[] = [];
  const from = () => {
    const calls: Call[] = [];
    let update: Record<string, unknown> | undefined;
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "maybeSingle", "update"]) {
      chain[method] = (...args: unknown[]) => {
        calls.push([method, args]);
        if (method === "update") update = args[0] as Record<string, unknown>;
        return chain;
      };
    }
    chain.then = (onFulfilled: (value: unknown) => unknown) => {
      if (update) {
        updates.push(update);
        return Promise.resolve({ error: null }).then(onFulfilled);
      }
      return Promise.resolve({ data: current }).then(onFulfilled);
    };
    return chain;
  };
  createClient.mockResolvedValue({ from });
  return updates;
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  data.append("zones", "Córdoba");
  for (const [key, value] of Object.entries({ baseAddress: "", baseCity: "", serviceRadiusKm: "", ...fields })) {
    data.set(key, value);
  }
  return data;
}

const CURRENT = { base_address: "Av. Colón 100", base_city: "Córdoba", base_lat: -31.4, base_lng: -64.18 };

beforeEach(() => {
  vi.resetAllMocks();
  getAuthorizedUser.mockResolvedValue({ id: "i1" });
  geocodingConfigured.mockReturnValue(true);
});

describe("saveCoverage — la base se ubica sola", () => {
  it("si la base no cambió, conserva la ubicación y no consulta a Google", async () => {
    const updates = fakeSupabase(CURRENT);
    const result = await saveCoverage(
      { error: null },
      form({ baseAddress: "Av. Colón 100", baseCity: "Córdoba", serviceRadiusKm: "50" }),
    );
    expect(result.ok).toBe(true);
    expect(locateAddress).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({ base_lat: -31.4, base_lng: -64.18, service_radius_km: 50 });
  });

  it("si la base cambió, la ubica y alcanza con la ciudad", async () => {
    const updates = fakeSupabase(CURRENT);
    locateAddress.mockResolvedValue({ lat: -32.95, lng: -60.65 });
    const result = await saveCoverage(
      { error: null },
      form({ baseAddress: "", baseCity: "Rosario", serviceRadiusKm: "80" }),
    );
    expect(result.ok).toBe(true);
    expect(locateAddress).toHaveBeenCalledWith(
      { address: "", city: "Rosario", country: "AR" },
      { allowCityOnly: true },
    );
    expect(updates[0]).toMatchObject({ base_lat: -32.95, base_lng: -60.65 });
  });

  it("un radio con una base que no se pudo ubicar se rechaza y no guarda nada", async () => {
    const updates = fakeSupabase(CURRENT);
    locateAddress.mockResolvedValue(null);
    const result = await saveCoverage(
      { error: null },
      form({ baseAddress: "Calle inexistente", baseCity: "Xyz", serviceRadiusKm: "80" }),
    );
    expect(result.error).toBe("baseNotLocated");
    expect(updates).toHaveLength(0);
  });

  it("sin la ubicación automática configurada, lo dice con otro mensaje", async () => {
    fakeSupabase(CURRENT);
    geocodingConfigured.mockReturnValue(false);
    locateAddress.mockResolvedValue(null);
    const result = await saveCoverage(
      { error: null },
      form({ baseAddress: "Otra 1", baseCity: "Córdoba", serviceRadiusKm: "80" }),
    );
    expect(result.error).toBe("locationUnavailable");
  });

  it("sin radio, guardar la cobertura no depende de que la base se ubique", async () => {
    const updates = fakeSupabase(CURRENT);
    locateAddress.mockResolvedValue(null);
    const result = await saveCoverage({ error: null }, form({ baseAddress: "Otra 1", baseCity: "Córdoba" }));
    expect(result.ok).toBe(true);
    expect(updates[0]).toMatchObject({ base_lat: null, base_lng: null, service_radius_km: null });
  });
});

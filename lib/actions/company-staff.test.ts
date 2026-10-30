import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthorizedUser, createClient, sendInvitationEmail } = vi.hoisted(() => ({
  getAuthorizedUser: vi.fn(),
  createClient: vi.fn(),
  sendInvitationEmail: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/auth-authorized", () => ({ getAuthorizedUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/email/invitations", () => ({
  invitationUrl: (token: string) => `https://app.test/invite/${token}`,
  sendInvitationEmail,
}));

import { inviteCompanyStaff, updateCompanyStaffPermissions } from "./company-staff";

type Call = [string, unknown[]];

function fakeSupabase(resolve: (table: string, calls: Call[]) => unknown) {
  const writes: { table: string; values: unknown }[] = [];
  const from = (table: string) => {
    const calls: Call[] = [];
    let pending: unknown;
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "maybeSingle", "single", "insert", "update"]) {
      chain[method] = (...args: unknown[]) => {
        calls.push([method, args]);
        if (method === "insert" || method === "update") pending = args[0];
        return chain;
      };
    }
    chain.then = (onFulfilled: (value: unknown) => unknown) => {
      if (pending !== undefined) writes.push({ table, values: pending });
      return Promise.resolve(resolve(table, calls)).then(onFulfilled);
    };
    return chain;
  };
  return { supabase: { from }, writes };
}

const OWNER = { id: "u-owner", role: "company_manager", companyId: "c1", isOwner: true, locale: "es" };
const STAFF = { id: "u-staff", role: "company_manager", companyId: "c1", isOwner: false, locale: "es" };

beforeEach(() => {
  vi.resetAllMocks();
  sendInvitationEmail.mockResolvedValue("sent");
});

describe("inviteCompanyStaff — sólo el dueño", () => {
  it("una subcuenta (no dueña) no puede invitar a otra", async () => {
    getAuthorizedUser.mockResolvedValue(STAFF);
    const result = await inviteCompanyStaff("nueva@test.dev", { canManageFinance: false, canManageSettings: false });
    expect(result.error).toBe("unexpected");
  });

  it("el dueño crea la invitación con el permiso decidido, en una sola llamada", async () => {
    getAuthorizedUser.mockResolvedValue(OWNER);
    const { supabase, writes } = fakeSupabase((table, calls) => {
      if (table === "invitations" && calls.some(([m]) => m === "insert")) {
        return { data: { token: "tok-1" }, error: null };
      }
      if (table === "invitations") return { data: null };
      if (table === "companies") return { data: { name: "GF Instalaciones" } };
      return { data: null };
    });
    createClient.mockResolvedValue(supabase);

    const result = await inviteCompanyStaff("NUEVA@test.dev", {
      canManageFinance: true,
      canManageSettings: false,
    });

    expect(result.error).toBeNull();
    expect(result.token).toBe("tok-1");
    const insert = writes.find((w) => w.table === "invitations");
    expect(insert?.values).toMatchObject({
      company_id: "c1",
      email: "nueva@test.dev",
      role: "company_staff",
      staff_can_manage_finance: true,
      staff_can_manage_settings: false,
    });
  });

  it("reutiliza una invitación pendiente en vez de duplicarla", async () => {
    getAuthorizedUser.mockResolvedValue(OWNER);
    const { supabase, writes } = fakeSupabase((table, calls) => {
      if (table === "invitations" && calls.some(([m]) => m === "select")) return { data: { token: "existente" } };
      if (table === "companies") return { data: { name: "GF Instalaciones" } };
      return { data: null };
    });
    createClient.mockResolvedValue(supabase);

    const result = await inviteCompanyStaff("nueva@test.dev", { canManageFinance: false, canManageSettings: false });

    expect(result.token).toBe("existente");
    expect(writes.some((w) => w.table === "invitations")).toBe(false);
  });
});

const STAFF_ID = "11111111-1111-4111-8111-111111111111";

describe("updateCompanyStaffPermissions — sólo el dueño", () => {
  it("una subcuenta no puede ajustar permisos, ni los propios", async () => {
    getAuthorizedUser.mockResolvedValue(STAFF);
    const result = await updateCompanyStaffPermissions({
      userId: STAFF_ID,
      canManageFinance: true,
      canManageSettings: true,
    });
    expect(result.error).toBe("unexpected");
  });

  it("el dueño activa un permiso y queda acotado a su empresa", async () => {
    getAuthorizedUser.mockResolvedValue(OWNER);
    const { supabase, writes } = fakeSupabase(() => ({ error: null }));
    createClient.mockResolvedValue(supabase);

    const result = await updateCompanyStaffPermissions({
      userId: STAFF_ID,
      canManageFinance: true,
      canManageSettings: false,
    });

    expect(result.ok).toBe(true);
    expect(writes[0]).toMatchObject({
      table: "company_staff_permissions",
      values: { can_manage_finance: true, can_manage_settings: false },
    });
  });
});

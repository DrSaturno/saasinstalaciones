import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));

const { requirePlatformAdmin } = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
}));
vi.mock("../../_guard", () => ({ requirePlatformAdmin }));

import { DELETE, PATCH } from "./route";

const COMPANY_ID = "11111111-1111-1111-1111-111111111111";
const MANAGER_ID = "22222222-2222-2222-2222-222222222222";

const profilesEqRole = vi.fn();
const profilesEqCompany = vi.fn(() => ({ eq: profilesEqRole }));
const profilesSelect = vi.fn(() => ({ eq: profilesEqCompany }));

const companyUpdateSingle = vi.fn();
const companyUpdateSelect = vi.fn(() => ({ single: companyUpdateSingle }));
const companyUpdateEq = vi.fn(() => ({ select: companyUpdateSelect }));
const companyUpdate = vi.fn(() => ({ eq: companyUpdateEq }));

const companyDeleteEq = vi.fn();
const companyDelete = vi.fn(() => ({ eq: companyDeleteEq }));

const deleteUser = vi.fn();

const from = vi.fn((table: string) => {
  if (table === "profiles") return { select: profilesSelect };
  if (table === "companies") return { update: companyUpdate, delete: companyDelete };
  throw new Error(`Unexpected table: ${table}`);
});

const admin = { from, auth: { admin: { deleteUser } } };

function request(method: "DELETE" | "PATCH", body?: unknown): NextRequest {
  return new Request(`https://app.example.com/api/master/companies/${COMPANY_ID}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }) as NextRequest;
}

const params = { params: Promise.resolve({ id: COMPANY_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  requirePlatformAdmin.mockResolvedValue({ admin, userId: "platform-admin" });
  profilesEqRole.mockResolvedValue({ data: [{ id: MANAGER_ID }], error: null });
  deleteUser.mockResolvedValue({ data: null, error: null });
  companyDeleteEq.mockResolvedValue({ error: null });
  companyUpdateSingle.mockResolvedValue({
    data: { id: COMPANY_ID, name: "Acme", status: "suspended" },
    error: null,
  });
});

describe("PATCH /api/master/companies/[id]", () => {
  it("actualiza el estado de la empresa", async () => {
    const response = await PATCH(request("PATCH", { status: "suspended" }), params);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(companyUpdate).toHaveBeenCalledWith({ status: "suspended" });
    expect(body.company.status).toBe("suspended");
  });

  it("rechaza un estado inválido antes de tocar la base", async () => {
    const response = await PATCH(request("PATCH", { status: "eliminada" }), params);

    expect(response.status).toBe(400);
    expect(companyUpdate).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/master/companies/[id]", () => {
  it("borra al gerente antes que a la empresa, no al revés", async () => {
    const order: string[] = [];
    deleteUser.mockImplementation(async () => {
      order.push("manager");
      return { data: null, error: null };
    });
    companyDeleteEq.mockImplementation(async () => {
      order.push("company");
      return { error: null };
    });

    const response = await DELETE(request("DELETE"), params);

    expect(response.status).toBe(200);
    expect(profilesEqCompany).toHaveBeenCalledWith("company_id", COMPANY_ID);
    expect(profilesEqRole).toHaveBeenCalledWith("role", "company_manager");
    expect(deleteUser).toHaveBeenCalledWith(MANAGER_ID);
    expect(companyDeleteEq).toHaveBeenCalledWith("id", COMPANY_ID);
    expect(order).toEqual(["manager", "company"]);
  });

  it("no borra la empresa si falla la baja del gerente", async () => {
    deleteUser.mockResolvedValue({ data: null, error: { message: "boom" } });

    const response = await DELETE(request("DELETE"), params);

    expect(response.status).toBe(500);
    expect(companyDelete).not.toHaveBeenCalled();
  });

  it("una empresa sin gerente también se borra, sin intentar deleteUser", async () => {
    profilesEqRole.mockResolvedValue({ data: [], error: null });

    const response = await DELETE(request("DELETE"), params);

    expect(response.status).toBe(200);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(companyDeleteEq).toHaveBeenCalledWith("id", COMPANY_ID);
  });

  it("exige ser platform_admin", async () => {
    const denied = new Response(JSON.stringify({ error: "accessDenied" }), {
      status: 403,
    });
    requirePlatformAdmin.mockResolvedValue({ error: denied });

    const response = await DELETE(request("DELETE"), params);

    expect(response.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });
});

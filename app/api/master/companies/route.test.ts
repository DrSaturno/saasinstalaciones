import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));

const { requirePlatformAdmin, applicationOrigin, managerActivationUrl, sendManagerActivationEmail } = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  applicationOrigin: vi.fn(),
  managerActivationUrl: vi.fn(),
  sendManagerActivationEmail: vi.fn(),
}));
vi.mock("../_guard", () => ({ requirePlatformAdmin }));
vi.mock("@/lib/app-origin", () => ({ applicationOrigin }));
vi.mock("@/lib/email/invitations", () => ({
  managerActivationUrl,
  sendManagerActivationEmail,
}));

import { POST } from "./route";

const COMPANY = { id: "11111111-1111-1111-1111-111111111111", name: "Acme" };
const USER_ID = "22222222-2222-2222-2222-222222222222";
const TOKEN_HASH = "private-hashed-token";
const ACTIVATION_URL =
  `https://app.example.com/api/auth/callback?token_hash=${TOKEN_HASH}&type=invite`;

const companySingle = vi.fn();
const companySelect = vi.fn(() => ({ single: companySingle }));
const companyInsert = vi.fn(() => ({ select: companySelect }));
const companyDeleteEq = vi.fn();
const companyDelete = vi.fn(() => ({ eq: companyDeleteEq }));
const generateLink = vi.fn();
const deleteUser = vi.fn();
const from = vi.fn((table: string) => {
  if (table !== "companies") throw new Error(`Unexpected table: ${table}`);
  return { insert: companyInsert, delete: companyDelete };
});
const admin = {
  from,
  auth: { admin: { generateLink, deleteUser } },
};

function request(): NextRequest {
  return new Request("https://app.example.com/api/master/companies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Acme",
      country: "AR",
      orderPrefix: "ACM",
      managerEmail: "manager@example.com",
      managerName: "Ada Manager",
    }),
  }) as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  applicationOrigin.mockReturnValue("https://app.example.com");
  managerActivationUrl.mockReturnValue(ACTIVATION_URL);
  companySingle.mockResolvedValue({ data: COMPANY, error: null });
  companyDeleteEq.mockResolvedValue({ error: null });
  deleteUser.mockResolvedValue({ data: null, error: null });
  generateLink.mockResolvedValue({
    data: {
      user: { id: USER_ID },
      properties: { hashed_token: TOKEN_HASH },
    },
    error: null,
  });
  sendManagerActivationEmail.mockResolvedValue("sent");
  requirePlatformAdmin.mockResolvedValue({ admin, userId: "platform-admin" });
});

describe("alta master con activación", () => {
  it("genera una invitación con metadata y no devuelve el token si se envió", async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(generateLink).toHaveBeenCalledWith({
      type: "invite",
      email: "manager@example.com",
      options: {
        data: {
          role: "company_manager",
          company_id: COMPANY.id,
          full_name: "Ada Manager",
          locale: "es",
        },
        redirectTo: "https://app.example.com/api/auth/callback",
      },
    });
    expect(body.invitation).toEqual({ status: "sent" });
    expect(JSON.stringify(body)).not.toContain(TOKEN_HASH);
  });

  it("devuelve el link una sola vez cuando Resend no está configurado", async () => {
    sendManagerActivationEmail.mockResolvedValue("not_configured");

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.invitation).toEqual({
      status: "manual",
      activationUrl: ACTIVATION_URL,
    });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(companyDelete).not.toHaveBeenCalled();
  });

  it("compensa usuario y empresa cuando falla un envío configurado", async () => {
    sendManagerActivationEmail.mockResolvedValue("failed");

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(companyDeleteEq).toHaveBeenCalledWith("id", COMPANY.id);
    expect(JSON.stringify(body)).not.toContain(TOKEN_HASH);
  });

  it("borra la empresa si Supabase no puede crear la invitación", async () => {
    generateLink.mockResolvedValue({
      data: null,
      error: { message: "already registered" },
    });

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(companyDeleteEq).toHaveBeenCalledWith("id", COMPANY.id);
    expect(sendManagerActivationEmail).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { invitationUrl, sendInvitationEmail } from "@/lib/email/invitations";

const ORIGINAL_ENV = {
  APP_URL: process.env.APP_URL,
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
};

const INPUT = {
  to: "installer@example.com",
  token: "11111111-1111-1111-1111-111111111111",
  invitationUrl:
    "https://app.example.com/invite/11111111-1111-1111-1111-111111111111",
  copy: {
    subject: "Invitation",
    heading: "Join the team",
    body: "Acme <Brasil> invited you.",
    cta: "Accept",
    expires: "Expires in 7 days.",
    fallback: "Copy the link.",
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("invitation email", () => {
  it("uses the configured public application origin", () => {
    process.env.APP_URL = "https://saasinstalaciones.vercel.app/path";
    expect(invitationUrl(INPUT.token)).toBe(
      `https://saasinstalaciones.vercel.app/invite/${INPUT.token}`,
    );
  });

  it("keeps the manual flow when Resend is not configured", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendInvitationEmail(INPUT)).resolves.toBe("not_configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends localized, escaped content with an idempotency key", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "Instala Pro <invites@example.com>";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "email-id" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendInvitationEmail(INPUT)).resolves.toBe("sent");
    expect(fetchMock).toHaveBeenCalledOnce();

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(request.headers).toMatchObject({
      Authorization: "Bearer re_test",
      "Idempotency-Key": `installer-invitation-${INPUT.token}`,
    });
    const body = JSON.parse(String(request.body));
    expect(body.to).toEqual([INPUT.to]);
    expect(body.html).toContain("Acme &lt;Brasil&gt; invited you.");
    expect(body.text).toContain(INPUT.invitationUrl);
  });

  it("reports provider errors without exposing the response", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "Instala Pro <invites@example.com>";
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 422 })));

    await expect(sendInvitationEmail(INPUT)).resolves.toBe("failed");
  });
});

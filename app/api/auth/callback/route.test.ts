import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const verifyOtp = vi.fn();
const exchangeCodeForSession = vi.fn();

vi.mock("@/lib/app-origin", () => ({
  applicationOrigin: () => "https://app.example.com",
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { verifyOtp, exchangeCodeForSession },
  }),
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  verifyOtp.mockResolvedValue({ error: null });
  exchangeCodeForSession.mockResolvedValue({ error: null });
});

describe("callback de activación", () => {
  it("acepta invite con token_hash y abre la definición de contraseña", async () => {
    const request = new NextRequest(
      "https://app.example.com/api/auth/callback?token_hash=hashed&type=invite",
    );

    const response = await GET(request);

    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: "hashed",
      type: "invite",
    });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://app.example.com/reset-password",
    );
  });

  it("rechaza tipos que no sirven para definir una contraseña", async () => {
    const request = new NextRequest(
      "https://app.example.com/api/auth/callback?token_hash=hashed&type=signup",
    );

    const response = await GET(request);

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://app.example.com/reset-password?error=link",
    );
  });
});

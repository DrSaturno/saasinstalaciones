import { describe, expect, it } from "vitest";
import { isAuthCallbackQuery, parseAuthHash } from "./auth-callback";

describe("link de Supabase que cae en la página principal", () => {
  it("reconoce el código PKCE, el token_hash y el error de link vencido", () => {
    expect(isAuthCallbackQuery(new URLSearchParams("code=abc"))).toBe(true);
    expect(
      isAuthCallbackQuery(new URLSearchParams("token_hash=h&type=recovery")),
    ).toBe(true);
    expect(
      isAuthCallbackQuery(new URLSearchParams("error=access_denied&error_code=otp_expired")),
    ).toBe(true);
  });

  it("no confunde una visita normal a la landing con un link de recuperación", () => {
    expect(isAuthCallbackQuery(new URLSearchParams(""))).toBe(false);
    expect(isAuthCallbackQuery(new URLSearchParams("utm_source=whatsapp"))).toBe(false);
    // `type` solo, sin el token, no es un link de Supabase.
    expect(isAuthCallbackQuery(new URLSearchParams("type=recovery"))).toBe(false);
  });
});

describe("sesión de recuperación en el fragmento (mail mandado desde el panel)", () => {
  const session = "#access_token=at&refresh_token=rt&expires_in=3600&token_type=bearer&type=recovery";

  it("toma los tokens de un link de recuperación", () => {
    expect(parseAuthHash(session)).toEqual({
      kind: "session",
      accessToken: "at",
      refreshToken: "rt",
    });
  });

  it("también acepta una invitación, que termina en elegir contraseña", () => {
    expect(parseAuthHash(session.replace("type=recovery", "type=invite"))).toMatchObject({
      kind: "session",
    });
  });

  it("un link vencido se informa como error, para ofrecer pedir otro", () => {
    expect(
      parseAuthHash("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid"),
    ).toEqual({ kind: "error" });
  });

  it("ignora las anclas de la landing y los fragmentos que no son de Supabase", () => {
    expect(parseAuthHash("")).toBeNull();
    expect(parseAuthHash("#")).toBeNull();
    expect(parseAuthHash("#funciones")).toBeNull();
    expect(parseAuthHash("#error")).toBeNull();
  });

  it("no manda a cambiar la contraseña con un magic link ni con tokens incompletos", () => {
    expect(parseAuthHash(session.replace("type=recovery", "type=magiclink"))).toBeNull();
    expect(parseAuthHash("#access_token=at&type=recovery")).toBeNull();
  });
});

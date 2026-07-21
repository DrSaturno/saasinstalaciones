import { afterEach, describe, expect, it } from "vitest";
import { decryptGoogleToken, encryptGoogleToken } from "@/lib/google-calendar/crypto";

const previousKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;

afterEach(() => {
  if (previousKey === undefined) delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  else process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = previousKey;
});

describe("cifrado de tokens de Google", () => {
  it("cifra con un nonce y recupera el valor original", () => {
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const first = encryptGoogleToken("refresh-token-secreto");
    const second = encryptGoogleToken("refresh-token-secreto");
    expect(first).not.toBe(second);
    expect(decryptGoogleToken(first)).toBe("refresh-token-secreto");
  });

  it("rechaza claves con una longitud insegura", () => {
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.from("corta").toString("base64");
    expect(() => encryptGoogleToken("token")).toThrow(/32 bytes/);
  });
});

import { describe, expect, it } from "vitest";
import es from "@/messages/marketing/es.json";
import pt from "@/messages/marketing/pt.json";

describe("mensajes de marketing", () => {
  it("mantiene paridad de claves entre español y portugués", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(pt).sort());
  });

  it("no deja valores vacíos", () => {
    expect(Object.values(es).every(Boolean)).toBe(true);
    expect(Object.values(pt).every(Boolean)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import es from "@/messages/login/es.json";
import pt from "@/messages/login/pt.json";

describe("login message fragments", () => {
  it("keeps Spanish and Portuguese keys in parity", () => {
    expect(Object.keys(pt).sort()).toEqual(Object.keys(es).sort());
  });

  it("does not ship empty login copy", () => {
    expect(Object.values(es).every((value) => value.trim().length > 0)).toBe(true);
    expect(Object.values(pt).every((value) => value.trim().length > 0)).toBe(true);
  });
});

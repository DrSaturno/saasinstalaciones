import { describe, expect, it } from "vitest";
import es from "@/messages/es.json";
import pt from "@/messages/pt.json";
import {
  DEFAULT_PROFILE_LOCALE,
  INTL_LOCALE,
  isProfileLocale,
  PROFILE_LOCALES,
} from "@/i18n/config";

type MessageTree = { [key: string]: string | MessageTree };

function flattenKeys(tree: MessageTree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : flattenKeys(value, path);
  });
}

function flattenValues(tree: MessageTree): string[] {
  return Object.values(tree).flatMap((value) =>
    typeof value === "string" ? [value] : flattenValues(value),
  );
}

describe("catálogos i18n", () => {
  it("mantiene exactamente las mismas claves en español y portugués", () => {
    expect(flattenKeys(pt).sort()).toEqual(flattenKeys(es).sort());
  });

  it("no contiene mensajes vacíos", () => {
    expect(flattenValues(es).every((value) => value.trim().length > 0)).toBe(true);
    expect(flattenValues(pt).every((value) => value.trim().length > 0)).toBe(true);
  });

  it("mapea los locales de perfil a etiquetas regionales", () => {
    expect(PROFILE_LOCALES).toEqual(["es", "pt"]);
    expect(DEFAULT_PROFILE_LOCALE).toBe("es");
    expect(INTL_LOCALE).toEqual({ es: "es-AR", pt: "pt-BR" });
    expect(isProfileLocale("es")).toBe(true);
    expect(isProfileLocale("pt")).toBe(true);
    expect(isProfileLocale("en")).toBe(false);
  });
});

import type { Locale as ProfileLocale } from "@/types/database";

export const PROFILE_LOCALES = ["es", "pt"] as const satisfies readonly ProfileLocale[];

export const DEFAULT_PROFILE_LOCALE: ProfileLocale = "es";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const INTL_LOCALE: Record<ProfileLocale, "es-AR" | "pt-BR"> = {
  es: "es-AR",
  pt: "pt-BR",
};

export const LOCALE_TIME_ZONE: Record<ProfileLocale, string> = {
  es: "America/Argentina/Buenos_Aires",
  pt: "America/Sao_Paulo",
};

export function isProfileLocale(value: unknown): value is ProfileLocale {
  return typeof value === "string" && PROFILE_LOCALES.includes(value as ProfileLocale);
}

import { z } from "zod";
import type { Country } from "@/types/database";

export const weeklyAvailabilitySchema = z.array(z.object({
  weekday: z.number().int().min(0).max(6),
  startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().min(3).max(80),
}).refine((value) => value.endsAt > value.startsAt, { path: ["endsAt"] })).max(14);

/**
 * Motivo de una ausencia. La base lo exige (check de 2 a 500) y lo repiten los
 * dos formularios de ausencia del instalador: el de cada empresa habilitaba el
 * botón con un solo carácter, que el servidor después rechazaba.
 */
export const ABSENCE_REASON = { min: 2, max: 500 } as const;

/** Nota con la que la empresa aprueba o rechaza una ausencia. */
export const UNAVAILABILITY_REVIEW_NOTE_MAX = 500;

/** Radio de servicio que declara el instalador en su cobertura. */
export const SERVICE_RADIUS_KM = { min: 1, max: 3000 } as const;

export const unavailabilitySchema = z.object({
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  reason: z.string().trim().min(ABSENCE_REASON.min).max(ABSENCE_REASON.max),
}).refine((value) => value.endsAt > value.startsAt, { path: ["endsAt"] });

export type WeeklyAvailabilityInput = z.infer<typeof weeklyAvailabilitySchema>[number];

export function countryTimezone(country: Country) {
  return country === "BR" ? "America/Sao_Paulo" : "America/Argentina/Buenos_Aires";
}

export function isInstallerAvailableAt({
  enabled,
  weekly,
  exceptions,
  at = new Date(),
}: {
  enabled: boolean;
  weekly: WeeklyAvailabilityInput[];
  exceptions: { startsAt: string; endsAt: string; reason: string }[];
  at?: Date;
}) {
  if (!enabled) return { available: false, reason: null as string | null };
  const activeException = exceptions.find((item) =>
    new Date(item.startsAt) <= at && new Date(item.endsAt) >= at,
  );
  if (activeException) return { available: false, reason: activeException.reason };
  if (weekly.length === 0) return { available: true, reason: null as string | null };

  const timezone = weekly[0]?.timezone ?? "America/Argentina/Buenos_Aires";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = weekdays[value.weekday] ?? -1;
  const time = `${value.hour}:${value.minute}`;
  const available = weekly.some((item) => item.weekday === weekday && item.startsAt <= time && item.endsAt >= time);
  return { available, reason: null as string | null };
}

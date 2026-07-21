import { z } from "zod";

const optionalCoordinate = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim().replace(",", "."))
  .refine((value) => value === "" || Number.isFinite(Number(value)))
  .transform((value) => (value === "" ? null : Number(value)));

export const siteInputSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    externalRef: z.string().trim().max(80),
    address: z.string().trim().max(300),
    city: z.string().trim().max(120),
    state: z.string().trim().max(120),
    zone: z.string().trim().min(1).max(80),
    lat: optionalCoordinate,
    lng: optionalCoordinate,
    contactName: z.string().trim().max(150),
    contactPhone: z.string().trim().max(80),
    contactEmail: z.union([z.literal(""), z.string().trim().email().max(200)]),
    openingHours: z.string().trim().max(500),
    accessNotes: z.string().trim().max(1500),
    parkingNotes: z.string().trim().max(1000),
    technicalNotes: z.string().trim().max(2000),
    riskNotes: z.string().trim().max(1500),
    permanentNotes: z.string().trim().max(3000),
  })
  .superRefine((value, context) => {
    if (value.lat !== null && (value.lat < -90 || value.lat > 90)) {
      context.addIssue({ code: "custom", path: ["lat"], message: "invalidLat" });
    }
    if (value.lng !== null && (value.lng < -180 || value.lng > 180)) {
      context.addIssue({ code: "custom", path: ["lng"], message: "invalidLng" });
    }
    if ((value.lat === null) !== (value.lng === null)) {
      context.addIssue({ code: "custom", path: ["lat"], message: "coordinatePair" });
    }
  });

export type SiteInput = z.infer<typeof siteInputSchema>;

export type SiteFormDefaults = {
  name: string;
  externalRef: string;
  address: string;
  city: string;
  state: string;
  zone: string;
  lat: number | null;
  lng: number | null;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  openingHours: string;
  accessNotes: string;
  parkingNotes: string;
  technicalNotes: string;
  riskNotes: string;
  permanentNotes: string;
};

export function googleMapsHref(site: {
  lat: number | null;
  lng: number | null;
  address: string;
  city: string;
}) {
  const query =
    site.lat !== null && site.lng !== null
      ? `${site.lat},${site.lng}`
      : [site.address, site.city].filter(Boolean).join(", ");
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : null;
}

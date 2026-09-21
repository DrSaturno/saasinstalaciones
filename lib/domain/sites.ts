import { z } from "zod";
import { FIELD, LATITUDE, LONGITUDE, optionalEmail } from "@/lib/domain/field-rules";

/**
 * Límites de la ficha de un local. Los usa el esquema de abajo y los usa el
 * formulario (`site-form-fields.tsx`) para su `maxLength`: si fueran números
 * distintos, el navegador dejaría enviar algo que el servidor rechaza, que es
 * como GF Instalaciones terminó viendo errores sin saber qué corregir.
 */
export const SITE_LIMITS = {
  name: { min: 2, max: 160 },
  externalRef: 80,
  address: FIELD.address.max,
  city: FIELD.city.max,
  contactName: FIELD.personName.max,
  contactPhone: FIELD.phone.max,
  contactEmail: FIELD.email.max,
  openingHours: 500,
  accessNotes: 1500,
  parkingNotes: 1000,
  technicalNotes: 2000,
  riskNotes: 1500,
  permanentNotes: 3000,
} as const;

const optionalCoordinate = (range: { min: number; max: number }) =>
  z
    .union([z.string(), z.number()])
    .transform((value) => String(value).trim().replace(",", "."))
    .refine((value) => value === "" || Number.isFinite(Number(value)))
    .transform((value) => (value === "" ? null : Number(value)))
    .refine((value) => value === null || (value >= range.min && value <= range.max));

export const siteInputSchema = z
  .object({
    name: z.string().trim().min(SITE_LIMITS.name.min).max(SITE_LIMITS.name.max),
    externalRef: z.string().trim().max(SITE_LIMITS.externalRef),
    address: z.string().trim().max(SITE_LIMITS.address),
    city: z.string().trim().max(SITE_LIMITS.city),
    state: z.string().trim().max(120),
    zone: z.string().trim().min(1).max(80),
    lat: optionalCoordinate(LATITUDE),
    lng: optionalCoordinate(LONGITUDE),
    contactName: z.string().trim().max(SITE_LIMITS.contactName),
    contactPhone: z.string().trim().max(SITE_LIMITS.contactPhone),
    contactEmail: optionalEmail(),
    openingHours: z.string().trim().max(SITE_LIMITS.openingHours),
    accessNotes: z.string().trim().max(SITE_LIMITS.accessNotes),
    parkingNotes: z.string().trim().max(SITE_LIMITS.parkingNotes),
    technicalNotes: z.string().trim().max(SITE_LIMITS.technicalNotes),
    riskNotes: z.string().trim().max(SITE_LIMITS.riskNotes),
    permanentNotes: z.string().trim().max(SITE_LIMITS.permanentNotes),
  })
  .superRefine((value, context) => {
    // La única regla que el navegador no puede validar solo: el rango de
    // cada coordenada ya lo frena el `min`/`max` del input.
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

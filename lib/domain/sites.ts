import { z } from "zod";
import { FIELD, optionalEmail } from "@/lib/domain/field-rules";

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

export const siteInputSchema = z
  .object({
    name: z.string().trim().min(SITE_LIMITS.name.min).max(SITE_LIMITS.name.max),
    externalRef: z.string().trim().max(SITE_LIMITS.externalRef),
    address: z.string().trim().max(SITE_LIMITS.address),
    city: z.string().trim().max(SITE_LIMITS.city),
    state: z.string().trim().max(120),
    zone: z.string().trim().min(1).max(80),
    contactName: z.string().trim().max(SITE_LIMITS.contactName),
    contactPhone: z.string().trim().max(SITE_LIMITS.contactPhone),
    contactEmail: optionalEmail(),
    openingHours: z.string().trim().max(SITE_LIMITS.openingHours),
    accessNotes: z.string().trim().max(SITE_LIMITS.accessNotes),
    parkingNotes: z.string().trim().max(SITE_LIMITS.parkingNotes),
    technicalNotes: z.string().trim().max(SITE_LIMITS.technicalNotes),
    riskNotes: z.string().trim().max(SITE_LIMITS.riskNotes),
    permanentNotes: z.string().trim().max(SITE_LIMITS.permanentNotes),
  });

export type SiteInput = z.infer<typeof siteInputSchema>;

export type SiteFormDefaults = {
  name: string;
  externalRef: string;
  address: string;
  city: string;
  state: string;
  zone: string;
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

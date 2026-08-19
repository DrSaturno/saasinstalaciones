import type { Tables, TablesInsert } from "@/types/database";

export type CanonicalLocationProjection = Pick<
  Tables<"locations">,
  | "id"
  | "company_id"
  | "client_id"
  | "name"
  | "address"
  | "city"
  | "state"
  | "zone"
  | "country"
  | "lat"
  | "lng"
  | "external_ref"
  | "contact_name"
  | "contact_phone"
  | "contact_email"
  | "opening_hours"
  | "access_notes"
  | "parking_notes"
  | "technical_notes"
  | "risk_notes"
  | "permanent_notes"
>;

export type CanonicalProjectTarget = {
  id: string;
  company_id: string;
  client_id: string;
  country: Tables<"projects">["country"];
  zones: string[];
};

/** Misma normalizacion que `public.normalize_location_external_ref`. */
export function normalizeLocationExternalRef(value: string | null): string | null {
  const normalized = (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return normalized || null;
}

export function toSiteProjection(
  location: CanonicalLocationProjection,
  project: CanonicalProjectTarget,
): TablesInsert<"sites"> {
  return {
    project_id: project.id,
    company_id: project.company_id,
    location_id: location.id,
    name: location.name,
    address: location.address,
    city: location.city,
    state: location.state,
    zone: location.zone,
    lat: location.lat,
    lng: location.lng,
    external_ref: location.external_ref,
    contact_name: location.contact_name,
    contact_phone: location.contact_phone,
    contact_email: location.contact_email,
    opening_hours: location.opening_hours,
    access_notes: location.access_notes,
    parking_notes: location.parking_notes,
    technical_notes: location.technical_notes,
    risk_notes: location.risk_notes,
    permanent_notes: location.permanent_notes,
    is_placeholder: false,
  };
}

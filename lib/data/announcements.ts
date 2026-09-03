import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnnouncementSeverity, Database } from "@/types/database";

export type PublishedAnnouncement = {
  id: string;
  title: string;
  body: string;
  severity: AnnouncementSeverity;
  audienceType: "all" | "zone" | "project";
  audienceRef: string;
  recipients: number;
  createdAt: string;
};

/**
 * Anuncios que la empresa ya publicó, del más nuevo al más viejo.
 *
 * Hasta ahora la tabla sólo se leía desde el lado del instalador: la empresa
 * publicaba y no le quedaba registro de qué había mandado ni a cuántos llegó.
 * Se corta en 20 porque esto es una consulta de control, no un archivo — el
 * índice `(company_id, created_at desc)` ya estaba para esto.
 *
 * La empresa la resuelve RLS: `announcements_company_all` acota a la propia.
 */
export async function fetchPublishedAnnouncements(
  supabase: SupabaseClient<Database>,
): Promise<PublishedAnnouncement[]> {
  const { data } = await supabase
    .from("announcements")
    .select("id, title, body, severity, audience_type, audience_ref, recipients, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    severity: row.severity,
    audienceType: row.audience_type,
    audienceRef: row.audience_ref,
    recipients: row.recipients,
    createdAt: row.created_at,
  }));
}

/**
 * Las provincias a las que la empresa puede comunicarse.
 *
 * Sale de las zonas declaradas por su **roster activo**, no de dónde hay
 * obra. El selector del compositor se llenaba con `sites.zone` mientras el
 * fan-out matchea contra `installers.zones`: una provincia con gente pero
 * sin sitios activos no aparecía, y elegir una sin instaladores publicaba a
 * cero personas sin decir nada. Son dos preguntas distintas y esta es la que
 * corresponde acá: *¿a quién puedo avisarle?*
 */
export async function fetchRosterZones(
  supabase: SupabaseClient<Database>,
): Promise<string[]> {
  const { data: roster } = await supabase
    .from("company_installers")
    .select("installer_id")
    .eq("status", "active");

  const ids = [...new Set((roster ?? []).map((row) => row.installer_id))];
  if (ids.length === 0) return [];

  const { data: installers } = await supabase
    .from("installers")
    .select("zones")
    .in("id", ids);

  const zones = new Set<string>();
  for (const row of installers ?? []) {
    for (const zone of row.zones ?? []) {
      if (zone.trim()) zones.add(zone.trim());
    }
  }
  return [...zones].sort((a, b) => a.localeCompare(b));
}

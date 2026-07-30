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

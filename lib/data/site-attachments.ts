import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type SiteAttachmentView = { id: string; storagePath: string; fileName: string; mimeType: string; sizeBytes: number; signedUrl: string | null };

export async function fetchSiteAttachments(supabase: SupabaseClient<Database>, siteId: string): Promise<SiteAttachmentView[]> {
  const { data } = await supabase.from("site_attachments").select("id, storage_path, file_name, mime_type, size_bytes").eq("site_id", siteId).order("created_at");
  if (!data?.length) return [];
  const { data: signed } = await supabase.storage.from("evidence").createSignedUrls(data.map((item) => item.storage_path), 60 * 30);
  const urls = new Map((signed ?? []).map((item) => [item.path, item.signedUrl ?? null]));
  return data.map((item) => ({ id: item.id, storagePath: item.storage_path, fileName: item.file_name, mimeType: item.mime_type, sizeBytes: item.size_bytes, signedUrl: urls.get(item.storage_path) ?? null }));
}

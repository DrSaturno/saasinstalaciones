import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type OrderAttachmentView = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  signedUrl: string | null;
};

/** URLs privadas y breves; las políticas de Storage vuelven a validar al usuario. */
export async function fetchOrderAttachments(
  supabase: SupabaseClient<Database>,
  orderId: string,
): Promise<OrderAttachmentView[]> {
  const { data: attachments } = await supabase
    .from("order_attachments")
    .select("id, storage_path, file_name, mime_type, size_bytes")
    .eq("order_id", orderId)
    .order("created_at");
  if (!attachments || attachments.length === 0) return [];

  const { data: signed } = await supabase.storage
    .from("evidence")
    .createSignedUrls(
      attachments.map((attachment) => attachment.storage_path),
      60 * 30,
    );
  const urlByPath = new Map(
    (signed ?? []).map((item) => [item.path, item.signedUrl ?? null]),
  );

  return attachments.map((attachment) => ({
    id: attachment.id,
    fileName: attachment.file_name,
    mimeType: attachment.mime_type,
    sizeBytes: attachment.size_bytes,
    signedUrl: urlByPath.get(attachment.storage_path) ?? null,
  }));
}


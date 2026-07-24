"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { databaseIdSchema, orderAttachmentRegistrationSchema, type OrderAttachmentRegistration } from "@/lib/domain/order-intake";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/types/database";

type Result = { error: string | null; ok?: boolean };

async function context(siteId: string) {
  const user = await getCurrentUser();
  if (!user || !["company_manager", "coordinator"].includes(user.role) || !user.companyId) throw new Error("access");
  const supabase = await createClient();
  const { data: site } = await supabase.from("sites").select("id, project_id").eq("id", siteId).eq("company_id", user.companyId).single();
  if (!site) throw new Error("site");
  return { user, supabase, site, companyId: user.companyId };
}

export async function registerSiteAttachments(siteId: string, attachments: OrderAttachmentRegistration[]): Promise<Result> {
  const t = await getTranslations("Errors");
  const id = databaseIdSchema.safeParse(siteId);
  const files = orderAttachmentRegistrationSchema.safeParse(attachments);
  if (!id.success || !files.success) return { error: t("invalidData") };
  try {
    const { user, supabase, site, companyId } = await context(id.data);
    const prefix = `${companyId}/${site.id}/`;
    if (files.data.some((file) => !file.storagePath.startsWith(prefix))) return { error: t("invalidData") };
    const rows: TablesInsert<"site_attachments">[] = files.data.map((file) => ({ site_id: site.id, company_id: companyId, storage_path: file.storagePath, file_name: file.fileName, mime_type: file.mimeType, size_bytes: file.sizeBytes, uploaded_by: user.id }));
    const { error } = await supabase.from("site_attachments").upsert(rows, { onConflict: "site_id,storage_path", ignoreDuplicates: true });
    if (error) return { error: t("operation") };
    revalidatePath(`/projects/${site.project_id}/sites/${site.id}`);
    return { error: null, ok: true };
  } catch { return { error: t("unexpected") }; }
}

export async function deleteSiteAttachment(siteId: string, attachmentId: string): Promise<Result> {
  const t = await getTranslations("Errors");
  if (!databaseIdSchema.safeParse(siteId).success || !databaseIdSchema.safeParse(attachmentId).success) return { error: t("invalidData") };
  try {
    const { supabase, site, companyId } = await context(siteId);
    const { data } = await supabase.from("site_attachments").select("storage_path").eq("id", attachmentId).eq("site_id", site.id).eq("company_id", companyId).single();
    if (!data) return { error: t("operation") };
    const { error } = await supabase.from("site_attachments").delete().eq("id", attachmentId).eq("company_id", companyId);
    if (error) return { error: t("operation") };
    await supabase.storage.from("evidence").remove([data.storage_path]);
    revalidatePath(`/projects/${site.project_id}/sites/${site.id}`);
    return { error: null, ok: true };
  } catch { return { error: t("unexpected") }; }
}

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
  if (!user || user.role !== "company_manager" || !user.companyId) throw new Error("access");
  const supabase = await createClient();
  const { data: site } = await supabase.from("sites").select("id, project_id, location_id").eq("id", siteId).eq("company_id", user.companyId).single();
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
    let error: { message: string } | null = null;
    if (site.location_id) {
      const { data: location } = await supabase
        .from("locations")
        .select("client_id")
        .eq("id", site.location_id)
        .single();
      if (!location) return { error: t("operation") };
      const rows: TablesInsert<"location_attachments">[] = files.data.map((file) => ({
        location_id: site.location_id!,
        client_id: location.client_id,
        company_id: companyId,
        storage_path: file.storagePath,
        file_name: file.fileName,
        mime_type: file.mimeType,
        size_bytes: file.sizeBytes,
        category: "general",
        uploaded_by: user.id,
      }));
      ({ error } = await supabase.from("location_attachments").insert(rows));
    } else {
      const rows: TablesInsert<"site_attachments">[] = files.data.map((file) => ({ site_id: site.id, company_id: companyId, storage_path: file.storagePath, file_name: file.fileName, mime_type: file.mimeType, size_bytes: file.sizeBytes, uploaded_by: user.id }));
      ({ error } = await supabase.from("site_attachments").upsert(rows, { onConflict: "site_id,storage_path", ignoreDuplicates: true }));
    }
    if (error) return { error: t("operation") };
    revalidatePath(`/projects/${site.project_id}/sites/${site.id}`);
    if (site.location_id) revalidatePath(`/locations/${site.location_id}`);
    return { error: null, ok: true };
  } catch { return { error: t("unexpected") }; }
}

export async function deleteSiteAttachment(siteId: string, attachmentId: string): Promise<Result> {
  const t = await getTranslations("Errors");
  if (!databaseIdSchema.safeParse(siteId).success || !databaseIdSchema.safeParse(attachmentId).success) return { error: t("invalidData") };
  try {
    const { supabase, site, companyId } = await context(siteId);
    const { data: legacy } = await supabase.from("site_attachments").select("storage_path").eq("id", attachmentId).eq("site_id", site.id).eq("company_id", companyId).maybeSingle();
    let storagePath = legacy?.storage_path ?? null;
    if (legacy) {
      const { error } = await supabase.from("site_attachments").delete().eq("id", attachmentId).eq("company_id", companyId);
      if (error) return { error: t("operation") };
    } else if (site.location_id) {
      const { data: canonical } = await supabase
        .from("location_attachments")
        .select("storage_path")
        .eq("id", attachmentId)
        .eq("location_id", site.location_id)
        .eq("company_id", companyId)
        .is("archived_at", null)
        .maybeSingle();
      if (!canonical) return { error: t("operation") };
      storagePath = canonical.storage_path;
      const { error } = await supabase
        .from("location_attachments")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", attachmentId)
        .eq("company_id", companyId);
      if (error) return { error: t("operation") };
    }
    if (!storagePath) return { error: t("operation") };
    await supabase.storage.from("evidence").remove([storagePath]);
    revalidatePath(`/projects/${site.project_id}/sites/${site.id}`);
    if (site.location_id) revalidatePath(`/locations/${site.location_id}`);
    return { error: null, ok: true };
  } catch { return { error: t("unexpected") }; }
}

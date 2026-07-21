"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { siteInputSchema } from "@/lib/domain/sites";
import { createClient } from "@/lib/supabase/server";

export type SiteActionState = { error: string | null; ok?: boolean; id?: string };

async function requireManager() {
  const user = await getCurrentUser();
  if (!user || user.role !== "company_manager" || !user.companyId) {
    throw new Error("Acceso denegado");
  }
  return { supabase: await createClient(), companyId: user.companyId };
}

function parseSiteForm(formData: FormData) {
  return siteInputSchema.safeParse({
    name: formData.get("name"),
    externalRef: formData.get("externalRef") ?? "",
    address: formData.get("address") ?? "",
    city: formData.get("city") ?? "",
    state: formData.get("state") ?? "",
    zone: formData.get("zone"),
    lat: formData.get("lat") ?? "",
    lng: formData.get("lng") ?? "",
    contactName: formData.get("contactName") ?? "",
    contactPhone: formData.get("contactPhone") ?? "",
    contactEmail: formData.get("contactEmail") ?? "",
    openingHours: formData.get("openingHours") ?? "",
    accessNotes: formData.get("accessNotes") ?? "",
    parkingNotes: formData.get("parkingNotes") ?? "",
    technicalNotes: formData.get("technicalNotes") ?? "",
    riskNotes: formData.get("riskNotes") ?? "",
    permanentNotes: formData.get("permanentNotes") ?? "",
  });
}

async function validateProjectZone(
  projectId: string,
  companyId: string,
  zone: string,
) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("id, country, zones")
    .eq("id", projectId)
    .eq("company_id", companyId)
    .single();
  return data && data.zones.includes(zone) ? data : null;
}

function revalidateSitePaths(projectId: string, siteId?: string) {
  revalidatePath(`/projects/${projectId}`);
  if (siteId) revalidatePath(`/projects/${projectId}/sites/${siteId}`);
  revalidatePath("/projects");
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  revalidatePath("/finance");
}

export async function createSite(
  projectId: string,
  _previous: SiteActionState,
  formData: FormData,
): Promise<SiteActionState> {
  const t = await getTranslations("Errors");
  const parsed = parseSiteForm(formData);
  if (!parsed.success) return { error: t("invalidData") };

  try {
    const { supabase, companyId } = await requireManager();
    const project = await validateProjectZone(projectId, companyId, parsed.data.zone);
    if (!project) return { error: t("invalidData") };

    const { data, error } = await supabase
      .from("sites")
      .insert({
        project_id: projectId,
        company_id: companyId,
        name: parsed.data.name,
        external_ref: parsed.data.externalRef || null,
        address: parsed.data.address,
        city: parsed.data.city,
        state: parsed.data.state || (project.country === "BR" ? parsed.data.zone : ""),
        zone: parsed.data.zone,
        lat: parsed.data.lat,
        lng: parsed.data.lng,
        contact_name: parsed.data.contactName,
        contact_phone: parsed.data.contactPhone,
        contact_email: parsed.data.contactEmail,
        opening_hours: parsed.data.openingHours,
        access_notes: parsed.data.accessNotes,
        parking_notes: parsed.data.parkingNotes,
        technical_notes: parsed.data.technicalNotes,
        risk_notes: parsed.data.riskNotes,
        permanent_notes: parsed.data.permanentNotes,
      })
      .select("id")
      .single();
    if (error || !data) return { error: t("operation") };
    revalidateSitePaths(projectId, data.id);
    return { error: null, ok: true, id: data.id };
  } catch {
    return { error: t("unexpected") };
  }
}

export async function updateSite(
  projectId: string,
  siteId: string,
  _previous: SiteActionState,
  formData: FormData,
): Promise<SiteActionState> {
  const t = await getTranslations("Errors");
  const parsed = parseSiteForm(formData);
  if (!parsed.success) return { error: t("invalidData") };

  try {
    const { supabase, companyId } = await requireManager();
    const project = await validateProjectZone(projectId, companyId, parsed.data.zone);
    if (!project) return { error: t("invalidData") };
    const { data, error } = await supabase
      .from("sites")
      .update({
        name: parsed.data.name,
        external_ref: parsed.data.externalRef || null,
        address: parsed.data.address,
        city: parsed.data.city,
        state: parsed.data.state || (project.country === "BR" ? parsed.data.zone : ""),
        zone: parsed.data.zone,
        lat: parsed.data.lat,
        lng: parsed.data.lng,
        contact_name: parsed.data.contactName,
        contact_phone: parsed.data.contactPhone,
        contact_email: parsed.data.contactEmail,
        opening_hours: parsed.data.openingHours,
        access_notes: parsed.data.accessNotes,
        parking_notes: parsed.data.parkingNotes,
        technical_notes: parsed.data.technicalNotes,
        risk_notes: parsed.data.riskNotes,
        permanent_notes: parsed.data.permanentNotes,
      })
      .eq("id", siteId)
      .eq("project_id", projectId)
      .eq("company_id", companyId)
      .select("id")
      .single();
    if (error || !data) return { error: t("siteNotFound") };
    revalidateSitePaths(projectId, siteId);
    return { error: null, ok: true, id: siteId };
  } catch {
    return { error: t("unexpected") };
  }
}

export async function setSiteArchived(
  projectId: string,
  siteId: string,
  archived: boolean,
): Promise<SiteActionState> {
  const t = await getTranslations("Errors");
  try {
    const { supabase, companyId } = await requireManager();
    if (archived) {
      const { count } = await supabase
        .from("work_orders")
        .select("id", { count: "exact", head: true })
        .eq("site_id", siteId)
        .not("status", "in", "(finalizada,cancelada)");
      if ((count ?? 0) > 0) return { error: t("siteHasOpenOrders") };
    }
    const { data, error } = await supabase
      .from("sites")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", siteId)
      .eq("project_id", projectId)
      .eq("company_id", companyId)
      .select("id")
      .single();
    if (error || !data) return { error: t("siteNotFound") };
    revalidateSitePaths(projectId, siteId);
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

export async function deleteEmptySite(
  projectId: string,
  siteId: string,
): Promise<SiteActionState> {
  const t = await getTranslations("Errors");
  try {
    const { supabase, companyId } = await requireManager();
    const { count } = await supabase
      .from("work_orders")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId);
    if ((count ?? 0) > 0) return { error: t("siteHasHistory") };
    const { error } = await supabase
      .from("sites")
      .delete()
      .eq("id", siteId)
      .eq("project_id", projectId)
      .eq("company_id", companyId);
    if (error) return { error: t("operation") };
    revalidateSitePaths(projectId);
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

export async function updatePlannedInstallations(
  projectId: string,
  quantity: number,
): Promise<SiteActionState> {
  const t = await getTranslations("Errors");
  const parsed = z.number().int().min(0).max(100000).safeParse(quantity);
  if (!parsed.success) return { error: t("invalidData") };
  try {
    const { supabase, companyId } = await requireManager();
    const { error } = await supabase
      .from("projects")
      .update({ planned_installations: parsed.data })
      .eq("id", projectId)
      .eq("company_id", companyId);
    if (error) return { error: t("operation") };
    revalidateSitePaths(projectId);
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

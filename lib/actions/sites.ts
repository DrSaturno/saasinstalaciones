"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { attachCanonicalLocations } from "@/lib/actions/canonical-locations";
import { getAuthorizedUser } from "@/lib/auth-authorized";
import { addressChanged } from "@/lib/domain/geocoding";
import { siteInputSchema } from "@/lib/domain/sites";
import { locateAddress } from "@/lib/geocoding/google";
import { invalidFieldMessage } from "@/lib/field-error-message";
import { logEvent } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";

export type SiteActionState = { error: string | null; ok?: boolean; id?: string };

async function requireManager() {
  const user = await getAuthorizedUser();
  if (
    !user ||
    // Sólo el gerente: las locaciones son gestión de empresa.
    user.role !== "company_manager" ||
    !user.companyId
  ) {
    throw new Error("Acceso denegado");
  }
  return {
    supabase: await createClient(),
    companyId: user.companyId,
    userId: user.id,
  };
}

function parseSiteForm(formData: FormData) {
  return siteInputSchema.safeParse({
    name: formData.get("name"),
    externalRef: formData.get("externalRef") ?? "",
    address: formData.get("address") ?? "",
    city: formData.get("city") ?? "",
    state: formData.get("state") ?? "",
    zone: formData.get("zone"),
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

/**
 * El error de validación con el mismo rótulo que el formulario. Antes era un
 * «Datos inválidos» sin más, y con quince campos no había forma de saber cuál
 * corregir.
 */
async function siteFieldError(error: z.ZodError): Promise<string> {
  const f = await getTranslations("SiteForm");
  return invalidFieldMessage(error, {
    name: f("name"),
    externalRef: f("reference"),
    address: f("address"),
    city: f("city"),
    zone: f("province"),
    contactName: f("contactName"),
    contactPhone: f("phone"),
    contactEmail: f("email"),
    openingHours: f("openingHours"),
    accessNotes: f("access"),
    parkingNotes: f("parking"),
    technicalNotes: f("technical"),
    riskNotes: f("risks"),
    permanentNotes: f("permanentNotes"),
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
    .select("id, company_id, client_id, country, zones")
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
  if (!parsed.success) return { error: await siteFieldError(parsed.error) };

  try {
    const { supabase, companyId, userId } = await requireManager();
    const project = await validateProjectZone(projectId, companyId, parsed.data.zone);
    if (!project?.client_id) return { error: t("invalidData") };

    // La ubicación sale de la dirección; nadie carga coordenadas. Si no se
    // puede ubicar (sin clave, dirección que Google no encuentra) el local se
    // guarda igual, sin ubicación.
    const coordinates = await locateAddress({
      address: parsed.data.address,
      city: parsed.data.city,
      state: parsed.data.state || parsed.data.zone,
      country: project.country,
    });

    const locationId = crypto.randomUUID();
    const { data: location, error } = await supabase
      .from("locations")
      .insert({
        id: locationId,
        company_id: companyId,
        client_id: project.client_id,
        name: parsed.data.name,
        external_ref: parsed.data.externalRef || null,
        address: parsed.data.address,
        city: parsed.data.city,
        state: parsed.data.state || parsed.data.zone,
        zone: parsed.data.zone,
        country: project.country,
        lat: coordinates?.lat ?? null,
        lng: coordinates?.lng ?? null,
        contact_name: parsed.data.contactName,
        contact_phone: parsed.data.contactPhone,
        contact_email: parsed.data.contactEmail,
        opening_hours: parsed.data.openingHours,
        access_notes: parsed.data.accessNotes,
        parking_notes: parsed.data.parkingNotes,
        technical_notes: parsed.data.technicalNotes,
        risk_notes: parsed.data.riskNotes,
        permanent_notes: parsed.data.permanentNotes,
        source: "manual",
        created_by: userId,
      })
      .select("id, company_id, client_id, name, address, city, state, zone, country, lat, lng, external_ref, contact_name, contact_phone, contact_email, opening_hours, access_notes, parking_notes, technical_notes, risk_notes, permanent_notes")
      .single();
    if (error || !location) {
      // Sin esto el motivo real se perdía: el gerente veía el mensaje genérico
      // y el log no decía nada. Así pasó dos meses sin verse que el alta
      // manual fallaba para todos con 42501 (RLS). Va el código de Postgres y
      // no el texto: `logEvent` redacta `message` a propósito, y el código ya
      // distingue permisos (42501), duplicado (23505) o restricción (23514).
      logEvent("error", "site.create_failed", {
        step: "location_insert",
        pg_code: error?.code ?? "no_row_returned",
      });
      return { error: t("operation") };
    }

    const attached = await attachCanonicalLocations(
      supabase,
      { ...project, client_id: project.client_id },
      [location],
      userId,
    );
    const siteId = attached.siteIds[0];
    if (attached.error || !siteId) {
      logEvent("error", "site.create_failed", {
        step: "attach_project",
        failed: attached.error ? "write_error" : "no_site_id",
      });
      return { error: t("operation") };
    }
    revalidateSitePaths(projectId, siteId);
    revalidatePath(`/locations/${locationId}`);
    return { error: null, ok: true, id: siteId };
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
  if (!parsed.success) return { error: await siteFieldError(parsed.error) };

  try {
    const { supabase, companyId, userId } = await requireManager();
    const project = await validateProjectZone(projectId, companyId, parsed.data.zone);
    if (!project) return { error: t("invalidData") };
    const { data: current } = await supabase
      .from("sites")
      .select("id, location_id, address, city, state, zone, lat, lng")
      .eq("id", siteId)
      .eq("project_id", projectId)
      .eq("company_id", companyId)
      .single();
    if (!current) return { error: t("siteNotFound") };

    // Sólo se vuelve a preguntar a Google si cambió el lugar. Editar un
    // teléfono no cuesta una consulta ni mueve el pin. Si cambió y la nueva
    // dirección no se puede ubicar, se descarta la ubicación vieja: un punto
    // que ya no corresponde es peor que ninguno.
    const nextState = parsed.data.state || parsed.data.zone;
    const placeChanged = addressChanged(current, {
      address: parsed.data.address,
      city: parsed.data.city,
      state: nextState,
      zone: parsed.data.zone,
    });
    const coordinates = placeChanged
      ? await locateAddress({
          address: parsed.data.address,
          city: parsed.data.city,
          state: nextState,
          country: project.country,
        })
      : current.lat !== null && current.lng !== null
        ? { lat: current.lat, lng: current.lng }
        : null;

    const identity = {
      name: parsed.data.name,
      external_ref: parsed.data.externalRef || null,
      address: parsed.data.address,
      city: parsed.data.city,
      state: parsed.data.state || parsed.data.zone,
      zone: parsed.data.zone,
      lat: coordinates?.lat ?? null,
      lng: coordinates?.lng ?? null,
      contact_name: parsed.data.contactName,
      contact_phone: parsed.data.contactPhone,
      contact_email: parsed.data.contactEmail,
      opening_hours: parsed.data.openingHours,
      access_notes: parsed.data.accessNotes,
      parking_notes: parsed.data.parkingNotes,
      technical_notes: parsed.data.technicalNotes,
      risk_notes: parsed.data.riskNotes,
      permanent_notes: parsed.data.permanentNotes,
    };
    if (current.location_id) {
      // La ficha (dirección, contacto, notas…) es de la empresa y la ven todos los
      // clientes que usan la locación. El CÓDIGO del local es del cliente: se guarda
      // en el vínculo de ESTE cliente y sólo se escribe en la ficha si este cliente
      // es el de origen (compatibilidad). Editarlo desde el proyecto de un cliente
      // nunca pisa el código de otro.
      const clientId = project.client_id;
      if (!clientId) return { error: t("invalidData") };
      const { external_ref: ownRef, ...sharedIdentity } = identity;
      const { data: origin } = await supabase
        .from("locations")
        .select("client_id")
        .eq("id", current.location_id)
        .maybeSingle();
      const isOrigin = origin?.client_id === clientId;

      const { error: locationError } = await supabase
        .from("locations")
        .update({ ...(isOrigin ? identity : sharedIdentity), updated_by: userId })
        .eq("id", current.location_id)
        .eq("company_id", companyId);
      if (locationError) return { error: t("operation") };
      const { error: linkError } = await supabase
        .from("client_locations")
        .update({ external_ref: ownRef })
        .eq("location_id", current.location_id)
        .eq("client_id", clientId)
        .eq("company_id", companyId);
      if (linkError) return { error: t("operation") };
      // El código de cada punto lo fija la base a partir del vínculo de su propio
      // cliente; acá sólo se propaga la identidad compartida.
      const { error: projectionError } = await supabase
        .from("sites")
        .update({ ...sharedIdentity, is_placeholder: false })
        .eq("location_id", current.location_id)
        .eq("company_id", companyId);
      if (projectionError) return { error: t("operation") };
      revalidatePath(`/locations/${current.location_id}`);
    } else {
      const { error: projectionError } = await supabase
        .from("sites")
        .update({ ...identity, is_placeholder: false })
        .eq("id", siteId)
        .eq("project_id", projectId)
        .eq("company_id", companyId);
      if (projectionError) return { error: t("operation") };
    }
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
      .select("id, location_id")
      .single();
    if (error || !data) return { error: t("siteNotFound") };
    if (data.location_id) {
      const { error: associationError } = await supabase
        .from("project_locations")
        .update({ status: archived ? "archived" : "active" })
        .eq("project_id", projectId)
        .eq("location_id", data.location_id)
        .eq("company_id", companyId);
      if (associationError) return { error: t("operation") };
    }
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
    const [{ count }, { data: site }] = await Promise.all([
      supabase
        .from("work_orders")
        .select("id", { count: "exact", head: true })
        .eq("site_id", siteId),
      supabase
        .from("sites")
        .select("location_id")
        .eq("id", siteId)
        .eq("project_id", projectId)
        .eq("company_id", companyId)
        .single(),
    ]);
    if ((count ?? 0) > 0) return { error: t("siteHasHistory") };
    const { error } = await supabase
      .from("sites")
      .delete()
      .eq("id", siteId)
      .eq("project_id", projectId)
      .eq("company_id", companyId);
    if (error) return { error: t("operation") };
    if (site?.location_id) {
      const { error: associationError } = await supabase
        .from("project_locations")
        .update({ status: "cancelled" })
        .eq("project_id", projectId)
        .eq("location_id", site.location_id)
        .eq("company_id", companyId);
      if (associationError) return { error: t("operation") };
    }
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

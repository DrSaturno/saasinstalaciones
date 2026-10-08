"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/domain/order-intake";
import { unavailabilitySchema, weeklyAvailabilitySchema, type WeeklyAvailabilityInput, SERVICE_RADIUS_KM, UNAVAILABILITY_REVIEW_NOTE_MAX } from "@/lib/domain/availability";
import { hasActiveCompanyRole } from "@/lib/data/company-membership-roles";
import { isInstallerArea } from "@/lib/auth";
import { getAuthorizedUser } from "@/lib/auth-authorized";
import { createClient } from "@/lib/supabase/server";
import { FIELD } from "@/lib/domain/field-rules";
import { addressChanged } from "@/lib/domain/geocoding";
import { geocodingConfigured, locateAddress } from "@/lib/geocoding/google";

type Result = { error: string | null; ok?: boolean; id?: string };

async function requireInstaller(companyId: string) {
  const user = await getAuthorizedUser();
  if (!user || !isInstallerArea(user)) throw new Error("Acceso denegado");
  const supabase = await createClient();
  const canInstall = await hasActiveCompanyRole(
    supabase,
    companyId,
    user.id,
    "installer",
  );
  if (!canInstall) throw new Error("Acceso denegado");
  return { user, supabase };
}

function revalidateAvailability() {
  revalidatePath("/profile");
  revalidatePath("/jobs");
  revalidatePath("/team");
  revalidatePath("/dashboard");
}

const coverageSchema = z.object({
  zones: z.array(z.string().trim().min(2).max(80)).max(24),
  // Dirección y ciudad con la regla común (`FIELD`): la base del instalador
  // admitía 200 caracteres de dirección y un local, 300.
  baseAddress: z.string().trim().max(FIELD.address.max),
  baseCity: z.string().trim().max(FIELD.city.max),
  serviceRadiusKm: z.union([z.literal(""), z.coerce.number().int().min(SERVICE_RADIUS_KM.min).max(SERVICE_RADIUS_KM.max)]).transform((v) => (v === "" ? null : v)),
});

export type CoverageState = { error: string | null; ok?: boolean };

/**
 * Cobertura del instalador: qué provincias trabaja y desde dónde sale.
 *
 * La base cumple dos funciones: decide qué búsquedas de la bolsa le aparecen
 * (ver `broadcast_matches_installer`, que mide contra el radio) y es el punto de
 * partida del recorrido en "Mi ruta". Sin provincias no ve ninguna búsqueda.
 */
export async function saveCoverage(
  _prev: CoverageState,
  formData: FormData,
): Promise<CoverageState> {
  const t = await getTranslations("Errors");
  const parsed = coverageSchema.safeParse({
    zones: formData.getAll("zones").map(String),
    baseAddress: formData.get("baseAddress") ?? "",
    baseCity: formData.get("baseCity") ?? "",
    serviceRadiusKm: formData.get("serviceRadiusKm") ?? "",
  });
  if (!parsed.success) return { error: t("invalidData") };

  try {
    const user = await getAuthorizedUser();
    if (!user || !isInstallerArea(user)) return { error: t("accessDenied") };
    const supabase = await createClient();

    // La base se ubica sola a partir de la dirección y la ciudad: nadie carga
    // coordenadas. Sólo se vuelve a preguntar si cambió el lugar; si no, se
    // conserva la ubicación que ya tenía.
    const { data: current } = await supabase
      .from("installers")
      .select("base_address, base_city, base_lat, base_lng")
      .eq("id", user.id)
      .maybeSingle();
    const baseChanged = addressChanged(
      { address: current?.base_address, city: current?.base_city },
      { address: parsed.data.baseAddress, city: parsed.data.baseCity },
    );
    const coordinates = baseChanged
      ? await locateAddress(
          { address: parsed.data.baseAddress, city: parsed.data.baseCity, country: "AR" },
          // Para un radio de decenas de kilómetros alcanza el centro de la ciudad.
          { allowCityOnly: true },
        )
      : current?.base_lat != null && current.base_lng != null
        ? { lat: current.base_lat, lng: current.base_lng }
        : null;

    // Un radio sin base ubicada no filtra nada: se avisa en vez de guardarlo mudo.
    if (parsed.data.serviceRadiusKm !== null && !coordinates) {
      return {
        error: geocodingConfigured() ? t("baseNotLocated") : t("locationUnavailable"),
      };
    }

    const { error } = await supabase
      .from("installers")
      .update({
        zones: parsed.data.zones,
        base_address: parsed.data.baseAddress || null,
        base_city: parsed.data.baseCity || null,
        base_lat: coordinates?.lat ?? null,
        base_lng: coordinates?.lng ?? null,
        service_radius_km: parsed.data.serviceRadiusKm,
      })
      .eq("id", user.id);
    if (error) return { error: t("operation") };
    revalidateAvailability();
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

/**
 * Reactiva la disponibilidad del instalador.
 *
 * Sólo admite ponerse DISPONIBLE. Ausentarse no es una decisión unilateral: hay
 * que cargar una ausencia con fechas y justificación, y la empresa la aprueba
 * (`addUnavailability` + `reviewUnavailability`). Si esto aceptara `false`, un
 * instalador podría desaparecer de la agenda sin avisar cuándo ni por qué,
 * que es justo lo que el circuito de ausencias evita.
 */
export async function setAvailabilityEnabled(enabled: boolean): Promise<Result> {
  const t = await getTranslations("Errors");
  if (!enabled) return { error: t("useUnavailabilityFlow") };
  try {
    const user = await getAuthorizedUser();
    if (!user || !isInstallerArea(user)) return { error: t("accessDenied") };
    const supabase = await createClient();
    const { error } = await supabase.from("installers").update({ available: enabled }).eq("id", user.id);
    if (error) return { error: t("operation") };
    revalidateAvailability();
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

export async function saveWeeklyAvailability(companyId: string, entries: WeeklyAvailabilityInput[]): Promise<Result> {
  const t = await getTranslations("Errors");
  const id = databaseIdSchema.safeParse(companyId);
  const parsed = weeklyAvailabilitySchema.safeParse(entries);
  if (!id.success || !parsed.success) return { error: t("invalidData") };
  try {
    const { supabase } = await requireInstaller(id.data);
    const { error } = await supabase.rpc("replace_installer_weekly_availability", {
      p_company_id: id.data,
      p_entries: parsed.data.map((entry) => ({ weekday: entry.weekday, starts_at: entry.startsAt, ends_at: entry.endsAt, timezone: entry.timezone })),
    });
    if (error) return { error: t("operation") };
    revalidateAvailability();
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

export async function addUnavailability(companyId: string, input: { startsAt: string; endsAt: string; reason: string }): Promise<Result> {
  const t = await getTranslations("Errors");
  const id = databaseIdSchema.safeParse(companyId);
  const parsed = unavailabilitySchema.safeParse(input);
  if (!id.success || !parsed.success) return { error: t("invalidData") };
  try {
    const { user, supabase } = await requireInstaller(id.data);
    const { data, error } = await supabase.from("installer_unavailability").insert({ company_id: id.data, installer_id: user.id, starts_at: parsed.data.startsAt, ends_at: parsed.data.endsAt, reason: parsed.data.reason }).select("id").single();
    if (error || !data) return { error: t("operation") };
    revalidateAvailability();
    return { error: null, ok: true, id: data.id };
  } catch {
    return { error: t("unexpected") };
  }
}

/**
 * La empresa resuelve un aviso de inactividad.
 *
 * Sólo las aprobadas bloquean la agenda (ver lib/data/dashboard.ts), así que
 * hasta que el manager decide, el instalador sigue contando como disponible.
 */
export async function reviewUnavailability(
  id: string,
  decision: "approved" | "rejected",
  note = "",
): Promise<Result> {
  const t = await getTranslations("Errors");
  if (!databaseIdSchema.safeParse(id).success) return { error: t("invalidData") };
  try {
    const user = await getAuthorizedUser();
    if (
      !user ||
      // Sólo el gerente aprueba o rechaza ausencias.
      user.role !== "company_manager" ||
      !user.companyId
    ) {
      return { error: t("accessDenied") };
    }
    const supabase = await createClient();
    const { error } = await supabase
      .from("installer_unavailability")
      .update({
        status: decision,
        reviewed_by: user.id,
        review_note: note.trim().slice(0, UNAVAILABILITY_REVIEW_NOTE_MAX),
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("company_id", user.companyId);
    if (error) return { error: t("operation") };
    revalidateAvailability();
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

export async function removeUnavailability(companyId: string, id: string): Promise<Result> {
  const t = await getTranslations("Errors");
  if (!databaseIdSchema.safeParse(companyId).success || !databaseIdSchema.safeParse(id).success) return { error: t("invalidData") };
  try {
    const { user, supabase } = await requireInstaller(companyId);
    const { error } = await supabase.from("installer_unavailability").delete().eq("id", id).eq("company_id", companyId).eq("installer_id", user.id);
    if (error) return { error: t("operation") };
    revalidateAvailability();
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

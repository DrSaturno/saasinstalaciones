"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/domain/order-intake";
import { unavailabilitySchema, weeklyAvailabilitySchema, type WeeklyAvailabilityInput } from "@/lib/domain/availability";
import { getCurrentUser, isInstallerArea } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Result = { error: string | null; ok?: boolean; id?: string };

async function requireInstaller(companyId: string) {
  const user = await getCurrentUser();
  if (!user || !isInstallerArea(user.role)) throw new Error("Acceso denegado");
  const supabase = await createClient();
  const { data: roster } = await supabase.from("company_installers").select("installer_id").eq("company_id", companyId).eq("installer_id", user.id).eq("status", "active").single();
  if (!roster) throw new Error("Acceso denegado");
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
  baseLat: z.union([z.literal(""), z.coerce.number().min(-90).max(90)]).transform((v) => (v === "" ? null : v)),
  baseLng: z.union([z.literal(""), z.coerce.number().min(-180).max(180)]).transform((v) => (v === "" ? null : v)),
  serviceRadiusKm: z.union([z.literal(""), z.coerce.number().int().min(1).max(3000)]).transform((v) => (v === "" ? null : v)),
});

export type CoverageState = { error: string | null; ok?: boolean };

/**
 * Cobertura del instalador: qué provincias trabaja y, opcionalmente, desde dónde
 * y hasta cuántos km. Es lo que decide qué búsquedas de la bolsa le aparecen
 * (ver la función broadcast_matches_installer). Sin provincias no ve ninguna.
 */
export async function saveCoverage(
  _prev: CoverageState,
  formData: FormData,
): Promise<CoverageState> {
  const t = await getTranslations("Errors");
  const parsed = coverageSchema.safeParse({
    zones: formData.getAll("zones").map(String),
    baseLat: formData.get("baseLat") ?? "",
    baseLng: formData.get("baseLng") ?? "",
    serviceRadiusKm: formData.get("serviceRadiusKm") ?? "",
  });
  if (!parsed.success) return { error: t("invalidData") };
  // El radio sin base desde dónde medirlo no filtra nada: se pide el par completo.
  if (
    parsed.data.serviceRadiusKm !== null &&
    (parsed.data.baseLat === null || parsed.data.baseLng === null)
  ) {
    return { error: t("coordinatePairRequired") };
  }

  try {
    const user = await getCurrentUser();
    if (!user || !isInstallerArea(user.role)) return { error: t("accessDenied") };
    const supabase = await createClient();
    const { error } = await supabase
      .from("installers")
      .update({
        zones: parsed.data.zones,
        base_lat: parsed.data.baseLat,
        base_lng: parsed.data.baseLng,
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

export async function setAvailabilityEnabled(enabled: boolean): Promise<Result> {
  const t = await getTranslations("Errors");
  try {
    const user = await getCurrentUser();
    if (!user || !isInstallerArea(user.role)) return { error: t("accessDenied") };
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
    const user = await getCurrentUser();
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
        review_note: note.trim().slice(0, 500),
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

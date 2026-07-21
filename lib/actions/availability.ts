"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { databaseIdSchema } from "@/lib/domain/order-intake";
import { unavailabilitySchema, weeklyAvailabilitySchema, type WeeklyAvailabilityInput } from "@/lib/domain/availability";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Result = { error: string | null; ok?: boolean; id?: string };

async function requireInstaller(companyId: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== "installer") throw new Error("Acceso denegado");
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

export async function setAvailabilityEnabled(enabled: boolean): Promise<Result> {
  const t = await getTranslations("Errors");
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "installer") return { error: t("accessDenied") };
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

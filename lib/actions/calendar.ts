"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getAuthorizedUser } from "@/lib/auth-authorized";
import { googleCalendarConfigured } from "@/lib/google-calendar/config";
import { syncCompanyCalendar, syncOrderToCalendar } from "@/lib/google-calendar/sync";
import { createClient } from "@/lib/supabase/server";

type Result = { error: string | null; ok?: boolean; synced?: number; removed?: number };

export async function syncGoogleCalendar(): Promise<Result> {
  const t = await getTranslations("Errors");
  try {
    const user = await getAuthorizedUser();
    if (!user || user.role !== "company_manager" || !user.companyId || !googleCalendarConfigured()) return { error: t("accessDenied") };
    const result = await syncCompanyCalendar(await createClient(), user.companyId);
    revalidatePath("/dashboard");
    return { error: null, ok: true, ...result };
  } catch { return { error: t("calendarSync") }; }
}

export async function syncOrderToGoogleCalendar(orderId: string): Promise<Result> {
  const t = await getTranslations("Errors");
  try {
    const user = await getAuthorizedUser();
    if (!user || user.role !== "company_manager" || !user.companyId || !googleCalendarConfigured()) return { error: t("accessDenied") };
    const result = await syncOrderToCalendar(await createClient(), user.companyId, orderId);
    if (!result.synced) return { error: t("calendarSync") };
    revalidatePath(`/orders/${orderId}`);
    return { error: null, ok: true, synced: 1 };
  } catch { return { error: t("calendarSync") }; }
}

export async function disconnectGoogleCalendar(): Promise<Result> {
  const t = await getTranslations("Errors");
  try {
    const user = await getAuthorizedUser();
    if (!user || user.role !== "company_manager" || !user.companyId) return { error: t("accessDenied") };
    const supabase = await createClient();
    const { error } = await supabase.from("calendar_connections").delete().eq("company_id", user.companyId);
    if (error) return { error: t("operation") };
    revalidatePath("/dashboard");
    return { error: null, ok: true };
  } catch { return { error: t("unexpected") }; }
}

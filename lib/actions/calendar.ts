"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { googleCalendarConfigured } from "@/lib/google-calendar/config";
import { syncCompanyCalendar } from "@/lib/google-calendar/sync";
import { createClient } from "@/lib/supabase/server";

type Result = { error: string | null; ok?: boolean; synced?: number; removed?: number };

export async function syncGoogleCalendar(): Promise<Result> {
  const t = await getTranslations("Errors");
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "company_manager" || !googleCalendarConfigured()) return { error: t("accessDenied") };
    const result = await syncCompanyCalendar(await createClient(), user.id);
    revalidatePath("/dashboard");
    return { error: null, ok: true, ...result };
  } catch { return { error: t("calendarSync") }; }
}

export async function disconnectGoogleCalendar(): Promise<Result> {
  const t = await getTranslations("Errors");
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "company_manager") return { error: t("accessDenied") };
    const supabase = await createClient();
    const { error } = await supabase.from("calendar_connections").delete().eq("user_id", user.id);
    if (error) return { error: t("operation") };
    revalidatePath("/dashboard");
    return { error: null, ok: true };
  } catch { return { error: t("unexpected") }; }
}

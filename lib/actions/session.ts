"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isProfileLocale, LOCALE_COOKIE } from "@/i18n/config";

export type LocaleActionResult = { error: string | null };

export async function updateLocale(value: unknown): Promise<LocaleActionResult> {
  if (!isProfileLocale(value)) return { error: "invalid_locale" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { error } = await supabase
    .from("profiles")
    .update({ locale: value })
    .eq("id", user.id);
  if (error) return { error: "update_failed" };

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
  return { error: null };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(LOCALE_COOKIE);
  redirect("/login");
}

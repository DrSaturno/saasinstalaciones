"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ROLE_HOME } from "@/lib/auth";
import { LOCALE_COOKIE } from "@/i18n/config";
import type { Locale, UserRole } from "@/types/database";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Ingresá tu contraseña"),
  next: z.string().optional(),
});

export type LoginState = { error: string | null };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const t = await getTranslations("Errors");
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });

  if (!parsed.success) {
    return { error: t("invalidData") };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return { error: t("invalidCredentials") };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, locale")
    .eq("id", data.user.id)
    .single();

  const role = profile?.role as UserRole | undefined;
  if (!profile || !role) {
    await supabase.auth.signOut();
    return { error: t("missingProfile") };
  }

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, profile.locale as Locale, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  // Solo rutas internas: rechazar protocol-relative (//evil.com) y backslash
  // (/\evil.com), que el navegador resolvería como destinos externos.
  const candidate = parsed.data.next;
  const safeNext =
    candidate?.startsWith("/") &&
    !candidate.startsWith("//") &&
    !candidate.startsWith("/\\");
  redirect(safeNext ? candidate! : ROLE_HOME[role]);
}

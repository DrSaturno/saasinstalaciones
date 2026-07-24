import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";

/** Ruta home de cada rol tras el login. */
export const ROLE_HOME: Record<UserRole, string> = {
  platform_admin: "/master",
  company_manager: "/dashboard",
  coordinator: "/dashboard",
  installer: "/tasks",
};

/** Prefijo de rutas que cada rol tiene permitido visitar. */
export const ROLE_AREA_PREFIX: Record<UserRole, string> = {
  platform_admin: "/master",
  company_manager: "/dashboard",
  coordinator: "/dashboard",
  installer: "/tasks",
};

export type CurrentUser = {
  id: string;
  email: string | null;
  role: UserRole;
  companyId: string | null;
  fullName: string;
  locale: "es" | "pt";
};

/**
 * Devuelve el usuario autenticado + su perfil, o null si no hay sesión.
 * Usa getUser() (valida el token contra Supabase), nunca getSession() solo.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id, full_name, locale")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  return {
    id: user.id,
    email: user.email ?? null,
    role: profile.role,
    companyId: profile.company_id,
    fullName: profile.full_name,
    locale: profile.locale,
  };
}

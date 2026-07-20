import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Verifica que quien llama sea platform_admin ANTES de entregar el cliente
 * service_role. Toda ruta de /api/master DEBE empezar por acá.
 *
 * Devuelve el cliente admin, o una respuesta de error lista para retornar.
 */
export async function requirePlatformAdmin(): Promise<
  | { admin: ReturnType<typeof createAdminClient>; userId: string; error?: never }
  | { admin?: never; userId?: never; error: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }

  // Lectura con RLS: el usuario solo puede leer su propio perfil.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "platform_admin") {
    return {
      error: NextResponse.json({ error: "Acceso denegado" }, { status: 403 }),
    };
  }

  return { admin: createAdminClient(), userId: user.id };
}

/** Contraseña temporal legible para el primer login del gerente. */
export function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("") + "!2aA";
}

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchTwoFactorStatus, twoFactorGate } from "@/lib/data/two-factor";

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
  const t = await getTranslations("Errors");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: t("notAuthenticated") }, { status: 401 }),
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
      error: NextResponse.json({ error: t("accessDenied") }, { status: 403 }),
    };
  }

  // Una API sí puede ser honesta y devolver 503: no hay pantalla que romper.
  // El service_role no se entrega sin saber en qué nivel está la sesión.
  const twoFactor = await fetchTwoFactorStatus(supabase);
  if (!twoFactor.resolved) {
    return { error: NextResponse.json({ error: t("unexpected") }, { status: 503 }) };
  }
  if (twoFactorGate(twoFactor, profile.role)) {
    return { error: NextResponse.json({ error: t("accessDenied") }, { status: 403 }) };
  }

  return { admin: createAdminClient(), userId: user.id };
}

/**
 * Guardia de las tareas programadas (cron). No hay sesión: quien llama es el
 * planificador de Vercel, que manda `Authorization: Bearer <CRON_SECRET>`.
 *
 * Mismo cuidado que `requirePlatformAdmin`: el cliente service_role sólo se
 * entrega después de comprobar el secreto, y la comparación es en tiempo
 * constante. Sin secreto configurado (o demasiado corto) la ruta queda cerrada:
 * un despliegue al que le falta la variable no expone nada.
 */
export function requireCronSecret(request: Request):
  | { admin: ReturnType<typeof createAdminClient>; error?: never }
  | { admin?: never; error: NextResponse } {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16) {
    return { error: NextResponse.json({ error: "cron_not_configured" }, { status: 503 }) };
  }
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  return { admin: createAdminClient() };
}

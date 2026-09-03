"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, isInstallerArea } from "@/lib/auth";
import { fetchActiveCompanyRoleMemberships } from "@/lib/data/company-membership-roles";

export type Result = { error: string | null; ok?: boolean };

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

const weeklySchema = z
  .array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      startsAt: z.string().regex(TIME),
      endsAt: z.string().regex(TIME),
    }),
  )
  .max(21)
  .refine((entries) => entries.every((entry) => entry.endsAt > entry.startsAt));

const absenceSchema = z.object({
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  reason: z.string().trim().min(2).max(500),
});

/**
 * La empresa que queda registrada como procedencia de la fila.
 *
 * Las tablas globales piden `company_id` por la convención de inquilino, y el
 * trigger exige que la persona sea instaladora ahí. Pero el intervalo vale en
 * todas partes: cuál de sus empresas quede anotada no cambia a quién afecta.
 * Se toma la primera activa y se documenta acá para que nadie lea ese campo
 * como si fuera un alcance.
 */
async function ownCompanyId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  installerId: string,
): Promise<string | null> {
  const memberships = await fetchActiveCompanyRoleMemberships(
    supabase,
    "installer",
    { userId: installerId },
  );
  return memberships[0]?.companyId ?? null;
}

async function requireInstaller() {
  const user = await getCurrentUser();
  if (!user || !isInstallerArea(user)) {
    throw new Error("Acceso denegado");
  }
  return { user, supabase: await createClient() };
}

/**
 * Reemplaza la grilla semanal propia.
 *
 * Se borra y se vuelve a escribir en vez de diferenciar: acá no hay ninguna
 * fecha que preservar —a diferencia de las condiciones de una orden, donde el
 * `created_at` es prueba de cuándo se declaró—, así que la simplicidad gana.
 */
export async function saveGlobalWeeklyAvailability(
  entries: z.infer<typeof weeklySchema>,
): Promise<Result> {
  const t = await getTranslations("Errors");
  const parsed = weeklySchema.safeParse(entries);
  if (!parsed.success) return { error: t("invalidData") };

  try {
    const { user, supabase } = await requireInstaller();
    const companyId = await ownCompanyId(supabase, user.id);
    if (!companyId) return { error: t("unexpected") };

    await supabase
      .from("installer_global_weekly_availability")
      .delete()
      .eq("installer_id", user.id);

    if (parsed.data.length > 0) {
      const { error } = await supabase
        .from("installer_global_weekly_availability")
        .insert(
          parsed.data.map((entry) => ({
            installer_id: user.id,
            company_id: companyId,
            weekday: entry.weekday,
            starts_at: entry.startsAt,
            ends_at: entry.endsAt,
          })),
        );
      if (error) return { error: error.message };
    }

    revalidatePath("/profile");
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

/**
 * Una ausencia propia.
 *
 * A diferencia de las de cada empresa, ésta **no se somete a aprobación**: es la
 * persona diciendo cuándo no está, y nadie tiene que autorizarle su propio
 * tiempo. Lo que sí hace la plataforma es usarla para no ofrecerle trabajos en
 * ese rango — que es justamente la protección que este punto persigue.
 */
export async function addGlobalAbsence(input: {
  startsAt: string;
  endsAt: string;
  reason: string;
}): Promise<Result> {
  const t = await getTranslations("Errors");
  const parsed = absenceSchema.safeParse(input);
  if (!parsed.success) return { error: t("invalidData") };
  if (parsed.data.endsAt <= parsed.data.startsAt) {
    return { error: t("invalidData") };
  }

  try {
    const { user, supabase } = await requireInstaller();
    const companyId = await ownCompanyId(supabase, user.id);
    if (!companyId) return { error: t("unexpected") };

    const { error } = await supabase
      .from("installer_global_unavailability")
      .insert({
        installer_id: user.id,
        company_id: companyId,
        starts_at: parsed.data.startsAt,
        ends_at: parsed.data.endsAt,
        reason: parsed.data.reason,
      });
    if (error) return { error: error.message };

    revalidatePath("/profile");
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

/** Se marca cancelada, no se borra: el rango dejó de valer, pero existió. */
export async function cancelGlobalAbsence(id: string): Promise<Result> {
  const t = await getTranslations("Errors");
  if (!z.string().uuid().safeParse(id).success) return { error: t("invalidData") };

  try {
    const { user, supabase } = await requireInstaller();
    const { error } = await supabase
      .from("installer_global_unavailability")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("installer_id", user.id);
    if (error) return { error: error.message };

    revalidatePath("/profile");
    return { error: null, ok: true };
  } catch {
    return { error: t("unexpected") };
  }
}

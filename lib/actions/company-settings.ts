"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { canOperateCompany, getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type CompanySettingsState = { error: string | null; ok?: boolean };

const schema = z.object({
  minCompletionPhotos: z.coerce.number().int().min(0).max(20),
});

/**
 * Fija el mínimo de fotos que la empresa exige para cerrar una orden
 * (FLD-R4.2).
 *
 * Es el valor por defecto de toda la empresa; cada proyecto puede subirlo o
 * bajarlo desde su ficha. Cambiarlo NO revisa las órdenes ya cerradas: lo que
 * se aprobó con la política anterior queda aprobado, porque reabrir trabajo
 * terminado por un cambio de configuración sería peor que el problema que
 * resuelve.
 */
export async function updateCompanyFieldSettings(
  _prev: CompanySettingsState,
  formData: FormData,
): Promise<CompanySettingsState> {
  const t = await getTranslations("Errors");
  const parsed = schema.safeParse({
    minCompletionPhotos: formData.get("minCompletionPhotos"),
  });
  if (!parsed.success) return { error: t("invalidData") };

  try {
    const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
    // Sólo gerencia: el mínimo de evidencia es política de la empresa, no una
    // preferencia de quien coordina un proyecto.
    if (!user || user.role !== "company_manager" || !user.companyId) {
      return { error: t("accessDenied") };
    }
    if (!canOperateCompany(user, user.companyId)) return { error: t("accessDenied") };

    // Por RPC y no por `update`: `companies` no tiene policy de UPDATE, así
    // que un update directo afectaría cero filas en silencio y esta acción
    // respondería "guardado" sin haber guardado nada. La función escribe sólo
    // esta columna — una policy amplia sobre la tabla dejaría al gerente tocar
    // también `status` y levantarse una suspensión.
    const { error } = await supabase.rpc("set_company_min_completion_photos", {
      p_value: parsed.data.minCompletionPhotos,
    });
    if (error) return { error: error.message };
  } catch {
    return { error: t("unexpected") };
  }

  revalidatePath("/settings");
  return { error: null, ok: true };
}

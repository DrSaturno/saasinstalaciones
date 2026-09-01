"use server";

import { getTranslations } from "next-intl/server";
import { databaseIdSchema } from "@/lib/domain/order-intake";
import { fetchLocationRequirements, type LocationRequirementView } from "@/lib/data/location-detail";
import { operatedCompany, requireOperator } from "./context";

export type SiteRequirementsPreviewResult = {
  error: string | null;
  requirements: LocationRequirementView[];
};

const OPEN_STATUSES = new Set(["pending", "expired", "rejected"]);

/**
 * Los permisos que hay que resolver ANTES de ir, para el sitio que se acaba
 * de elegir al crear una orden.
 *
 * `getOrderFormSites` ya trajo un flag liviano por sitio (`hasOpenRequirements`);
 * esto trae el detalle real, y sólo cuando hace falta — no tiene sentido
 * cargarlo para un sitio que el usuario ni miró.
 *
 * Filtra a `pending`/`expired`/`rejected`: es un aviso, no la ficha completa
 * (esa ya existe en `/locations/[id]` y en la página del sitio).
 */
export async function getSiteRequirementsPreview(
  siteId: string,
): Promise<SiteRequirementsPreviewResult> {
  const t = await getTranslations("Errors");
  if (!databaseIdSchema.safeParse(siteId).success) {
    return { error: t("invalidData"), requirements: [] };
  }

  try {
    const { supabase, user } = await requireOperator();
    const { data: site } = await supabase
      .from("sites")
      .select("id, company_id, location_id")
      .eq("id", siteId)
      .single();
    if (!site) return { error: t("siteNotFound"), requirements: [] };
    operatedCompany(user, site.company_id);

    if (!site.location_id) return { error: null, requirements: [] };

    const requirements = await fetchLocationRequirements(supabase, site.location_id);
    return {
      error: null,
      requirements: requirements.filter((item) => OPEN_STATUSES.has(item.status)),
    };
  } catch {
    return { error: t("unexpected"), requirements: [] };
  }
}

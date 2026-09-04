"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { createClient } from "@/lib/supabase/server";
import { hasActiveCompanyRole } from "@/lib/data/company-membership-roles";
import { projectInputSchema } from "@/lib/domain/projects";
import { requireOperator } from "./context";
import type { ActionState } from "./types";

/**
 * Resuelve el coordinador responsable del proyecto.
 *
 * Devuelve `undefined` si el id vino cargado pero no corresponde a un
 * coordinador de la empresa (dato inválido), y `null` cuando el proyecto queda
 * sin coordinador asignado, que es un estado legítimo: la columna es nullable y
 * una empresa puede no tener ningún coordinador todavía.
 */
async function resolveCoordinatorId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  coordinatorId: string | null,
): Promise<string | null | undefined> {
  if (!coordinatorId) return null;

  const canCoordinate = await hasActiveCompanyRole(
    supabase,
    companyId,
    coordinatorId,
    "coordinator",
  );

  return canCoordinate ? coordinatorId : undefined;
}

function parseProjectForm(formData: FormData) {
  return projectInputSchema.safeParse({
    name: formData.get("name"),
    clientId: formData.get("clientId"),
    coordinatorId: formData.get("coordinatorId"),
    description: formData.get("description") ?? "",
    startsAt: formData.get("startsAt") ?? "",
    endsAt: formData.get("endsAt") ?? "",
    country: formData.get("country"),
    zones: formData.getAll("zones"),
    plannedInstallations: formData.get("plannedInstallations"),
    billingMode: formData.get("billingMode"),
    contractAmount: formData.get("contractAmount") ?? "",
  });
}

export async function createProject(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("Errors");
  const parsed = parseProjectForm(formData);
  if (!parsed.success) {
    return { error: t("invalidData") };
  }

  let createdId: string | undefined;
  try {
    const { supabase, companyId } = await requireOperator();
    const [{ data: client }, coordinatorId] = await Promise.all([
      supabase
        .from("clients")
        .select("id, name")
        .eq("id", parsed.data.clientId)
        .eq("company_id", companyId)
        .single(),
      resolveCoordinatorId(
        supabase,
        companyId,
        parsed.data.coordinatorId,
      ),
    ]);
    if (!client || coordinatorId === undefined) return { error: t("invalidData") };
    const { data, error } = await supabase
      .from("projects")
      .insert({
        company_id: companyId,
        name: parsed.data.name,
        client_name: client.name,
        client_id: client.id,
        coordinator_id: coordinatorId,
        description: parsed.data.description,
        status: "active",
        starts_at: parsed.data.startsAt,
        ends_at: parsed.data.endsAt,
        country: parsed.data.country,
        zones: parsed.data.zones,
        planned_installations: parsed.data.plannedInstallations,
        billing_mode: parsed.data.billingMode,
        contract_amount:
          parsed.data.billingMode === "project"
            ? parsed.data.contractAmount
            : null,
        currency: parsed.data.country === "BR" ? "BRL" : "ARS",
      })
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? t("operation") };
    createdId = data.id;
  } catch {
    return { error: t("unexpected") };
  }

  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return { error: null, ok: true, id: createdId };
}

export async function updateProject(
  projectId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations("Errors");
  const parsed = parseProjectForm(formData);
  if (!parsed.success) return { error: t("invalidData") };

  try {
    const { supabase, companyId } = await requireOperator();
    const [{ data: current }, { data: sites }] = await Promise.all([
      supabase.from("projects").select("country").eq("id", projectId).eq("company_id", companyId).single(),
      supabase.from("sites").select("zone").eq("project_id", projectId).eq("company_id", companyId),
    ]);
    if (!current) return { error: t("projectNotFound") };
    const [{ data: client }, coordinatorId] = await Promise.all([
      supabase.from("clients").select("id, name").eq("id", parsed.data.clientId).eq("company_id", companyId).single(),
      resolveCoordinatorId(supabase, companyId, parsed.data.coordinatorId),
    ]);
    if (!client || coordinatorId === undefined) return { error: t("invalidData") };
    if ((sites ?? []).length > 0 && current.country !== parsed.data.country) return { error: t("projectCountryLocked") };
    const zonesInUse = [...new Set((sites ?? []).map((site) => site.zone).filter(Boolean))];
    if (zonesInUse.some((zone) => !parsed.data.zones.includes(zone))) return { error: t("projectZonesInUse") };
    const { data, error } = await supabase
      .from("projects")
      .update({
        name: parsed.data.name,
        client_name: client.name,
        client_id: client.id,
        coordinator_id: coordinatorId,
        description: parsed.data.description,
        starts_at: parsed.data.startsAt,
        ends_at: parsed.data.endsAt,
        country: parsed.data.country,
        zones: parsed.data.zones,
        planned_installations: parsed.data.plannedInstallations,
        billing_mode: parsed.data.billingMode,
        contract_amount:
          parsed.data.billingMode === "project"
            ? parsed.data.contractAmount
            : null,
        currency: parsed.data.country === "BR" ? "BRL" : "ARS",
        min_completion_photos: parsed.data.minCompletionPhotos,
      })
      .eq("id", projectId)
      .eq("company_id", companyId)
      .select("id")
      .single();
    if (error || !data) return { error: t("projectNotFound") };
  } catch {
    return { error: t("unexpected") };
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  revalidatePath("/finance");
  return { error: null, ok: true };
}

export async function updateProjectStatus(
  projectId: string,
  status: "draft" | "active" | "paused" | "done",
): Promise<ActionState> {
  const t = await getTranslations("Errors");
  try {
    const { supabase, companyId } = await requireOperator();
    const { error } = await supabase
      .from("projects")
      .update({ status })
      .eq("id", projectId)
      .eq("company_id", companyId);
    if (error) return { error: error.message };
  } catch {
    return { error: t("unexpected") };
  }
  revalidatePath("/projects");
  return { error: null, ok: true };
}

/**
 * Archiva o desarchiva un proyecto.
 *
 * Archivar reemplaza al borrado: el proyecto, sus locaciones y sus órdenes
 * siguen existiendo y se pueden consultar; sólo salen del listado corriente.
 * Por eso es reversible y no toca ningún dato asociado.
 */
export async function setProjectArchived(
  projectId: string,
  archived: boolean,
): Promise<ActionState> {
  const t = await getTranslations("Errors");
  try {
    const { supabase, companyId } = await requireOperator();

    const { data: current } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("company_id", companyId)
      .single();
    if (!current) return { error: t("projectNotFound") };

    const { error } = await supabase
      .from("projects")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", projectId)
      .eq("company_id", companyId);
    if (error) return { error: error.message };

    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/dashboard");
  } catch {
    return { error: t("unexpected") };
  }
  return { error: null, ok: true };
}

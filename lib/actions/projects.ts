"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { parseCsv, normalizeHeader } from "@/lib/csv";
import { projectInputSchema } from "@/lib/domain/projects";
import type { TablesInsert } from "@/types/database";

/** Toda acción de empresa resuelve company_id desde la sesión, nunca del cliente. */
async function requireManager() {
  const user = await getCurrentUser();
  if (!user || user.role !== "company_manager" || !user.companyId) {
    throw new Error("Acceso denegado");
  }
  return { user, supabase: await createClient(), companyId: user.companyId };
}

export type ActionState = { error: string | null; ok?: boolean };

function parseProjectForm(formData: FormData) {
  return projectInputSchema.safeParse({
    name: formData.get("name"),
    clientName: formData.get("clientName"),
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

  try {
    const { supabase, companyId } = await requireManager();
    const { error } = await supabase.from("projects").insert({
      company_id: companyId,
      name: parsed.data.name,
      client_name: parsed.data.clientName,
      description: parsed.data.description,
      status: "active",
      starts_at: parsed.data.startsAt,
      ends_at: parsed.data.endsAt,
      country: parsed.data.country,
      zones: parsed.data.zones,
      planned_installations: parsed.data.plannedInstallations,
      billing_mode: parsed.data.billingMode,
      contract_amount:
        parsed.data.billingMode === "project" ? parsed.data.contractAmount : null,
      currency: parsed.data.country === "BR" ? "BRL" : "ARS",
    });
    if (error) return { error: error.message };
  } catch {
    return { error: t("unexpected") };
  }

  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return { error: null, ok: true };
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
    const { supabase, companyId } = await requireManager();
    const [{ data: current }, { data: sites }] = await Promise.all([
      supabase.from("projects").select("contract_amount, country").eq("id", projectId).eq("company_id", companyId).single(),
      supabase.from("sites").select("zone").eq("project_id", projectId).eq("company_id", companyId),
    ]);
    if (!current) return { error: t("projectNotFound") };
    if ((sites ?? []).length > 0 && current.country !== parsed.data.country) return { error: t("projectCountryLocked") };
    const zonesInUse = [...new Set((sites ?? []).map((site) => site.zone).filter(Boolean))];
    if (zonesInUse.some((zone) => !parsed.data.zones.includes(zone))) return { error: t("projectZonesInUse") };
    const { data, error } = await supabase
      .from("projects")
      .update({
        name: parsed.data.name,
        client_name: parsed.data.clientName,
        description: parsed.data.description,
        starts_at: parsed.data.startsAt,
        ends_at: parsed.data.endsAt,
        country: parsed.data.country,
        zones: parsed.data.zones,
        planned_installations: parsed.data.plannedInstallations,
        billing_mode: parsed.data.billingMode,
        contract_amount:
          parsed.data.billingMode === "project" ? parsed.data.contractAmount : current.contract_amount,
        currency: parsed.data.country === "BR" ? "BRL" : "ARS",
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
    const { supabase, companyId } = await requireManager();
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

// ---------------------------------------------------------------------------
// Importación masiva de puntos
// ---------------------------------------------------------------------------

const COLUMN_ALIASES: Record<string, string[]> = {
  name: ["nombre", "name", "punto", "sitio", "local", "estacion", "sucursal"],
  address: ["direccion", "address", "domicilio", "endereco", "calle"],
  city: ["ciudad", "city", "localidad", "cidade"],
  state: ["provincia", "state", "estado", "departamento"],
  zone: ["zona", "zone", "region", "regiao"],
  externalRef: ["codigo", "ref", "referencia", "external", "id", "externalref"],
};

const siteRowSchema = z.object({
  name: z.string().min(1, "Falta el nombre"),
  address: z.string().default(""),
  city: z.string().default(""),
  state: z.string().default(""),
  zone: z.string().default(""),
  externalRef: z.string().optional(),
});

export type ImportResult = {
  error: string | null;
  inserted: number;
  skipped: { row: number; reason: string }[];
};

const BATCH_SIZE = 500;

export async function importSites(
  projectId: string,
  csvText: string,
): Promise<ImportResult> {
  const t = await getTranslations("Errors");
  let ctx;
  try {
    ctx = await requireManager();
  } catch {
    return {
      error: t("accessDenied"),
      inserted: 0,
      skipped: [],
    };
  }
  const { supabase, companyId } = ctx;

  // Verificar que el proyecto sea de esta empresa (RLS ya lo garantiza,
  // pero así damos un error claro en vez de un insert vacío).
  const { data: project } = await supabase
    .from("projects")
    .select("id, country, zones")
    .eq("id", projectId)
    .eq("company_id", companyId)
    .single();
  if (!project) {
    return { error: t("projectNotFound"), inserted: 0, skipped: [] };
  }

  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return {
      error: t("csvNoRows"),
      inserted: 0,
      skipped: [],
    };
  }

  // Mapear encabezados a nuestros campos.
  const headers = rows[0].map(normalizeHeader);
  const indexOf: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const idx = headers.findIndex((h) => aliases.includes(h));
    if (idx >= 0) indexOf[field] = idx;
  }
  if (indexOf.name === undefined) {
    return {
      error: t("csvMissingName", { headers: rows[0].join(", ") }),
      inserted: 0,
      skipped: [],
    };
  }

  const valid: TablesInsert<"sites">[] = [];
  const skipped: ImportResult["skipped"] = [];

  rows.slice(1).forEach((cells, i) => {
    const get = (field: string) =>
      indexOf[field] !== undefined ? (cells[indexOf[field]] ?? "") : "";

    const importedZone = get("zone").trim();
    const importedState = get("state").trim();
    const zone = importedZone ||
      (project.country === "BR" ? importedState.toUpperCase() : "") ||
      (project.zones.length === 1 ? project.zones[0] : "");

    const parsed = siteRowSchema.safeParse({
      name: get("name"),
      address: get("address"),
      city: get("city"),
      state: importedState || (project.country === "BR" ? zone : ""),
      zone,
      externalRef: get("externalRef") || undefined,
    });

    if (!parsed.success) {
      // +2: fila 1 es el encabezado y las filas se cuentan desde 1.
      skipped.push({
        row: i + 2,
        reason: t("missingName"),
      });
      return;
    }

    if (!project.zones.includes(parsed.data.zone)) {
      skipped.push({
        row: i + 2,
        reason: t("siteZoneOutsideProject", { zone: parsed.data.zone || "—" }),
      });
      return;
    }

    valid.push({
      project_id: projectId,
      company_id: companyId,
      name: parsed.data.name,
      address: parsed.data.address,
      city: parsed.data.city,
      state: parsed.data.state,
      zone: parsed.data.zone,
      external_ref: parsed.data.externalRef ?? null,
    });
  });

  // Insertar en lotes: 2000 filas en un solo insert es frágil y lento.
  let inserted = 0;
  for (let i = 0; i < valid.length; i += BATCH_SIZE) {
    const batch = valid.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("sites").insert(batch);
    if (error) {
      return {
        error: t("importBatch", { count: inserted, error: error.message }),
        inserted,
        skipped,
      };
    }
    inserted += batch.length;
  }

  revalidatePath(`/projects/${projectId}`);
  return { error: null, inserted, skipped };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { parseCsv, normalizeHeader } from "@/lib/csv";
import type { TablesInsert } from "@/types/database";

/** Toda acción de empresa resuelve company_id desde la sesión, nunca del cliente. */
async function requireManager() {
  const user = await getCurrentUser();
  if (!user || user.role !== "company_manager" || !user.companyId) {
    throw new Error("Acceso denegado");
  }
  return { user, supabase: await createClient(), companyId: user.companyId };
}

const projectSchema = z.object({
  name: z.string().min(2, "El nombre es muy corto").max(150),
  clientName: z.string().max(150).optional().default(""),
  description: z.string().max(2000).optional().default(""),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
});

export type ActionState = { error: string | null; ok?: boolean };

export async function createProject(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    clientName: formData.get("clientName") ?? "",
    description: formData.get("description") ?? "",
    startsAt: formData.get("startsAt") || undefined,
    endsAt: formData.get("endsAt") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  try {
    const { supabase, companyId } = await requireManager();
    const { error } = await supabase.from("projects").insert({
      company_id: companyId,
      name: parsed.data.name,
      client_name: parsed.data.clientName,
      description: parsed.data.description,
      status: "active",
      starts_at: parsed.data.startsAt || null,
      ends_at: parsed.data.endsAt || null,
    });
    if (error) return { error: error.message };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" };
  }

  revalidatePath("/projects");
  return { error: null, ok: true };
}

export async function updateProjectStatus(
  projectId: string,
  status: "draft" | "active" | "paused" | "done",
): Promise<ActionState> {
  try {
    const { supabase, companyId } = await requireManager();
    const { error } = await supabase
      .from("projects")
      .update({ status })
      .eq("id", projectId)
      .eq("company_id", companyId);
    if (error) return { error: error.message };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error inesperado" };
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
  let ctx;
  try {
    ctx = await requireManager();
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Error",
      inserted: 0,
      skipped: [],
    };
  }
  const { supabase, companyId } = ctx;

  // Verificar que el proyecto sea de esta empresa (RLS ya lo garantiza,
  // pero así damos un error claro en vez de un insert vacío).
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("company_id", companyId)
    .single();
  if (!project) {
    return { error: "Proyecto no encontrado", inserted: 0, skipped: [] };
  }

  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return {
      error: "El archivo no tiene filas de datos (¿falta el encabezado?)",
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
      error: `No se encontró la columna de nombre. Encabezados leídos: ${rows[0].join(", ")}`,
      inserted: 0,
      skipped: [],
    };
  }

  const valid: TablesInsert<"sites">[] = [];
  const skipped: ImportResult["skipped"] = [];

  rows.slice(1).forEach((cells, i) => {
    const get = (field: string) =>
      indexOf[field] !== undefined ? (cells[indexOf[field]] ?? "") : "";

    const parsed = siteRowSchema.safeParse({
      name: get("name"),
      address: get("address"),
      city: get("city"),
      state: get("state"),
      zone: get("zone"),
      externalRef: get("externalRef") || undefined,
    });

    if (!parsed.success) {
      // +2: fila 1 es el encabezado y las filas se cuentan desde 1.
      skipped.push({
        row: i + 2,
        reason: parsed.error.issues[0]?.message ?? "Fila inválida",
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
        error: `Se importaron ${inserted} puntos y falló el lote siguiente: ${error.message}`,
        inserted,
        skipped,
      };
    }
    inserted += batch.length;
  }

  revalidatePath(`/projects/${projectId}`);
  return { error: null, inserted, skipped };
}

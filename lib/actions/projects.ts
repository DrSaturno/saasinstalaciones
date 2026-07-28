"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { parseCsv, normalizeHeader } from "@/lib/csv";
import { projectInputSchema } from "@/lib/domain/projects";
import { SITE_TEMPLATE_HEADERS } from "@/lib/domain/site-template";
import type { TablesInsert } from "@/types/database";

/** Toda acción de empresa resuelve company_id desde la sesión, nunca del cliente. */
async function requireOperator() {
  const user = await getCurrentUser();
  if (
    !user ||
    // Sólo el gerente: los proyectos son gestión de empresa. El coordinador
    // opera únicamente órdenes (lib/actions/orders.ts).
    user.role !== "company_manager" ||
    !user.companyId
  ) {
    throw new Error("Acceso denegado");
  }
  return { user, supabase: await createClient(), companyId: user.companyId };
}

export type ActionState = { error: string | null; ok?: boolean };

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
  user: { id: string; role: string },
  coordinatorId: string | null,
): Promise<string | null | undefined> {
  // Un coordinador siempre queda como responsable de lo que crea o edita.
  const wanted = user.role === "coordinator" ? user.id : coordinatorId;
  if (!wanted) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", wanted)
    .eq("company_id", companyId)
    .eq("role", "coordinator")
    .single();

  return data?.id ?? undefined;
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

  try {
    const { supabase, companyId, user } = await requireOperator();
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
        user,
        parsed.data.coordinatorId,
      ),
    ]);
    if (!client || coordinatorId === undefined) return { error: t("invalidData") };
    const { error } = await supabase.from("projects").insert({
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
      billing_mode:
        user.role === "company_manager"
          ? parsed.data.billingMode
          : "per_installation",
      contract_amount:
        user.role === "company_manager" && parsed.data.billingMode === "project"
          ? parsed.data.contractAmount
          : null,
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
    const { supabase, companyId, user } = await requireOperator();
    const [{ data: current }, { data: sites }] = await Promise.all([
      supabase.from("projects").select("contract_amount, country, billing_mode, currency, coordinator_id").eq("id", projectId).eq("company_id", companyId).single(),
      supabase.from("sites").select("zone").eq("project_id", projectId).eq("company_id", companyId),
    ]);
    if (!current) return { error: t("projectNotFound") };
    if (user.role === "coordinator" && current.coordinator_id !== user.id) {
      return { error: t("accessDenied") };
    }
    const [{ data: client }, coordinatorId] = await Promise.all([
      supabase.from("clients").select("id, name").eq("id", parsed.data.clientId).eq("company_id", companyId).single(),
      resolveCoordinatorId(supabase, companyId, user, parsed.data.coordinatorId),
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
        billing_mode: user.role === "company_manager" ? parsed.data.billingMode : current.billing_mode,
        contract_amount:
          user.role === "company_manager" && parsed.data.billingMode === "project"
            ? parsed.data.contractAmount
            : current.contract_amount,
        currency:
          user.role === "company_manager"
            ? parsed.data.country === "BR" ? "BRL" : "ARS"
            : current.currency,
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
  lat: ["lat", "latitud", "latitude"],
  lng: ["lng", "lon", "longitud", "longitude"],
};

const siteRowSchema = z.object({
  name: z.string().min(1, "Falta el nombre"),
  address: z.string().default(""),
  city: z.string().default(""),
  state: z.string().default(""),
  zone: z.string().default(""),
  externalRef: z.string().optional(),
  lat: z.union([z.literal(""), z.coerce.number().min(-90).max(90)]),
  lng: z.union([z.literal(""), z.coerce.number().min(-180).max(180)]),
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
    ctx = await requireOperator();
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

    // Provincia = zona = state. Puede venir de la columna "zona" o "provincia";
    // si el proyecto opera una sola provincia, se usa esa por defecto.
    const importedZone = get("zone").trim();
    const importedState = get("state").trim();
    const zone = importedZone || importedState ||
      (project.zones.length === 1 ? project.zones[0] : "");

    const parsed = siteRowSchema.safeParse({
      name: get("name"),
      address: get("address"),
      city: get("city"),
      state: zone,
      zone,
      externalRef: get("externalRef") || undefined,
      lat: get("lat"),
      lng: get("lng"),
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
      lat: parsed.data.lat === "" ? null : parsed.data.lat,
      lng: parsed.data.lng === "" ? null : parsed.data.lng,
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
    const { supabase, companyId, user } = await requireOperator();

    const { data: current } = await supabase
      .from("projects")
      .select("coordinator_id")
      .eq("id", projectId)
      .eq("company_id", companyId)
      .single();
    if (!current) return { error: t("projectNotFound") };

    // Un coordinador sólo puede archivar los proyectos que tiene a cargo.
    if (user.role === "coordinator" && current.coordinator_id !== user.id) {
      return { error: t("accessDenied") };
    }

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

/**
 * Importa locaciones desde un archivo, sea Excel (.xlsx) o CSV.
 *
 * El Excel se convierte a las mismas filas que produce el parser de CSV y se
 * delega en `importSites`, así hay UN solo camino de validación e inserción.
 * Convertir en el servidor evita mandar exceljs al navegador.
 */
export async function importSitesFile(
  projectId: string,
  formData: FormData,
): Promise<ImportResult> {
  const t = await getTranslations("Errors");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: t("invalidData"), inserted: 0, skipped: [] };
  }
  // 20 MB cubre planillas de decenas de miles de filas.
  if (file.size > 20 * 1_024 * 1_024) {
    return { error: t("fileTooLarge"), inserted: 0, skipped: [] };
  }

  const isExcel =
    file.name.toLowerCase().endsWith(".xlsx") ||
    file.type.includes("spreadsheetml");

  if (!isExcel) {
    return importSites(projectId, await file.text());
  }

  try {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());

    // La primera hoja con datos; la de instrucciones no tiene encabezados.
    const sheet =
      workbook.worksheets.find((candidate) =>
        String(candidate.getRow(1).getCell(1).value ?? "")
          .toLowerCase()
          .includes("nombre"),
      ) ?? workbook.worksheets[0];
    if (!sheet) return { error: t("csvNoRows"), inserted: 0, skipped: [] };

    const lines: string[] = [];
    sheet.eachRow((row) => {
      const values: string[] = [];
      for (let index = 1; index <= SITE_TEMPLATE_HEADERS.length; index++) {
        const cell = row.getCell(index);
        let text = "";
        if (cell.value !== null && cell.value !== undefined) {
          if (typeof cell.value === "object" && "result" in cell.value) {
            text = String(cell.value.result ?? "");
          } else if (cell.value instanceof Date) {
            text = cell.value.toISOString().slice(0, 10);
          } else {
            text = String(cell.value);
          }
        }
        // El encabezado marca las obligatorias con "*": se saca para que el
        // nombre de columna coincida con el que espera el parser.
        values.push(text.replace(/\s*\*\s*$/, "").trim());
      }
      if (values.some((value) => value !== "")) {
        // Comillas para que las direcciones con coma no partan la columna.
        lines.push(values.map((value) => `"${value.replace(/"/g, '""')}"`).join(","));
      }
    });

    if (lines.length < 2) {
      return { error: t("csvNoRows"), inserted: 0, skipped: [] };
    }

    return importSites(projectId, lines.join("\r\n"));
  } catch {
    return { error: t("excelUnreadable"), inserted: 0, skipped: [] };
  }
}

/**
 * Locaciones que ese cliente ya tiene cargadas en OTROS proyectos.
 *
 * Un cliente que vuelve suele instalar en los mismos locales, así que cargarlos
 * de nuevo a mano (o volver a importar la planilla) es trabajo repetido. Sólo
 * se ofrecen las que todavía no están en este proyecto, comparando por código
 * interno y, si no lo tienen, por nombre y dirección.
 */
export async function fetchReusableSites(projectId: string): Promise<{
  error: string | null;
  sites: {
    id: string;
    name: string;
    address: string;
    city: string;
    state: string;
    externalRef: string | null;
    projectName: string;
  }[];
}> {
  const t = await getTranslations("Errors");
  try {
    const { supabase, companyId } = await requireOperator();

    const { data: project } = await supabase
      .from("projects")
      .select("id, client_id")
      .eq("id", projectId)
      .eq("company_id", companyId)
      .single();
    if (!project?.client_id) return { error: null, sites: [] };

    // Los demás proyectos del mismo cliente.
    const { data: siblings } = await supabase
      .from("projects")
      .select("id, name")
      .eq("company_id", companyId)
      .eq("client_id", project.client_id)
      .neq("id", projectId);
    const siblingIds = (siblings ?? []).map((sibling) => sibling.id);
    if (siblingIds.length === 0) return { error: null, sites: [] };

    const nameById = new Map((siblings ?? []).map((s) => [s.id, s.name]));

    const [{ data: candidates }, { data: current }] = await Promise.all([
      supabase
        .from("sites")
        .select("id, project_id, name, address, city, state, external_ref")
        .in("project_id", siblingIds)
        .is("archived_at", null)
        .order("name"),
      supabase
        .from("sites")
        .select("name, address, external_ref")
        .eq("project_id", projectId),
    ]);

    const takenRefs = new Set(
      (current ?? [])
        .map((site) => site.external_ref?.trim().toLowerCase())
        .filter((ref): ref is string => Boolean(ref)),
    );
    const takenPairs = new Set(
      (current ?? []).map(
        (site) =>
          `${site.name.trim().toLowerCase()}|${site.address.trim().toLowerCase()}`,
      ),
    );

    const seen = new Set<string>();
    const sites = (candidates ?? [])
      .filter((site) => {
        const ref = site.external_ref?.trim().toLowerCase();
        const pair = `${site.name.trim().toLowerCase()}|${site.address.trim().toLowerCase()}`;
        if (ref ? takenRefs.has(ref) : takenPairs.has(pair)) return false;
        // El mismo local puede estar en varios proyectos previos: una sola vez.
        const dedupe = ref || pair;
        if (seen.has(dedupe)) return false;
        seen.add(dedupe);
        return true;
      })
      .map((site) => ({
        id: site.id,
        name: site.name,
        address: site.address,
        city: site.city ?? "",
        state: site.state ?? "",
        externalRef: site.external_ref,
        projectName: nameById.get(site.project_id) ?? "",
      }));

    return { error: null, sites };
  } catch {
    return { error: t("unexpected"), sites: [] };
  }
}

/** Copia al proyecto actual las locaciones elegidas de proyectos anteriores. */
export async function reuseSites(
  projectId: string,
  siteIds: string[],
): Promise<ImportResult> {
  const t = await getTranslations("Errors");
  const ids = z.array(z.string().uuid()).min(1).max(2000).safeParse(siteIds);
  if (!ids.success) return { error: t("invalidData"), inserted: 0, skipped: [] };

  try {
    const { supabase, companyId } = await requireOperator();

    const { data: project } = await supabase
      .from("projects")
      .select("id, country, zones")
      .eq("id", projectId)
      .eq("company_id", companyId)
      .single();
    if (!project) return { error: t("projectNotFound"), inserted: 0, skipped: [] };

    const { data: origin } = await supabase
      .from("sites")
      .select(
        "id, name, address, city, state, zone, lat, lng, external_ref, contact_name, contact_phone, contact_email, opening_hours, access_notes, parking_notes, technical_notes, risk_notes, permanent_notes",
      )
      .in("id", ids.data);
    if (!origin?.length) {
      return { error: t("invalidData"), inserted: 0, skipped: [] };
    }

    // La zona tiene que ser una de las del proyecto destino; si la original no
    // aplica, se usa la primera del proyecto para no dejarla huérfana.
    const fallbackZone = project.zones?.[0] ?? "";

    const rows = origin.map((site) => ({
      project_id: projectId,
      company_id: companyId,
      name: site.name,
      address: site.address,
      city: site.city,
      state: site.state,
      zone: project.zones?.includes(site.zone ?? "") ? site.zone : fallbackZone,
      lat: site.lat,
      lng: site.lng,
      external_ref: site.external_ref,
      contact_name: site.contact_name,
      contact_phone: site.contact_phone,
      contact_email: site.contact_email,
      opening_hours: site.opening_hours,
      access_notes: site.access_notes,
      parking_notes: site.parking_notes,
      technical_notes: site.technical_notes,
      risk_notes: site.risk_notes,
      permanent_notes: site.permanent_notes,
    }));

    let inserted = 0;
    const created: { newId: string; originId: string }[] = [];
    for (let index = 0; index < rows.length; index += BATCH_SIZE) {
      const batch = rows.slice(index, index + BATCH_SIZE);
      const { data: createdBatch, error } = await supabase
        .from("sites")
        .insert(batch)
        .select("id");
      if (error) {
        return {
          error: t("importBatch", { count: inserted, error: error.message }),
          inserted,
          skipped: [],
        };
      }
      (createdBatch ?? []).forEach((row, position) => {
        const source = origin[index + position];
        if (source) created.push({ newId: row.id, originId: source.id });
      });
      inserted += batch.length;
    }

    // Los archivos permanentes de la ficha (planos, fotos de fachada) viajan
    // con el local: son del lugar, no del proyecto. Se copia el archivo en el
    // bucket para que borrar el proyecto viejo no rompa el nuevo.
    await copySiteAttachments(supabase, companyId, created);

    revalidatePath(`/projects/${projectId}`);
    return { error: null, inserted, skipped: [] };
  } catch {
    return { error: t("unexpected"), inserted: 0, skipped: [] };
  }
}

/** Duplica los adjuntos permanentes de cada locación de origen a su copia. */
async function copySiteAttachments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  pairs: { newId: string; originId: string }[],
) {
  if (pairs.length === 0) return;

  const { data: attachments } = await supabase
    .from("site_attachments")
    .select("site_id, storage_path, file_name, mime_type, size_bytes")
    .in(
      "site_id",
      pairs.map((pair) => pair.originId),
    );
  if (!attachments?.length) return;

  const newIdByOrigin = new Map(pairs.map((pair) => [pair.originId, pair.newId]));
  const rows: TablesInsert<"site_attachments">[] = [];

  for (const attachment of attachments) {
    const newSiteId = newIdByOrigin.get(attachment.site_id);
    if (!newSiteId) continue;

    const fileName = attachment.storage_path.split("/").pop() ?? "archivo";
    const destination = `${companyId}/${newSiteId}/${crypto.randomUUID()}-${fileName}`;

    const { error } = await supabase.storage
      .from("evidence")
      .copy(attachment.storage_path, destination);
    // Si un archivo falla, se omite: no vale la pena tumbar toda la copia de
    // locaciones porque un adjunto ya no esté en el bucket.
    if (error) continue;

    rows.push({
      site_id: newSiteId,
      company_id: companyId,
      storage_path: destination,
      file_name: attachment.file_name,
      mime_type: attachment.mime_type,
      size_bytes: attachment.size_bytes,
    });
  }

  if (rows.length) await supabase.from("site_attachments").insert(rows);
}

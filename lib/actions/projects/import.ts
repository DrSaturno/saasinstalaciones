"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { attachCanonicalLocations } from "@/lib/actions/canonical-locations";
import { parseCsv } from "@/lib/csv";
import {
  normalizeLocationExternalRef,
  type CanonicalLocationProjection,
} from "@/lib/domain/canonical-locations";
import { SITE_TEMPLATE_HEADERS } from "@/lib/domain/site-template";
import {
  analyzeSiteRows,
  type ParsedSiteRow,
  type SiteImportIssue,
} from "@/lib/domain/site-import";
import type { TablesInsert } from "@/types/database";
import { BATCH_SIZE, requireOperator } from "./context";
import type { ImportPreflight, ImportResult } from "./types";

// ---------------------------------------------------------------------------
// Importación masiva de puntos
//
// El análisis de la planilla vive en `lib/domain/site-import.ts` y se corre dos
// veces sobre el mismo archivo: una para el preview y otra al confirmar. El
// navegador nunca devuelve las filas ya parseadas — se vuelve a leer el archivo
// original — porque aceptar filas armadas por el cliente permitiría insertar
// registros que nunca pasaron por la validación.
//
// **Idempotencia y reanudación (R2-IMP-03).** La confirmación se agrupa en un
// lote (`site_import_batches`) cuyo id se deriva de un checksum del proyecto más
// el contenido del archivo. Reintentar el mismo archivo cae en el mismo lote:
// las filas ya resueltas se reutilizan en vez de volver a crearse. Sin esto, un
// lote que falla a mitad de camino duplicaba al reintentar todas las filas SIN
// código externo — las que lo tienen ya estaban protegidas por el dedupe, las
// que no, generaban un uuid nuevo en cada intento.
//
// El id se deriva en el servidor y no se acepta del cliente: así no hay id ajeno
// que validar ni forma de escribir sobre el lote de otra empresa.
// ---------------------------------------------------------------------------

type OperatorContext = Awaited<ReturnType<typeof requireOperator>>;

/**
 * Id determinista del lote a partir del proyecto y el contenido del archivo.
 *
 * Se le da forma de uuid porque la columna es `uuid`. No es un uuid aleatorio
 * ni pretende serlo: es un checksum, y esa es exactamente la propiedad que se
 * busca — el mismo archivo sobre el mismo proyecto siempre cae en el mismo lote.
 */
function deriveImportId(
  projectId: string,
  csvText: string,
): { importId: string; checksum: string } {
  const checksum = createHash("sha256")
    .update(`${projectId}\n${csvText}`)
    .digest("hex");
  const hex = checksum.slice(0, 32);
  const importId = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
  return { importId, checksum };
}

/**
 * Referencias externas ya cargadas en el proyecto.
 *
 * Paginado: PostgREST corta en 1000 y un proyecto grande tiene miles de puntos.
 */
async function fetchKnownExternalRefs(
  supabase: OperatorContext["supabase"],
  projectId: string,
): Promise<string[]> {
  const refs: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("sites")
      .select("external_ref")
      .eq("project_id", projectId)
      .not("external_ref", "is", null)
      .range(from, from + 999);
    if (error || !data) break;
    for (const row of data) {
      if (row.external_ref) refs.push(row.external_ref);
    }
    if (data.length < 1000) break;
  }
  return refs;
}

type ErrorTranslator = Awaited<ReturnType<typeof getTranslations<"Errors">>>;

/** Convierte el código de la fila descartada en el texto que ve el usuario. */
function describeIssue(t: ErrorTranslator, issue: SiteImportIssue): string {
  switch (issue.code) {
    case "missingName":
      return t("missingName");
    case "invalidCoordinates":
      return t("siteInvalidCoordinates");
    case "zoneOutsideProject":
      return t("siteZoneOutsideProject", { zone: issue.detail || "—" });
    case "duplicateInFile":
      return t("siteDuplicateInFile", { ref: issue.detail || "—" });
    case "alreadyImported":
      return t("siteAlreadyImported", { ref: issue.detail || "—" });
  }
}

function toCanonicalProjection(
  row: ParsedSiteRow,
  id: string,
  companyId: string,
  clientId: string,
  country: CanonicalLocationProjection["country"],
): CanonicalLocationProjection {
  return {
    id,
    company_id: companyId,
    client_id: clientId,
    name: row.name,
    address: row.address,
    city: row.city,
    state: row.state,
    zone: row.zone,
    country,
    external_ref: row.externalRef,
    lat: row.lat,
    lng: row.lng,
    contact_name: "",
    contact_phone: "",
    contact_email: "",
    opening_hours: "",
    access_notes: "",
    parking_notes: "",
    technical_notes: "",
    risk_notes: "",
    permanent_notes: "",
  };
}

/**
 * Anota el resultado de un conjunto de filas del lote.
 *
 * `upsert` y no `insert`: reanudar vuelve a pasar por filas ya anotadas y no
 * tiene que fallar por eso.
 */
async function recordImportRows(
  supabase: OperatorContext["supabase"],
  batchId: string,
  companyId: string,
  entries: readonly {
    row: ParsedSiteRow;
    outcome: "imported" | "reused" | "skipped";
    locationId: string | null;
    reason?: string;
  }[],
): Promise<string | null> {
  for (let index = 0; index < entries.length; index += BATCH_SIZE) {
    const slice = entries.slice(index, index + BATCH_SIZE);
    const { error } = await supabase.from("site_import_rows").upsert(
      slice.map((entry) => ({
        batch_id: batchId,
        row_number: entry.row.row,
        company_id: companyId,
        name: entry.row.name,
        external_ref: entry.row.externalRef,
        outcome: entry.outcome,
        reason: entry.reason ?? null,
        location_id: entry.locationId,
      })),
      { onConflict: "batch_id,row_number" },
    );
    if (error) return error.message;
  }
  return null;
}

/** Deja el lote marcado como fallido para que el reintento sepa reanudarlo. */
async function failBatch(
  supabase: OperatorContext["supabase"],
  batchId: string,
  message: string,
): Promise<void> {
  await supabase
    .from("site_import_batches")
    .update({ status: "failed", error: message })
    .eq("id", batchId);
}

export async function importSites(
  projectId: string,
  csvText: string,
): Promise<ImportResult> {
  const t = await getTranslations("Errors");
  let ctx;
  try {
    ctx = await requireOperator();
  } catch {
    return { error: t("accessDenied"), inserted: 0, skipped: [] };
  }
  const { supabase, companyId, userId } = ctx;

  // Verificar que el proyecto sea de esta empresa (RLS ya lo garantiza,
  // pero así damos un error claro en vez de un insert vacío).
  const { data: project } = await supabase
    .from("projects")
    .select("id, company_id, client_id, country, zones")
    .eq("id", projectId)
    .eq("company_id", companyId)
    .single();
  if (!project?.client_id) {
    return { error: t("projectNotFound"), inserted: 0, skipped: [] };
  }

  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return { error: t("csvNoRows"), inserted: 0, skipped: [] };
  }

  const analysis = analyzeSiteRows(rows, {
    projectZones: project.zones,
    knownExternalRefs: await fetchKnownExternalRefs(supabase, projectId),
  });
  if (analysis.counts.found === 0 && analysis.issues.length === 0) {
    // Sin columna de nombre no se puede identificar ninguna locación.
    return {
      error: t("csvMissingName", { headers: rows[0].join(", ") }),
      inserted: 0,
      skipped: [],
    };
  }

  const skipped = analysis.issues.map((issue) => ({
    row: issue.row,
    reason: describeIssue(t, issue),
  }));

  const { importId, checksum } = deriveImportId(projectId, csvText);

  // El lote ya cerrado se devuelve tal cual: reconfirmar el mismo archivo no
  // vuelve a escribir nada. Es el caso del doble clic y el del reintento
  // después de un error de red que en realidad había llegado.
  const { data: previous } = await supabase
    .from("site_import_batches")
    .select("id, status, imported, reused")
    .eq("id", importId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (previous?.status === "completed") {
    return {
      error: null,
      inserted: previous.imported + previous.reused,
      skipped,
      importId,
    };
  }

  if (!previous) {
    const { error: batchError } = await supabase
      .from("site_import_batches")
      .insert({
        id: importId,
        company_id: companyId,
        project_id: projectId,
        checksum,
        status: "in_progress",
        found: analysis.counts.found,
        skipped: analysis.issues.length,
        created_by: userId,
      });
    // Sin lote no hay reanudación posible, así que no se sigue a ciegas.
    if (batchError) return { error: t("operation"), inserted: 0, skipped };
  }

  // Filas que un intento anterior ya resolvió. Es lo que evita duplicar las
  // filas sin código externo, que no tienen cómo reconocerse solas.
  const recordedByRow = new Map<number, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("site_import_rows")
      .select("row_number, location_id")
      .eq("batch_id", importId)
      .not("location_id", "is", null)
      .range(from, from + 999);
    if (error) return { error: t("operation"), inserted: 0, skipped };
    if (!data) break;
    for (const row of data) {
      if (row.location_id) recordedByRow.set(row.row_number, row.location_id);
    }
    if (data.length < 1000) break;
  }

  const clientId = project.client_id;
  const requestedRefs = new Set(
    analysis.valid
      .map((row) => normalizeLocationExternalRef(row.externalRef))
      .filter((ref): ref is string => Boolean(ref)),
  );
  const existingByRef = new Map<string, CanonicalLocationProjection>();
  if (requestedRefs.size > 0) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("locations")
        .select("id, company_id, client_id, name, address, city, state, zone, country, lat, lng, external_ref, normalized_external_ref, contact_name, contact_phone, contact_email, opening_hours, access_notes, parking_notes, technical_notes, risk_notes, permanent_notes")
        .eq("company_id", companyId)
        .eq("client_id", clientId)
        .not("normalized_external_ref", "is", null)
        .range(from, from + 999);
      if (error) {
        return { error: t("operation"), inserted: 0, skipped };
      }
      if (!data) break;
      for (const location of data) {
        if (
          location.normalized_external_ref &&
          requestedRefs.has(location.normalized_external_ref)
        ) {
          existingByRef.set(location.normalized_external_ref, location);
        }
      }
      if (data.length < 1000) break;
    }
  }

  // Las locaciones que un intento anterior alcanzó a crear. Se releen para
  // confirmar que siguen existiendo: si alguien borró una entremedio, la fila
  // se vuelve a procesar como nueva en vez de asociar un id fantasma.
  const resumedById = new Map<string, CanonicalLocationProjection>();
  const recordedIds = [...new Set(recordedByRow.values())];
  for (let index = 0; index < recordedIds.length; index += 1000) {
    const slice = recordedIds.slice(index, index + 1000);
    const { data, error } = await supabase
      .from("locations")
      .select("id, company_id, client_id, name, address, city, state, zone, country, lat, lng, external_ref, contact_name, contact_phone, contact_email, opening_hours, access_notes, parking_notes, technical_notes, risk_notes, permanent_notes")
      .eq("company_id", companyId)
      .in("id", slice);
    if (error) return { error: t("operation"), inserted: 0, skipped };
    for (const location of data ?? []) resumedById.set(location.id, location);
  }

  const targetLocations: CanonicalLocationProjection[] = [];
  const newLocations: (TablesInsert<"locations"> & { id: string })[] = [];
  /** Fila de planilla de cada locación nueva, en el mismo orden. */
  const newRows: ParsedSiteRow[] = [];
  const reusedRows: ParsedSiteRow[] = [];
  for (const row of analysis.valid) {
    const resumedId = recordedByRow.get(row.row);
    const resumed = resumedId ? resumedById.get(resumedId) : undefined;
    if (resumed) {
      targetLocations.push(resumed);
      continue;
    }

    const normalizedRef = normalizeLocationExternalRef(row.externalRef);
    const existing = normalizedRef ? existingByRef.get(normalizedRef) : undefined;
    if (existing) {
      if (
        existing.country !== project.country ||
        !project.zones.includes(existing.zone)
      ) {
        return { error: t("invalidData"), inserted: 0, skipped };
      }
      targetLocations.push(existing);
      reusedRows.push(row);
      continue;
    }
    const id = crypto.randomUUID();
    const projection = toCanonicalProjection(
      row,
      id,
      companyId,
      clientId,
      project.country,
    );
    targetLocations.push(projection);
    newLocations.push({
      ...projection,
      country: project.country,
      source: "import",
      created_by: userId,
    });
    newRows.push(row);
  }

  let createdLocations = 0;
  for (let index = 0; index < newLocations.length; index += BATCH_SIZE) {
    const batch = newLocations.slice(index, index + BATCH_SIZE);
    const { error } = await supabase.from("locations").insert(batch);
    if (error) {
      await failBatch(supabase, importId, error.message);
      return {
        error: t("importBatch", {
          count: createdLocations,
          error: error.message,
        }),
        inserted: 0,
        skipped,
        importId,
      };
    }
    // Se registra inmediatamente después de cada tanda, no al final: si la
    // siguiente falla, lo ya creado queda anotado y el reintento lo reutiliza
    // en vez de duplicarlo. Ese es todo el punto de la reanudación.
    const recordError = await recordImportRows(
      supabase,
      importId,
      companyId,
      batch.map((location, offset) => ({
        row: newRows[index + offset],
        outcome: "imported" as const,
        locationId: location.id,
      })),
    );
    if (recordError) {
      await failBatch(supabase, importId, recordError);
      return { error: t("operation"), inserted: 0, skipped, importId };
    }
    createdLocations += batch.length;
  }

  const reusedError = await recordImportRows(
    supabase,
    importId,
    companyId,
    reusedRows.map((row) => ({
      row,
      outcome: "reused" as const,
      locationId:
        existingByRef.get(normalizeLocationExternalRef(row.externalRef) ?? "")?.id ??
        null,
    })),
  );
  if (reusedError) {
    await failBatch(supabase, importId, reusedError);
    return { error: t("operation"), inserted: 0, skipped, importId };
  }

  const skippedError = await recordImportRows(
    supabase,
    importId,
    companyId,
    analysis.issues.map((issue) => ({
      row: {
        row: issue.row,
        name: "",
        address: "",
        city: "",
        state: "",
        zone: "",
        externalRef: issue.detail ?? null,
        lat: null,
        lng: null,
      },
      outcome: "skipped" as const,
      locationId: null,
      reason: describeIssue(t, issue),
    })),
  );
  if (skippedError) {
    await failBatch(supabase, importId, skippedError);
    return { error: t("operation"), inserted: 0, skipped, importId };
  }

  const attached = await attachCanonicalLocations(
    supabase,
    { ...project, client_id: clientId },
    targetLocations,
    userId,
  );
  if (attached.error) {
    await failBatch(supabase, importId, attached.error);
    return {
      error: t("importBatch", {
        count: attached.inserted,
        error: attached.error,
      }),
      inserted: attached.inserted,
      skipped,
      importId,
    };
  }

  await supabase
    .from("site_import_batches")
    .update({
      status: "completed",
      imported: newLocations.length + recordedByRow.size,
      reused: reusedRows.length,
      error: null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", importId);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/clients");
  return { error: null, inserted: attached.inserted, skipped, importId };
}

/**
 * Lee el archivo subido y lo devuelve como texto CSV.
 *
 * El Excel se convierte a las mismas filas que produce el parser de CSV, así
 * hay UN solo camino de validación. Convertir en el servidor evita mandar la
 * librería de lectura al navegador.
 *
 * Se lee con SheetJS (`xlsx`), no con exceljs (que sí se usa para ESCRIBIR la
 * plantilla, en /api/site-template). exceljs es estricto con el XML interno
 * del .xlsx y rechaza archivos válidos que algunos programas re-escriben con
 * un dialecto distinto (namespace con prefijo en vez de namespace por
 * defecto) al volver a guardarlos — pasó con una planilla real de un usuario,
 * completada y re-guardada, con datos perfectamente buenos. SheetJS es mucho
 * más tolerante con esas variantes y es el que de hecho pudo abrirla.
 */
async function readUploadAsCsv(
  file: unknown,
): Promise<{ text: string } | { errorKey: "invalidData" | "fileTooLarge" | "csvNoRows" | "excelUnreadable" }> {
  if (!(file instanceof File) || file.size === 0) {
    return { errorKey: "invalidData" };
  }
  // 20 MB cubre planillas de decenas de miles de filas.
  if (file.size > 20 * 1_024 * 1_024) {
    return { errorKey: "fileTooLarge" };
  }

  const isExcel =
    file.name.toLowerCase().endsWith(".xlsx") ||
    file.type.includes("spreadsheetml");

  if (!isExcel) return { text: await file.text() };

  try {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });

    // La primera hoja cuya cabecera menciona "nombre"; la de instrucciones no
    // tiene encabezados de columna.
    const sheetName =
      workbook.SheetNames.find((name) => {
        const sheet = workbook.Sheets[name];
        const firstCell = sheet["A1"];
        return String(firstCell?.v ?? "").toLowerCase().includes("nombre");
      }) ?? workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    if (!sheet) return { errorKey: "csvNoRows" };

    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });

    const lines: string[] = [];
    for (const row of rows) {
      const values: string[] = [];
      for (let index = 0; index < SITE_TEMPLATE_HEADERS.length; index++) {
        const raw = row[index] ?? "";
        // El encabezado marca las obligatorias con "*": se saca para que el
        // nombre de columna coincida con el que espera el parser.
        values.push(String(raw).replace(/\s*\*\s*$/, "").trim());
      }
      if (values.some((value) => value !== "")) {
        // Comillas para que las direcciones con coma no partan la columna.
        lines.push(values.map((value) => `"${value.replace(/"/g, '""')}"`).join(","));
      }
    }

    if (lines.length < 2) return { errorKey: "csvNoRows" };
    return { text: lines.join("\r\n") };
  } catch {
    return { errorKey: "excelUnreadable" };
  }
}

/**
 * Analiza la planilla y devuelve el resumen SIN escribir nada.
 *
 * Es el control que pide la operación: si el proyecto declara 50 sucursales y
 * la planilla trae 47, hay que verlo antes de dar la carga por terminada, no
 * después. Devuelve además cuántas filas quedarían afuera y por qué.
 */
export async function analyzeSiteImport(
  projectId: string,
  formData: FormData,
): Promise<ImportPreflight> {
  const t = await getTranslations("Errors");
  const empty = {
    expected: 0,
    found: 0,
    valid: 0,
    incomplete: 0,
    outsideZone: 0,
    duplicated: 0,
    difference: 0,
    issues: [],
  };

  let ctx;
  try {
    ctx = await requireOperator();
  } catch {
    return { error: t("accessDenied"), ...empty };
  }
  const { supabase, companyId } = ctx;

  const { data: project } = await supabase
    .from("projects")
    .select("id, zones, planned_installations")
    .eq("id", projectId)
    .eq("company_id", companyId)
    .single();
  if (!project) return { error: t("projectNotFound"), ...empty };

  const read = await readUploadAsCsv(formData.get("file"));
  if ("errorKey" in read) return { error: t(read.errorKey), ...empty };

  const rows = parseCsv(read.text);
  if (rows.length < 2) return { error: t("csvNoRows"), ...empty };

  const analysis = analyzeSiteRows(rows, {
    projectZones: project.zones,
    knownExternalRefs: await fetchKnownExternalRefs(supabase, projectId),
  });
  if (analysis.counts.found === 0 && analysis.issues.length === 0) {
    return {
      error: t("csvMissingName", { headers: rows[0].join(", ") }),
      ...empty,
    };
  }

  const expected = project.planned_installations ?? 0;
  return {
    error: null,
    expected,
    found: analysis.counts.found,
    valid: analysis.counts.valid,
    incomplete: analysis.counts.incomplete,
    outsideZone: analysis.counts.outsideZone,
    duplicated: analysis.counts.duplicated,
    difference: expected - analysis.counts.valid,
    issues: analysis.issues.map((issue) => ({
      row: issue.row,
      reason: describeIssue(t, issue),
    })),
  };
}

/** Importa locaciones desde un archivo, sea Excel (.xlsx) o CSV. */
export async function importSitesFile(
  projectId: string,
  formData: FormData,
): Promise<ImportResult> {
  const t = await getTranslations("Errors");
  const read = await readUploadAsCsv(formData.get("file"));
  if ("errorKey" in read) {
    return { error: t(read.errorKey), inserted: 0, skipped: [] };
  }
  return importSites(projectId, read.text);
}

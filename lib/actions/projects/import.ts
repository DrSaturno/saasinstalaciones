"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { parseCsv, normalizeHeader } from "@/lib/csv";
import { SITE_TEMPLATE_HEADERS } from "@/lib/domain/site-template";
import type { TablesInsert } from "@/types/database";
import { BATCH_SIZE, requireOperator } from "./context";
import type { ImportResult } from "./types";

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
 * Importa locaciones desde un archivo, sea Excel (.xlsx) o CSV.
 *
 * El Excel se convierte a las mismas filas que produce el parser de CSV y se
 * delega en `importSites`, así hay UN solo camino de validación e inserción.
 * Convertir en el servidor evita mandar la librería de lectura al navegador.
 *
 * Se lee con SheetJS (`xlsx`), no con exceljs (que sí se usa para ESCRIBIR la
 * plantilla, en /api/site-template). exceljs es estricto con el XML interno
 * del .xlsx y rechaza archivos válidos que algunos programas re-escriben con
 * un dialecto distinto (namespace con prefijo en vez de namespace por
 * defecto) al volver a guardarlos — pasó con una planilla real de un usuario,
 * completada y re-guardada, con datos perfectamente buenos. SheetJS es mucho
 * más tolerante con esas variantes y es el que de hecho pudo abrirla.
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
    if (!sheet) return { error: t("csvNoRows"), inserted: 0, skipped: [] };

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

    if (lines.length < 2) {
      return { error: t("csvNoRows"), inserted: 0, skipped: [] };
    }

    return importSites(projectId, lines.join("\r\n"));
  } catch {
    return { error: t("excelUnreadable"), inserted: 0, skipped: [] };
  }
}

import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  buildImportReportRows,
  IMPORT_REPORT_HEADERS,
  importReportFilename,
  type ImportReportRow,
} from "@/lib/domain/import-report";

/**
 * Descarga el resultado fila por fila de una importación (R2-IMP-03).
 *
 * No se filtra por empresa acá: RLS acota `site_import_batches` y
 * `site_import_rows` al gerente de su propia empresa, así que un lote ajeno no
 * devuelve nada y termina en 404. El `project_id` se verifica igual para que la
 * URL no mezcle un lote con un proyecto que no le corresponde.
 *
 * En Next 16 los params de rutas dinámicas son async.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; importId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id, importId } = await params;
  const supabase = await createClient();

  const [{ data: batch }, { data: project }] = await Promise.all([
    supabase
      .from("site_import_batches")
      .select("id, project_id")
      .eq("id", importId)
      .eq("project_id", id)
      .maybeSingle(),
    supabase.from("projects").select("id, name").eq("id", id).maybeSingle(),
  ]);
  if (!batch || !project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Paginado: una planilla de miles de filas produce un reporte de miles de
  // filas, y PostgREST corta en 1000.
  const rows: ImportReportRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("site_import_rows")
      .select("row_number, name, external_ref, outcome, reason")
      .eq("batch_id", importId)
      .order("row_number")
      .range(from, from + 999);
    if (error || !data) break;
    for (const row of data) {
      rows.push({
        row: row.row_number,
        name: row.name,
        externalRef: row.external_ref,
        outcome: row.outcome,
        reason: row.reason,
      });
    }
    if (data.length < 1000) break;
  }

  const t = await getTranslations("ImportSites");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Instala Pro";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Importación");
  sheet.columns = [
    { header: IMPORT_REPORT_HEADERS[0], key: "row", width: 8 },
    { header: IMPORT_REPORT_HEADERS[1], key: "name", width: 38 },
    { header: IMPORT_REPORT_HEADERS[2], key: "ref", width: 16 },
    { header: IMPORT_REPORT_HEADERS[3], key: "outcome", width: 16 },
    { header: IMPORT_REPORT_HEADERS[4], key: "reason", width: 52 },
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF2597D0" },
  };
  header.alignment = { vertical: "middle" };
  header.height = 22;

  const reportRows = buildImportReportRows(rows, {
    imported: t("outcomeImported"),
    reused: t("outcomeReused"),
    skipped: t("outcomeSkipped"),
  });
  for (const row of reportRows) sheet.addRow(row);

  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = importReportFilename(project.name, importId, new Date());

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

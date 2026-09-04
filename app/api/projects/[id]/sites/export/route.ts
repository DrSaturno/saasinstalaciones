import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { SITE_COLUMNS } from "@/lib/domain/site-template";
import {
  buildSiteExportRows,
  siteExportFilename,
  type ExportableSite,
} from "@/lib/domain/site-export";

/**
 * Descarga las locaciones de un proyecto como planilla (R2-IMP-04).
 *
 * Las columnas salen de `SITE_COLUMNS`, las mismas que espera la importación:
 * el archivo se puede corregir en Excel y volver a subir. Reimportarlo al mismo
 * proyecto no duplica nada, porque el importador reconoce las referencias que
 * ya están cargadas.
 *
 * No se filtra por empresa acá: RLS ya acota `sites` y `projects` al tenant del
 * usuario. Un id de otro tenant no devuelve proyecto y termina en 404.
 *
 * En Next 16 los params de rutas dinámicas son async.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Límite por usuario (SEC-08): exportar pagina miles de locaciones. Sin
  // freno, es un motor de extracción masiva. 20 exportaciones por hora cubre
  // el uso real y ahoga el scraping automatizado.
  const gate = await enforceRateLimit("sites_export", user.id, 20, 3600);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSeconds) } },
    );
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", id)
    .single();
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Paginado: PostgREST corta en 1000 y un proyecto grande tiene miles de
  // puntos. Exportar sólo la primera página sería peor que fallar.
  const sites: ExportableSite[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("sites")
      .select("name, address, city, zone, external_ref, lat, lng")
      .eq("project_id", id)
      .is("archived_at", null)
      .order("name")
      .range(from, from + 999);
    if (error || !data) break;
    for (const row of data) {
      sites.push({
        name: row.name,
        address: row.address,
        city: row.city,
        zone: row.zone,
        externalRef: row.external_ref,
        lat: row.lat,
        lng: row.lng,
      });
    }
    if (data.length < 1000) break;
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Se Instala";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Locaciones");
  sheet.columns = SITE_COLUMNS.map((column) => ({
    header: column.key,
    key: column.key,
    width: column.width,
  }));

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF2597D0" },
  };
  header.alignment = { vertical: "middle" };
  header.height = 22;

  // Sin el "*" de la plantilla: acá no se está pidiendo completar nada, y el
  // asterisco volvería como parte del encabezado si el archivo se reimporta.
  for (const row of buildSiteExportRows(sites)) sheet.addRow(row);

  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = siteExportFilename(project.name, new Date());

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

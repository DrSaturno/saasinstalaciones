import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth";
import {
  SITE_COLUMNS,
  SITE_TEMPLATE_EXAMPLES,
} from "@/lib/domain/site-template";

/**
 * Planilla de Excel lista para completar y volver a subir.
 *
 * Se genera en el servidor con las mismas columnas que espera la importación,
 * así el archivo y el lector no se pueden desincronizar. Trae encabezados
 * formateados, anchos de columna, una hoja de instrucciones y dos filas de
 * ejemplo que el cliente reemplaza por sus datos.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "company_manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
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

  // Las obligatorias se marcan para que no haya que leer las instrucciones.
  SITE_COLUMNS.forEach((column, index) => {
    if (!column.required) return;
    header.getCell(index + 1).value = `${column.key} *`;
  });

  SITE_TEMPLATE_EXAMPLES.forEach((example) => {
    const row = sheet.addRow(example);
    row.font = { italic: true, color: { argb: "FF868C98" } };
  });

  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const help = workbook.addWorksheet("Instrucciones");
  help.columns = [{ width: 96 }];
  [
    "Cómo completar esta planilla",
    "",
    "1. Trabajá en la hoja «Locaciones».",
    "2. Las dos filas en gris son ejemplos: borralas y cargá tus locaciones.",
    "3. Las columnas marcadas con * son obligatorias: nombre y direccion.",
    "4. No cambies los nombres de las columnas ni el orden.",
    "5. codigo es tu referencia interna del local (opcional, pero recomendado:",
    "   sirve para no duplicar una locación si volvés a importar).",
    "6. lat y lng son opcionales. Si las cargás, la app puede abrir el punto",
    "   directo en Google Maps y calcular la ruta del instalador.",
    "   Usá punto decimal, no coma. Ejemplo: -34.6037",
    "7. Guardá el archivo y subilo desde «Adm. instalaciones» → «Importar».",
    "",
    "Podés cargar miles de filas: la importación se hace por lotes.",
  ].forEach((line, index) => {
    const row = help.addRow([line]);
    if (index === 0) row.font = { bold: true, size: 13 };
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="plantilla-locaciones-instalapro.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}

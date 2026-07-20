/**
 * Parser de CSV mínimo pero correcto: soporta comillas, comillas escapadas
 * (""), saltos de línea dentro de campos y CRLF.
 *
 * Detecta el delimitador automáticamente: Excel en es-AR y pt-BR exporta con
 * punto y coma, no con coma. Si no lo contemplamos, cada fila entra como una
 * sola columna y la importación falla de forma confusa.
 */
export function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/)[0] ?? "";
  const counts = [
    { d: ";", n: (firstLine.match(/;/g) ?? []).length },
    { d: ",", n: (firstLine.match(/,/g) ?? []).length },
    { d: "\t", n: (firstLine.match(/\t/g) ?? []).length },
  ];
  return counts.sort((a, b) => b.n - a.n)[0].n > 0
    ? counts.sort((a, b) => b.n - a.n)[0].d
    : ",";
}

export function parseCsv(text: string): string[][] {
  // Quitar BOM: Excel lo agrega y ensucia el nombre de la primera columna.
  const input = text.replace(/^﻿/, "");
  const delimiter = detectDelimiter(input);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field.trim());
      field = "";
    } else if (char === "\n") {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      // Ignorar: el \n siguiente cierra la fila.
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c !== ""));
}

/** Normaliza encabezados: sin acentos, minúsculas, sin espacios. */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

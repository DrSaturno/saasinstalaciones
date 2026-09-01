export type TextSegment = { text: string; match: boolean };

/**
 * Marca en un texto los tramos que coinciden con lo que se buscó.
 *
 * Tiene que ignorar acentos igual que la búsqueda de la base (que usa
 * `unaccent`): si buscar "dano" trae un mensaje que dice "daño", pero después
 * no se resalta nada, el resultado parece un error.
 *
 * Devuelve tramos en vez de HTML a propósito: el texto lo escribe un usuario,
 * y armar markup con él sería una inyección esperando a pasar. La pantalla
 * renderiza cada tramo como nodo de React.
 */
export function splitHighlight(text: string, query: string): TextSegment[] {
  const tokens = queryTokens(query);
  if (!text || tokens.length === 0) return [{ text, match: false }];

  // Se trabaja sobre code points y no sobre índices de string: así un emoji
  // (dos unidades UTF-16) no descoloca las posiciones y parte una palabra al
  // medio.
  const chars = Array.from(text);
  const haystack = chars.map(foldChar).join("");

  const hits: [number, number][] = [];
  for (const token of tokens) {
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(token, from);
      if (at < 0) break;
      hits.push([at, at + token.length]);
      from = at + 1; // +1, no +token.length: cubre coincidencias solapadas.
    }
  }
  if (hits.length === 0) return [{ text, match: false }];

  return toSegments(chars, mergeRanges(hits));
}

/**
 * Misma normalización que hace `tokenizable_words` en la base: todo lo que no
 * sea letra o número separa palabras. Así "remito-material.pdf" se busca por
 * "material" en los dos lados.
 */
function queryTokens(query: string): string[] {
  return fold(query)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

function fold(value: string): string {
  return Array.from(value).map(foldChar).join("");
}

/**
 * Pliega UN carácter a minúscula sin acento, conservando siempre longitud 1
 * para que las posiciones sigan alineadas con el original. Lo que no pliega a
 * un solo carácter (emoji, pares subrogados) se reemplaza por un centinela que
 * no puede coincidir con ningún término de búsqueda.
 */
function foldChar(char: string): string {
  const folded = char
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return folded.length === 1 ? folded : "￿";
}

function mergeRanges(ranges: [number, number][]): [number, number][] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function toSegments(chars: string[], ranges: [number, number][]): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) {
      segments.push({ text: chars.slice(cursor, start).join(""), match: false });
    }
    segments.push({ text: chars.slice(start, end).join(""), match: true });
    cursor = end;
  }
  if (cursor < chars.length) {
    segments.push({ text: chars.slice(cursor).join(""), match: false });
  }
  return segments;
}

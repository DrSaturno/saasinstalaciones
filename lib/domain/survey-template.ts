/**
 * La plantilla de relevamiento: qué se le pide completar a quien va al punto.
 *
 * La definición viaja como jsonb desde la base, así que acá se valida antes de
 * usarla. Un campo mal formado se descarta en vez de romper la pantalla: si la
 * plantilla de una empresa quedó con basura, el instalador tiene que poder
 * relevar igual con los campos que sí están bien.
 */

export type SurveyFieldType = "check" | "measure" | "text";

export type SurveyField = {
  key: string;
  label: string;
  type: SurveyFieldType;
  /** Sólo para `measure`: la unidad que se muestra al lado del número. */
  unit?: string;
};

/** Lo que el instalador completó, antes de separarlo por destino. */
export type SurveyAnswers = Record<string, string | boolean>;

const TYPES: readonly SurveyFieldType[] = ["check", "measure", "text"];

function isField(value: unknown): value is SurveyField {
  if (typeof value !== "object" || value === null) return false;
  const field = value as Record<string, unknown>;
  return (
    typeof field.key === "string" &&
    field.key.length > 0 &&
    typeof field.label === "string" &&
    field.label.length > 0 &&
    typeof field.type === "string" &&
    (TYPES as readonly string[]).includes(field.type)
  );
}

export function parseSurveyTemplate(definition: unknown): SurveyField[] {
  if (!Array.isArray(definition)) return [];
  const seen = new Set<string>();
  const fields: SurveyField[] = [];
  for (const item of definition) {
    if (!isField(item)) continue;
    // Dos campos con la misma clave se pisarían al guardar y una respuesta
    // desaparecería sin aviso.
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    fields.push({
      key: item.key,
      label: item.label,
      type: item.type,
      unit: typeof item.unit === "string" ? item.unit : undefined,
    });
  }
  return fields;
}

/**
 * Reparte las respuestas en las tres columnas que la base ya tenía separadas.
 *
 * No es una sutileza de almacenamiento: una medición es un número comparable
 * entre relevamientos y un texto no. Meterlas todas en el mismo jsonb haría
 * imposible después preguntar "cuántos puntos miden más de 3 metros".
 */
export function splitAnswers(
  fields: readonly SurveyField[],
  answers: SurveyAnswers,
): {
  checklist: Record<string, boolean>;
  measurements: Record<string, number>;
  formData: Record<string, string>;
} {
  const checklist: Record<string, boolean> = {};
  const measurements: Record<string, number> = {};
  const formData: Record<string, string> = {};

  for (const field of fields) {
    const raw = answers[field.key];
    if (field.type === "check") {
      checklist[field.key] = raw === true || raw === "true";
      continue;
    }
    if (typeof raw !== "string" || raw.trim() === "") continue;
    if (field.type === "measure") {
      const parsed = Number(raw.replace(",", "."));
      // Un número que no es número se descarta en vez de guardarse como NaN:
      // un NaN en la base contamina cualquier cálculo posterior.
      if (Number.isFinite(parsed)) measurements[field.key] = parsed;
      continue;
    }
    formData[field.key] = raw.trim();
  }

  return { checklist, measurements, formData };
}

/**
 * Si hay lo mínimo para enviar.
 *
 * Se exige al menos una medición o un texto: un relevamiento donde sólo se
 * marcaron casilleros no documenta nada de lo que el coordinador necesita para
 * planificar. Las casillas solas no alcanzan.
 */
export function hasEnoughToSubmit(
  fields: readonly SurveyField[],
  answers: SurveyAnswers,
): boolean {
  const { measurements, formData } = splitAnswers(fields, answers);
  return Object.keys(measurements).length + Object.keys(formData).length > 0;
}

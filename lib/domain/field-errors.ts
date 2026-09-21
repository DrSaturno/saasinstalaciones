import type { z } from "zod";

/**
 * Qué falló y en qué campo, a partir de un error de Zod.
 *
 * Casi todas las acciones respondían «Datos inválidos» ante cualquier falla de
 * validación, y el usuario no tenía forma de saber cuál de quince campos
 * corregir. Esto extrae el primer problema en términos que se pueden traducir
 * —campo + motivo + límite— sin atar el dominio a los textos.
 */

/**
 * Reglas entre campos que el navegador no puede validar solo. Cada esquema las
 * reporta con estos nombres en el `message` de su `addIssue`/`refine`, y hay
 * un texto traducido para cada una.
 */
export const CROSS_FIELD_RULES = [
  "endBeforeStart",
  "coordinatePair",
  "freightDetailsRequired",
  "projectOrClient",
] as const;
export type CrossFieldRule = (typeof CROSS_FIELD_RULES)[number];

export type FieldProblem =
  | { field: string; reason: "required" }
  | { field: string; reason: "tooShort"; min: number }
  | { field: string; reason: "tooLong"; max: number }
  | { field: string; reason: "invalidEmail" }
  | { field: string; reason: "invalidNumber" }
  | { field: string; reason: "outOfRange"; min: number | null; max: number | null }
  | { field: string; reason: "rule"; rule: CrossFieldRule }
  | { field: string; reason: "invalid" };

type Issue = z.core.$ZodIssue;

function isCrossFieldRule(value: string): value is CrossFieldRule {
  return (CROSS_FIELD_RULES as readonly string[]).includes(value);
}

/**
 * De una unión (`"" | email`, `"" | monto`) interesa la rama que el usuario
 * quiso llenar: la que NO es el literal vacío. Si no, el error sólo dice que
 * ninguna opción encajó, que no le sirve a nadie.
 */
function meaningfulBranch(issue: Extract<Issue, { code: "invalid_union" }>): Issue | null {
  for (const branch of issue.errors) {
    const relevant = branch.find((inner) => inner.code !== "invalid_value");
    if (relevant) return relevant;
  }
  return null;
}

function describe(issue: Issue, field: string): FieldProblem {
  switch (issue.code) {
    case "too_small": {
      const min = Number(issue.minimum);
      if (issue.origin === "string" || issue.origin === "array") {
        return min <= 1 ? { field, reason: "required" } : { field, reason: "tooShort", min };
      }
      return { field, reason: "outOfRange", min, max: null };
    }
    case "too_big": {
      const max = Number(issue.maximum);
      return issue.origin === "string"
        ? { field, reason: "tooLong", max }
        : { field, reason: "outOfRange", min: null, max };
    }
    case "invalid_format":
      return issue.format === "email"
        ? { field, reason: "invalidEmail" }
        : { field, reason: "invalid" };
    case "invalid_type":
      // Un número que no se pudo leer (`z.coerce.number()` de "abc") llega
      // como tipo inválido; cualquier otro tipo inválido es un campo que no
      // vino en el formulario.
      return issue.expected === "number"
        ? { field, reason: "invalidNumber" }
        : { field, reason: "required" };
    case "invalid_union": {
      const branch = meaningfulBranch(issue);
      return branch ? describe(branch, field) : { field, reason: "invalid" };
    }
    case "custom":
      // `optionalEmail` lo reporta con un `refine`: se trata como email
      // inválido, porque el mensaje tiene que nombrar el campo (¿el email de
      // quién?), cosa que una regla entre campos no hace.
      if (issue.message === "invalidEmail") return { field, reason: "invalidEmail" };
      // Un campo que sólo es obligatorio según otro (el importe, cuando el
      // proyecto se cobra entero): mismo mensaje que cualquier obligatorio.
      if (issue.message === "required") return { field, reason: "required" };
      return isCrossFieldRule(issue.message)
        ? { field, reason: "rule", rule: issue.message }
        : { field, reason: "invalid" };
    default:
      return { field, reason: "invalid" };
  }
}

/**
 * El primer problema del error, o `null` si no hay ninguno. Se reporta uno
 * solo a propósito: el navegador ya marca campo por campo lo que puede, y lo
 * que llega hasta acá suele ser una sola cosa.
 */
export function firstFieldProblem(error: z.ZodError): FieldProblem | null {
  const issue = error.issues[0];
  if (!issue) return null;
  const field = issue.path.length > 0 ? String(issue.path[0]) : "";
  return describe(issue, field);
}

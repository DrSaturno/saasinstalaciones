import "server-only";

import { getTranslations } from "next-intl/server";
import type { z } from "zod";
import { firstFieldProblem } from "@/lib/domain/field-errors";

/**
 * El texto que ve el usuario cuando el servidor rechaza un formulario: qué
 * campo y por qué, en su idioma.
 *
 * `labels` traduce el nombre del campo en el esquema (`contactEmail`) al rótulo
 * del formulario («Email»). Conviene pasarle los MISMOS textos que usa el
 * formulario, sacados del mismo namespace: si el mensaje dijera un nombre
 * distinto al de la pantalla, la persona no sabría a qué campo se refiere.
 *
 * Un campo sin rótulo cae en el mensaje genérico en vez de mostrar el nombre
 * interno: «contactEmail no es válido» sería peor que no nombrar nada.
 */
export async function invalidFieldMessage(
  error: z.ZodError,
  labels: Partial<Record<string, string>>,
): Promise<string> {
  const t = await getTranslations("FieldErrors");
  const problem = firstFieldProblem(error);
  if (!problem) return t("generic");

  // Las reglas entre campos se explican solas; no necesitan rótulo.
  if (problem.reason === "rule") return t(`rules.${problem.rule}`);

  const field = labels[problem.field];
  if (!field) return t("generic");

  switch (problem.reason) {
    case "required":
      return t("required", { field });
    case "tooShort":
      return t("tooShort", { field, min: problem.min });
    case "tooLong":
      return t("tooLong", { field, max: problem.max });
    case "invalidEmail":
      return t("invalidEmail", { field });
    case "invalidNumber":
      return t("invalidNumber", { field });
    case "outOfRange":
      if (problem.min !== null && problem.max !== null) {
        return t("outOfRangeBetween", { field, min: problem.min, max: problem.max });
      }
      return problem.min !== null
        ? t("outOfRangeMin", { field, min: problem.min })
        : t("outOfRangeMax", { field, max: problem.max ?? 0 });
    case "invalid":
      return t("invalid", { field });
  }
}

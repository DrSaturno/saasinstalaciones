"use client";

import { useTranslations } from "next-intl";
import { EXPLICIT_WORK_CONDITIONS } from "@/lib/domain/work-conditions";
import type { ExplicitWorkCondition } from "@/lib/domain/work-conditions";

/**
 * Las condiciones objetivas del trabajo (DEC-16).
 *
 * Van como casillas y no como un desplegable de nivel porque la dificultad no
 * es una opinión: es la suma de condiciones verificables. Y se declaran acá,
 * al cargar la orden, porque el reconocimiento del instalador es por haber
 * aceptado sabiendo — algo que sólo vale si estaban antes de que aceptara.
 *
 * Faltan `exterior` y `flete` a propósito: ya se marcan en sus propias casillas
 * ("es bajo techo" y "requiere flete") y se derivan de ahí.
 */
export function WorkConditionsField({
  defaultSelected = [],
  disabled = false,
}: {
  defaultSelected?: readonly ExplicitWorkCondition[];
  disabled?: boolean;
}) {
  const t = useTranslations("WorkConditions");

  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">{t("legend")}</legend>
      <p className="text-xs text-muted-foreground">{t("help")}</p>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        {EXPLICIT_WORK_CONDITIONS.map((condition) => (
          <label
            key={condition}
            className="flex cursor-pointer items-center gap-3 rounded-xl border bg-muted/20 px-4 py-3"
          >
            <input
              type="checkbox"
              name="conditions"
              value={condition}
              defaultChecked={defaultSelected.includes(condition)}
              disabled={disabled}
              className="size-4 accent-primary"
            />
            <span className="text-sm">{t(`options.${condition}`)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

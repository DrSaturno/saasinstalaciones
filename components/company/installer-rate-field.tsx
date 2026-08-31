"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { setInstallerDefaultRate } from "@/lib/actions/team";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Tarifa sugerida de un instalador en esta empresa.
 *
 * No es un precio fijo: sólo prellena el costo al crear una orden, y cambiarla
 * no toca las órdenes ya creadas. Eso está dicho en pantalla, porque la
 * diferencia importa cuando alguien sube la tarifa y espera que se aplique
 * hacia atrás.
 */
export function InstallerRateField({
  installerId,
  currency,
  defaultRate,
}: {
  installerId: string;
  currency: string;
  defaultRate: number | null;
}) {
  const t = useTranslations("InstallerProfile");
  const [value, setValue] = useState(defaultRate === null ? "" : String(defaultRate));
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const save = () => {
    const trimmed = value.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) {
      toast.error(t("rateInvalid"));
      return;
    }
    startTransition(async () => {
      const res = await setInstallerDefaultRate(installerId, parsed);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(parsed === null ? t("rateCleared") : t("rateSaved"));
      router.refresh();
    });
  };

  const unchanged = value.trim() === (defaultRate === null ? "" : String(defaultRate));

  return (
    <div>
      <p className="text-xs text-muted-foreground">{t("defaultRate")}</p>
      <div className="mt-2 flex items-center gap-2">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-3 flex items-center font-mono text-xs text-muted-foreground">
            {currency}
          </span>
          <Input
            aria-label={t("defaultRate")}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t("ratePlaceholder")}
            className="pl-14 font-mono"
            disabled={pending}
          />
        </div>
        <Button size="sm" variant="outline" onClick={save} disabled={pending || unchanged}>
          {t("rateSave")}
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{t("defaultRateHelp")}</p>
    </div>
  );
}

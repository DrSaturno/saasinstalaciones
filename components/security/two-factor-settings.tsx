"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { disableTotp } from "@/lib/actions/two-factor";
import { Button } from "@/components/ui/button";

/**
 * Estado y gestión de la verificación en dos pasos en ajustes.
 *
 * - Activada: muestra el estado; sólo ofrece "Desactivar" a quien puede (a los
 *   roles obligatorios no se les da la opción — la volverían a exigir igual).
 * - Desactivada: "Activar" lleva al enrolamiento.
 */
export function TwoFactorSettings({
  enrolled,
  required,
}: {
  enrolled: boolean;
  required: boolean;
}) {
  const t = useTranslations("TwoFactor");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const disable = () => {
    startTransition(async () => {
      const result = await disableTotp();
      if (result.ok) {
        toast.success(t("disabled"));
        router.refresh();
      } else {
        toast.error(result.error ?? "");
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-sm">
        <ShieldCheck
          className={`size-4 ${enrolled ? "text-[var(--success)]" : "text-muted-foreground"}`}
          aria-hidden="true"
        />
        {enrolled
          ? t("settingsOn")
          : required
            ? t("settingsOffRequired")
            : t("settingsOffOptional")}
      </p>

      {enrolled ? (
        // A los roles obligatorios no se les ofrece desactivar: sería un botón
        // que no cambia nada duradero (el layout la re-exige).
        !required ? (
          <Button variant="outline" onClick={disable} disabled={pending} className="sm:self-start">
            {t("disable")}
          </Button>
        ) : null
      ) : (
        <Button asChild className="sm:self-start">
          <Link href="/two-factor/setup">{t("enable")}</Link>
        </Button>
      )}
    </div>
  );
}

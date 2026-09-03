"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { setAvailabilityEnabled } from "@/lib/actions/availability";
import { AvailabilityCompanyCard } from "@/components/installer/availability-company-card";
import { GlobalAvailabilityCard } from "@/components/installer/global-availability-card";
import { Button } from "@/components/ui/button";
import type { AvailabilityCompany } from "@/lib/data/availability";
import type { GlobalAvailability } from "@/lib/data/global-availability";

export function AvailabilitySettings({ companies, initialEnabled, global }: { companies: AvailabilityCompany[]; initialEnabled: boolean; global: GlobalAvailability }) {
  const t = useTranslations("Availability");
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();

  // Sólo se puede reactivar desde acá. Para ausentarse hay que cargar fechas y
  // justificación abajo, y que la empresa lo apruebe.
  const reactivate = () => {
    setEnabled(true);
    startTransition(async () => {
      const result = await setAvailabilityEnabled(true);
      if (result.error) { setEnabled(false); toast.error(result.error); return; }
      toast.success(t("enabledToast"));
      router.refresh();
    });
  };

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold">{t("title")}</h2><p className="text-sm text-muted-foreground">{t("description")}</p></div>
        {enabled ? null : <Button type="button" onClick={reactivate} disabled={pending}>{t("enable")}</Button>}
      </div>
      {!enabled ? (
        <p className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">{t("pausedHelp")}</p>
      ) : (
        <p className="mt-4 rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">{t("absenceOnlyHelp")}</p>
      )}
      {/* La propia primero: el orden en pantalla cuenta la regla de precedencia
          — una empresa puede pedir menos horas de las que la persona ofrece,
          nunca más. */}
      <div className="mt-4"><GlobalAvailabilityCard availability={global} /></div>
      <div className="mt-4 grid gap-4">{companies.map((company) => <AvailabilityCompanyCard key={company.id} company={company} disabled={!enabled} />)}</div>
    </section>
  );
}

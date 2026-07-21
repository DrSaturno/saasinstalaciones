"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { setAvailabilityEnabled } from "@/lib/actions/availability";
import { AvailabilityCompanyCard } from "@/components/installer/availability-company-card";
import { Button } from "@/components/ui/button";
import type { AvailabilityCompany } from "@/lib/data/availability";

export function AvailabilitySettings({ companies, initialEnabled }: { companies: AvailabilityCompany[]; initialEnabled: boolean }) {
  const t = useTranslations("Availability");
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    startTransition(async () => {
      const result = await setAvailabilityEnabled(next);
      if (result.error) { setEnabled(!next); toast.error(result.error); return; }
      toast.success(next ? t("enabledToast") : t("disabledToast"));
      router.refresh();
    });
  };

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold">{t("title")}</h2><p className="text-sm text-muted-foreground">{t("description")}</p></div>
        <Button type="button" variant={enabled ? "outline" : "default"} onClick={toggle} disabled={pending}>{enabled ? t("pause") : t("enable")}</Button>
      </div>
      {!enabled ? <p className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">{t("pausedHelp")}</p> : null}
      <div className="mt-4 grid gap-4">{companies.map((company) => <AvailabilityCompanyCard key={company.id} company={company} disabled={!enabled} />)}</div>
    </section>
  );
}

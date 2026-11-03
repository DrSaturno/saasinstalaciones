"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateFinancePaymentRules } from "@/lib/actions/finance-operations";

export function FinanceRulesForm({ amba, interior }: { amba: number; interior: number }) {
  const t = useTranslations("FinanceOperations");
  const [pending, startTransition] = useTransition();
  return <form className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4" onSubmit={(event) => {
    event.preventDefault();
    const payload = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateFinancePaymentRules(payload);
      if (result.error) toast.error(result.error); else toast.success(t("saved"));
    });
  }}>
    <div className="w-full"><h2 className="font-semibold">{t("paymentRules")}</h2>
      <p className="text-xs text-muted-foreground">{t("paymentRulesHint")}</p></div>
    {([{"name":"amba","value":amba,"label":"AMBA"},{"name":"interior","value":interior,"label":t("interior")}] as const).map((field) =>
      <label key={field.name} className="text-sm">{field.label}
        <select name={field.name} defaultValue={field.value} className="mt-1 block rounded-md border p-2">
          {[1,2,3,4,5,6,7].map((day) => <option key={day} value={day}>{t(`weekdays.${day}` as "weekdays.1")}</option>)}
        </select>
      </label>)}
    <button disabled={pending} className="rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50">{t("saveRules")}</button>
  </form>;
}

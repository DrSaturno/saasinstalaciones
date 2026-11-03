"use client";
import { useFinanceActions } from "@/components/company/finance-action-context";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";


export function FinanceExpenseTemplateForm({
  suppliers, month,
}: {
  suppliers: { id: string; name: string }[];
  month: string;
}) {
  const {createFinanceExpenseTemplate, generateFinanceExpenseMonth}=useFinanceActions();
  const t = useTranslations("FinanceOperations");
  const [pending, startTransition] = useTransition();
  return <section className="rounded-xl border bg-white p-5">
    <h2 className="font-semibold">{t("monthlyTemplates")}</h2>
    <p className="mt-1 text-sm text-muted-foreground">{t("monthlyTemplatesHint")}</p>
    <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(event) => {
      event.preventDefault();
      const form = event.currentTarget;
      startTransition(async () => {
        const result = await createFinanceExpenseTemplate(new FormData(form));
        if (result.error) toast.error(result.error);
        else { toast.success(t("saved")); form.reset(); }
      });
    }}>
      <label className="text-sm">{t("supplier")}
        <select name="supplierId" required defaultValue="" className="mt-1 w-full rounded-md border p-2">
          <option value="" disabled>{t("choose")}</option>
          {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
        </select>
      </label>
      <label className="text-sm">{t("category")}
        <select name="category" defaultValue="fixed" className="mt-1 w-full rounded-md border p-2">
          {(["fixed", "payroll", "variable", "service", "logistics", "motorcycle", "travel", "daily", "other"] as const)
            .map((category) => <option key={category} value={category}>{t(`categories.${category}`)}</option>)}
        </select>
      </label>
      <label className="text-sm sm:col-span-2">{t("description")}
        <input name="description" minLength={2} maxLength={500} required className="mt-1 w-full rounded-md border p-2" />
      </label>
      <label className="text-sm">{t("amount")}
        <input name="amount" type="number" min="0.01" step="0.01" required className="mt-1 w-full rounded-md border p-2" />
      </label>
      <label className="text-sm">{t("currency")}
        <select name="currency" defaultValue="ARS" className="mt-1 w-full rounded-md border p-2"><option>ARS</option><option>BRL</option></select>
      </label>
      <label className="text-sm">{t("dueDay")}
        <input name="dueDay" type="number" min="1" max="31" required className="mt-1 w-full rounded-md border p-2" />
      </label>
      <label className="text-sm">{t("startsOn")}
        <input name="startsOn" type="date" defaultValue={`${month}-01`} required className="mt-1 w-full rounded-md border p-2" />
      </label>
      <button disabled={pending} className="w-fit rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{t("createTemplate")}</button>
    </form>
    <button type="button" disabled={pending} onClick={() => startTransition(async () => {
      const result = await generateFinanceExpenseMonth(month);
      if (result.error) toast.error(result.error); else toast.success(t("monthGenerated"));
    })} className="mt-5 rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50">
      {t("generateMonth", { month })}
    </button>
  </section>;
}

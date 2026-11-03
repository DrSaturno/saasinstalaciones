"use client";
import { useFinanceActions } from "@/components/company/finance-action-context";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";


type Template = {
  id: string; supplier_id: string; description: string;
  amount: number; currency: string; due_day: number; active: boolean; category: string;
};

export function FinanceExpenseTemplateList({ templates, supplierNames }: {
  templates: Template[];
  supplierNames: Record<string, string>;
}) {
  const {updateFinanceExpenseTemplate}=useFinanceActions();
  const t = useTranslations("FinanceOperations");
  const [pending, startTransition] = useTransition();
  return <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">{t("activeTemplates")}</h2>
    <p className="mt-1 text-xs text-muted-foreground">{t("templateEditHint")}</p>
    <div className="mt-3 divide-y">{templates.map((row) => <form key={row.id} className="grid gap-2 py-3 text-sm sm:grid-cols-[1fr_1fr_110px_80px_100px_auto] sm:items-end" onSubmit={(event) => {
      event.preventDefault();
      const payload = new FormData(event.currentTarget);
      startTransition(async () => {
        const result = await updateFinanceExpenseTemplate(payload);
        if (result.error) toast.error(result.error); else toast.success(t("saved"));
      });
    }}>
      <input type="hidden" name="id" value={row.id} />
      <div><p className="font-semibold">{supplierNames[row.supplier_id] ?? "—"}</p>
        <p className="text-xs text-muted-foreground">{t(`categories.${row.category}` as "categories.fixed")} · {row.currency}</p></div>
      <label>{t("description")}<input name="description" defaultValue={row.description} minLength={2} maxLength={500} required className="mt-1 w-full rounded-md border p-2" /></label>
      <label>{t("amount")}<input name="amount" type="number" defaultValue={row.amount} min="0.01" step="0.01" required className="mt-1 w-full rounded-md border p-2" /></label>
      <label>{t("dueDay")}<input name="dueDay" type="number" defaultValue={row.due_day} min="1" max="31" required className="mt-1 w-full rounded-md border p-2" /></label>
      <label>{t("status")}<select name="active" defaultValue={String(row.active)} className="mt-1 w-full rounded-md border p-2"><option value="true">{t("templateActive")}</option><option value="false">{t("templateInactive")}</option></select></label>
      <button disabled={pending} className="rounded-md border px-3 py-2 font-semibold disabled:opacity-50">{t("saveTemplate")}</button>
    </form>)}</div>
  </section>;
}

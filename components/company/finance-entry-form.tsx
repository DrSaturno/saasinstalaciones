"use client";
import { useFinanceActions } from "@/components/company/finance-action-context";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";


export function FinanceEntryForm({
  suppliers, clients, expenseMode = false, orderNumber,
}: {
  suppliers: { id: string; name: string; kind: string }[];
  clients: { id: string; name: string }[];
  expenseMode?: boolean;
  orderNumber?: string;
}) {
  const {createFinanceEntry}=useFinanceActions();
  const t = useTranslations("FinanceOperations");
  const [direction, setDirection] = useState<"payable" | "receivable">("payable");
  const [installment, setInstallment] = useState("total");
  const [pending, startTransition] = useTransition();
  return (
    <form className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-4" onSubmit={(event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const payload = new FormData(form);
      startTransition(async () => {
        const result = await createFinanceEntry(payload);
        if (result.error) toast.error(result.error);
        else { toast.success(t("saved")); form.reset(); setDirection("payable"); setInstallment("total"); }
      });
    }}>
      <h2 className="md:col-span-4 text-base font-semibold">{t(expenseMode ? "newExpense" : "newEntry")}</h2>
      {!expenseMode && <label className="text-sm">{t("direction")}
        <select name="direction" value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)} className="mt-1 w-full rounded-md border p-2">
          <option value="payable">{t("payable")}</option><option value="receivable">{t("receivable")}</option>
        </select>
      </label>}
      {expenseMode && <input type="hidden" name="direction" value="payable" />}
      {direction === "payable" ? <label className="text-sm">{t("supplier")}
        <select name="supplierId" required className="mt-1 w-full rounded-md border p-2" defaultValue="">
          <option value="" disabled>{t("choose")}</option>
          {suppliers.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}
        </select>
      </label> : <label className="text-sm">{t("client")}
        <select name="clientId" required className="mt-1 w-full rounded-md border p-2" defaultValue="">
          <option value="" disabled>{t("choose")}</option>
          {clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}
        </select>
      </label>}
      {!expenseMode && <label className="text-sm">{t("orderNumber")}
        <input name="orderNumber" placeholder={t("orderPlaceholder")} defaultValue={orderNumber} readOnly={Boolean(orderNumber)} className="mt-1 w-full rounded-md border p-2" />
      </label>}
      <label className="text-sm">{t("category")}
        <select name="category" defaultValue={expenseMode ? "fixed" : "installation"} className="mt-1 w-full rounded-md border p-2">
          {(expenseMode
            ? ["fixed", "payroll", "variable", "service", "motorcycle", "travel", "daily", "other"] as const
            : ["installation", "coordination", "logistics", "fixed", "payroll", "variable", "service", "motorcycle", "travel", "daily", "other"] as const)
            .map((category) => <option value={category} key={category}>{t(`categories.${category}`)}</option>)}
        </select>
      </label>
      {!expenseMode && <label className="text-sm">{t("installment")}
        <select name="installment" value={installment} onChange={(event) => setInstallment(event.target.value)} className="mt-1 w-full rounded-md border p-2">
          {(["advance", "balance", "total", "recurring"] as const)
            .map((value) => <option value={value} key={value}>{t(`installments.${value}`)}</option>)}
        </select>
      </label>}
      {expenseMode && <input type="hidden" name="installment" value="total" />}
      {!expenseMode && <label className="text-sm">{t("zone")}
        <select name="zone" defaultValue="" className="mt-1 w-full rounded-md border p-2">
          <option value="">{t("notApplicable")}</option><option value="amba">AMBA</option><option value="interior">{t("interior")}</option>
        </select>
      </label>}
      <label className="text-sm">{t("amount")}
        <input name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" required className="mt-1 w-full rounded-md border p-2" />
      </label>
      <label className="text-sm">{t("currency")}
        <select name="currency" defaultValue="ARS" className="mt-1 w-full rounded-md border p-2"><option>ARS</option><option>BRL</option></select>
      </label>
      <label className="text-sm">{t("dueOn")}
        <input name="dueOn" type="date" required={expenseMode || installment === "advance"} className="mt-1 w-full rounded-md border p-2" />
      </label>
      <label className="text-sm md:col-span-3">{t("description")}
        <input name="description" maxLength={500} className="mt-1 w-full rounded-md border p-2" />
      </label>
      <p className="md:col-span-4 text-xs text-muted-foreground">{t(expenseMode ? "expenseDueHint" : "dueHint")}</p>
      <button disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{t("create")}</button>
    </form>
  );
}

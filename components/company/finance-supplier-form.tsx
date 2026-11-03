"use client";
import { useFinanceActions } from "@/components/company/finance-action-context";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";


export function FinanceSupplierForm({ installers, orderId }: { installers: { id: string; full_name: string }[]; orderId?: string }) {
  const {createFinanceSupplier}=useFinanceActions();
  const t = useTranslations("FinanceOperations");
  const [pending, startTransition] = useTransition();
  return <form className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4" onSubmit={(event) => {
    event.preventDefault();
    const form = event.currentTarget;
    startTransition(async () => {
      const result = await createFinanceSupplier(new FormData(form));
      if (result.error) toast.error(result.error);
      else { toast.success(t("saved")); form.reset(); }
    });
  }}>
    {orderId && <input type="hidden" name="orderId" value={orderId} />}
    <h2 className="w-full text-base font-semibold">{t("newSupplier")}</h2>
    <label className="min-w-48 flex-1 text-sm">{t("name")}
      <input name="name" minLength={2} maxLength={160} required className="mt-1 w-full rounded-md border p-2" />
    </label>
    <label className="text-sm">{t("kind")}
      <select name="kind" className="mt-1 w-full rounded-md border p-2">
        {(["installer", "coordinator", "logistics", "service", "employee", "other"] as const)
          .map((kind) => <option key={kind} value={kind}>{t(`supplierKinds.${kind}`)}</option>)}
      </select>
    </label>
    <label className="text-sm">{t("taxId")}
      <input name="taxId" maxLength={40} className="mt-1 w-full rounded-md border p-2" />
    </label>
    <label className="text-sm">{t("linkedInstaller")}
      <select name="installerId" defaultValue="" className="mt-1 w-full rounded-md border p-2">
        <option value="">{t("notApplicable")}</option>
        {installers.map((installer) => <option key={installer.id} value={installer.id}>{installer.full_name}</option>)}
      </select>
    </label>
    <button disabled={pending} className="rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50">{t("create")}</button>
  </form>;
}

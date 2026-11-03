"use client";
import { useFinanceActions } from "@/components/company/finance-action-context";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";


export function FinanceInvoiceSendButton({ id }: { id: string }) {
  const {markFinanceInvoiceSent}=useFinanceActions();
  const t = useTranslations("FinanceOperations");
  const [pending, startTransition] = useTransition();
  return <button type="button" disabled={pending} onClick={() => startTransition(async () => {
    const result = await markFinanceInvoiceSent(id);
    if (result.error) toast.error(result.error); else toast.success(t("invoiceMarkedSent"));
  })} className="text-sm font-semibold text-primary hover:underline disabled:opacity-50">{t("markInvoiceSent")}</button>;
}

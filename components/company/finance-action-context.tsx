"use client";
import { createContext,useContext } from "react";
import { useTranslations } from "next-intl";
import { registerFinanceCheque,changeFinanceCheque,registerFinanceBatch,importExistingFinanceOrders } from "@/lib/actions/finance-cheques";
import { createFinanceSupplier,createFinanceEntry,changeFinanceEntryStatus,registerFinanceTransaction,createFinanceExpenseTemplate,updateFinanceExpenseTemplate,generateFinanceExpenseMonth,markFinanceInvoiceSent } from "@/lib/actions/finance-operations";

import { uploadFinanceDocumentClient, registerFinanceInvoiceClient } from "@/lib/client/finance-upload";

export const financeActions={registerFinanceCheque,changeFinanceCheque,registerFinanceBatch,importExistingFinanceOrders,createFinanceSupplier,createFinanceEntry,changeFinanceEntryStatus,registerFinanceTransaction,createFinanceExpenseTemplate,updateFinanceExpenseTemplate,generateFinanceExpenseMonth,markFinanceInvoiceSent,uploadFinanceDocument:uploadFinanceDocumentClient,registerFinanceInvoice:registerFinanceInvoiceClient};
export type FinanceActions=typeof financeActions;
export const FinanceActionContext=createContext<FinanceActions>(financeActions);
export function useFinanceActions(){
  const actions=useContext(FinanceActionContext),t=useTranslations('FinanceOperations.errors');
  const localized=(error:string|null|undefined)=>error==='invalid_file'?t('fileData'):error==='upload_failed'?t('upload'):error??null;
  return {...actions,
    uploadFinanceDocument:async(form:FormData)=>{const result=await actions.uploadFinanceDocument(form);return {error:localized(result.error)};},
    registerFinanceInvoice:async(form:FormData)=>{const result=await actions.registerFinanceInvoice(form);return {error:localized(result.error)};},
  };
}

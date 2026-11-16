"use client";
import { createContext,useContext } from "react";
import { useTranslations } from "next-intl";
import { registerFinanceCheque,changeFinanceCheque,registerFinanceBatch,importExistingFinanceOrders } from "@/lib/actions/finance-cheques";
import { createFinanceSupplier,createFinanceEntry,changeFinanceEntryStatus,registerFinanceTransaction,createFinanceExpenseTemplate,updateFinanceExpenseTemplate,generateFinanceExpenseMonth,markFinanceInvoiceSent } from "@/lib/actions/finance-operations";
import { approveFinancePayables,rejectSupplierInvoice } from "@/lib/actions/finance-approval";
import { createFinanceExpense } from "@/lib/actions/finance-expenses";
import { saveFinanceDigestSettings,sendFinanceDigestTest } from "@/lib/actions/finance-digest";

import { uploadFinanceDocumentClient, registerFinanceInvoiceClient, attachFinanceTransactionProofClient } from "@/lib/client/finance-upload";

export const financeActions={registerFinanceCheque,changeFinanceCheque,registerFinanceBatch,importExistingFinanceOrders,createFinanceSupplier,createFinanceEntry,changeFinanceEntryStatus,registerFinanceTransaction,createFinanceExpenseTemplate,updateFinanceExpenseTemplate,generateFinanceExpenseMonth,markFinanceInvoiceSent,uploadFinanceDocument:uploadFinanceDocumentClient,registerFinanceInvoice:registerFinanceInvoiceClient,
  // Circuito semanal (docs/specs/2026-11-13-finanzas-flujo-semanal).
  approveFinancePayables,rejectSupplierInvoice,createFinanceExpense,attachFinanceTransactionProof:attachFinanceTransactionProofClient,
  saveFinanceDigestSettings,sendFinanceDigestTest};
export type FinanceActions=typeof financeActions;
export const FinanceActionContext=createContext<FinanceActions>(financeActions);
/**
 * `true` sólo en la demo local (`/finance-preview`), donde una sola persona
 * recorre todo el circuito y no existe la sesión del instalador.
 */
export const FinanceDemoContext=createContext(false);
export function useFinanceDemo(){return useContext(FinanceDemoContext);}
export function useFinanceActions(){
  const actions=useContext(FinanceActionContext),t=useTranslations('FinanceOperations.errors');
  const localized=(error:string|null|undefined)=>error==='invalid_file'?t('fileData'):error==='upload_failed'?t('upload'):error??null;
  return {...actions,
    uploadFinanceDocument:async(form:FormData)=>{const result=await actions.uploadFinanceDocument(form);return {error:localized(result.error)};},
    registerFinanceInvoice:async(form:FormData)=>{const result=await actions.registerFinanceInvoice(form);return {error:localized(result.error)};},
    attachFinanceTransactionProof:async(form:FormData)=>{const result=await actions.attachFinanceTransactionProof(form);return {error:localized(result.error)};},
  };
}

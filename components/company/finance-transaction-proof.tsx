"use client";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { attachFinanceTransactionProofClient } from "@/lib/client/finance-upload";
export function FinanceTransactionProof({transactionId,entryId,operationId,operationType}:{transactionId:string;entryId:string;operationId?:string;operationType?:'batch'|'cheque'}){
  const t=useTranslations('FinanceOperations'),[pending,start]=useTransition();
  const v2=useTranslations('FinanceV2');
  return <form className="mt-2 space-y-1" onSubmit={(event)=>{event.preventDefault();const form=event.currentTarget,payload=new FormData(form);payload.set('transactionId',transactionId);payload.set('entryId',entryId);
    if(operationId&&operationType){payload.set('operationId',operationId);payload.set('operationType',operationType);}
    start(async()=>{const result=await attachFinanceTransactionProofClient(payload);if(result.error)toast.error(result.error==='invalid_file'?t('errors.fileData'):result.error==='upload_failed'?t('errors.upload'):result.error);else{toast.success(t('saved'));form.reset();}});
  }}><input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required aria-label={t('proof')} className="w-40 text-xs"/>{operationId&&<p className="max-w-52 text-xs text-muted-foreground">{v2('sharedReceiptHint')}</p>}<button disabled={pending} className="block text-xs text-primary underline disabled:opacity-50">{t('attach')}</button></form>;
}

"use client";
import { useEffect,useRef } from "react";
import { useTranslations } from "next-intl";

export function FinanceConfirmNotice({message,confirmLabel,onConfirm,onCancel,pending=false}:{message:string;confirmLabel:string;onConfirm:()=>void;onCancel:()=>void;pending?:boolean}) {
  const t=useTranslations('FinanceUX');
  const cancel=useRef<HTMLButtonElement>(null);
  useEffect(()=>{cancel.current?.focus();},[]);
  return <div role="alert" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
    <p>{message}</p>
    <div className="flex flex-wrap gap-2">
      <button ref={cancel} type="button" disabled={pending} onClick={onCancel} className="finance-button bg-white">{t('keepEditing')}</button>
      <button type="button" disabled={pending} onClick={onConfirm} className="finance-button border-amber-300 text-amber-950">{confirmLabel}</button>
    </div>
  </div>;
}

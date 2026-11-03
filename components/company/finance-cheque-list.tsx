"use client";
import { useFinanceActions } from "@/components/company/finance-action-context";
import { FinanceConfirmNotice } from "@/components/company/finance-confirm-notice";
import { useFinanceQuery } from "@/lib/client/use-finance-query";
import { useState,useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { FinanceWorkspace } from "@/lib/data/finance-workspace";


export function FinanceChequeList({data,today}:{data:FinanceWorkspace;today:string}) {
  const {changeFinanceCheque}=useFinanceActions();
  const t=useTranslations('FinanceV2'),ux=useTranslations('FinanceUX');const [status,setStatus]=useState('pending');const [query,setQuery]=useState('');const [pending,start]=useTransition();
  const {params,update}=useFinanceQuery();const overdue=params.get('overdue')==='1';
  const [confirmation,setConfirmation]=useState<{id:string;status:string;date:string;note:string}|null>(null);
  const parties=new Map([...data.suppliers,...data.clients].map((p)=>[p.id,p.name]));
  return <div className="space-y-4">{overdue&&<p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t('overdueLabel')} <button className="ml-3 underline" onClick={()=>update({overdue:null})}>{t('allStatuses')}</button></p>}<div className="flex flex-wrap gap-2"><input aria-label={t('search')} placeholder={t('search')} value={query} onChange={(e)=>setQuery(e.target.value)} className="rounded-lg border bg-white p-2 text-sm"/>
    <select aria-label={t('state')} value={status} onChange={(e)=>setStatus(e.target.value)} className="rounded-lg border bg-white p-2 text-sm"><option value="">{t('allStatuses')}</option>{(['pending','settled','rejected','cancelled','endorsed'] as const).map((s)=><option value={s} key={s}>{t(`chequeStates.${s}`)}</option>)}</select></div>
    <div className="grid items-start gap-4 xl:grid-cols-2">{(['payable','receivable'] as const).map((direction)=>{
      const rows=data.cheques.filter((c)=>c.direction===direction&&(!overdue||(c.status==='pending'&&c.maturity_on<today))&&(!status||c.status===status)&&[c.reference,c.bank,parties.get(c.supplier_id??c.client_id??'')??''].some((v)=>v.toLowerCase().includes(query.toLowerCase()))).sort((a,b)=>a.maturity_on.localeCompare(b.maturity_on));
      return <section className="finance-card overflow-hidden" key={direction}><header className="border-b p-4"><h2 className="font-semibold">{t(direction==='payable'?'issuedCheques':'receivedCheques')}</h2><p className="mt-1 text-xs text-muted-foreground">{t(direction==='payable'?'coverHint':'collectHint')}</p></header>
        <div className="divide-y">{rows.map((c)=><article className="space-y-3 p-4" key={c.id}><div className="flex justify-between gap-4"><div><p className="font-medium">{parties.get(c.supplier_id??c.client_id??'')}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{c.reference} · {c.bank}</p></div><p className="font-sans text-lg font-semibold tracking-tight tabular-nums">{new Intl.NumberFormat('es-AR',{style:'currency',currency:c.currency}).format(c.amount)}</p></div>
          <div className="flex flex-wrap justify-between gap-2 text-xs"><p className={c.status==='pending'&&c.maturity_on<today?'font-semibold text-destructive':''}>{t(direction==='payable'?'coverDate':'collectDate')}: <span className="font-mono">{c.maturity_on}</span></p><span className="rounded-full bg-muted px-2 py-1">{t(`chequeStates.${c.status}` as 'chequeStates.pending')}</span></div>
          <div className="flex flex-wrap gap-2">{data.allocations.filter((a)=>a.cheque_id===c.id).map((a)=>{const entry=data.entries.find((e)=>e.id===a.entry_id);return <Link key={a.entry_id} className="rounded border px-2 py-1 font-mono text-xs text-primary" href={entry?.order_id?`/finance/orders/${entry.order_id}`:'/finance/queries'}>{entry?.orderNumber??entry?.description} · {a.amount.toFixed(2)}</Link>;})}</div>
          <details className="text-xs"><summary className="cursor-pointer text-primary">{t('history')}</summary><ul className="mt-2 space-y-1">{data.events.filter((e)=>e.cheque_id===c.id).sort((a,b)=>a.created_at.localeCompare(b.created_at)).map((e)=><li key={e.id}>{e.occurred_on} · {t(`chequeStates.${e.status}` as 'chequeStates.pending')} {e.note}</li>)}</ul></details>
          {c.status==='pending'&&<form className="flex flex-wrap gap-2" onChange={()=>setConfirmation(null)} onSubmit={(event)=>{event.preventDefault();const payload=new FormData(event.currentTarget);setConfirmation({id:c.id,status:String(payload.get('status')),date:String(payload.get('date')),note:String(payload.get('note'))});}}>
            <select name="status" aria-label={t('action')} className="rounded border p-2 text-xs"><option value="settled">{t(direction==='payable'?'confirmDebit':'confirmCredit')}</option><option value="rejected">{t('reject')}</option><option value="cancelled">{t('cancelCheque')}</option>{direction==='receivable'&&<option value="endorsed">{t('recordEndorsement')}</option>}</select>
            <input name="date" aria-label={t('actualDate')} required type="date" min={c.issued_on} max={today} defaultValue={today} className="rounded border p-2 text-xs"/>
            <input name="note" aria-label={t('note')} placeholder={t('note')} maxLength={500} className="min-w-40 flex-1 rounded border p-2 text-xs"/>
            <button disabled={pending} className="rounded bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{t('confirm')}</button></form>}
          {confirmation?.id===c.id&&<FinanceConfirmNotice pending={pending} message={`${c.reference} · ${t(`chequeStates.${confirmation.status}` as 'chequeStates.pending')} · ${confirmation.date}. ${ux('chequeConfirm')}`} confirmLabel={t('confirm')} onCancel={()=>setConfirmation(null)} onConfirm={()=>start(async()=>{try{const res=await changeFinanceCheque(confirmation.id,confirmation.status,confirmation.date,confirmation.note);if(res.error)toast.error(res.error);else{toast.success(t('saved'));setConfirmation(null);}}catch{toast.error(ux('retryError'));}})}/>}
        </article>)}{!rows.length&&<p className="p-8 text-center text-sm text-muted-foreground">{t('emptyCheques')}</p>}</div>
      </section>;
    })}</div>
  </div>;
}

"use client";
import { useId,useState,useTransition } from "react";
import { useLocale,useTranslations } from "next-intl";
import Link from "next/link";
import { useFinanceActions } from "@/components/company/finance-action-context";
import { FinanceProofUpload } from "@/components/company/finance-proof-upload";
import { financeMoney } from "@/lib/domain/finance-presentation";
import type { FinanceWorkspace } from "@/lib/data/finance-workspace";

export function FinanceBatchForm({data,today,direction,embedded=false,onDirtyChange}:{data:FinanceWorkspace;today:string;direction:'payable'|'receivable';embedded?:boolean;onDirtyChange?:(dirty:boolean)=>void}) {
  const {registerFinanceBatch}=useFinanceActions();
  const t=useTranslations('FinanceV2'),ux=useTranslations('FinanceUX'),locale=useLocale(),formId=useId();
  const [party,setParty]=useState(''),[currency,setCurrency]=useState('ARS'),[values,setValues]=useState<Record<string,string>>({});
  const [installment,setInstallment]=useState('partial'),[requestId,setRequestId]=useState(()=>crypto.randomUUID());
  const [pending,start]=useTransition(),[error,setError]=useState(''),[receipt,setReceipt]=useState('');
  const parties=direction==='payable'?data.suppliers:data.clients;
  const entries=data.entries.filter((e)=>e.direction===direction&&(e.status==='approved'||(installment==='advance'&&e.status==='review'))&&e.available_amount>0&&e.currency===currency&&(e.supplier_id===party||e.client_id===party));
  const total=entries.reduce((sum,e)=>sum+Math.round(Number(values[e.id]??0)*100),0)/100;
  const money=(amount:number)=>financeMoney(amount,currency,locale);
  const invalid=entries.some((e)=>Number(values[e.id]??0)>e.available_amount||Number(values[e.id]??0)<0);
  function setAmount(id:string,value:string){setValues((current)=>({...current,[id]:value}));onDirtyChange?.(true);setError('');}
  const content=receipt?<div className="space-y-4 py-4"><p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">{receipt}</p><button className="finance-button" onClick={()=>setReceipt('')}>{ux('newRecord')}</button></div>:<div className="mt-4 space-y-5">
    <form id={formId} onChange={()=>onDirtyChange?.(true)} className="space-y-5" onSubmit={(event)=>{
      event.preventDefault();if(pending||total<=0||invalid)return;const payload=new FormData(event.currentTarget);setError('');
      start(async()=>{try{const result=await registerFinanceBatch(requestId,{installment,method:payload.get('method'),reference:payload.get('reference'),occurred_on:payload.get('date'),amount:total,allocations:entries.filter((e)=>Number(values[e.id])>0).map((e)=>({entry_id:e.id,amount:Number(values[e.id]),proof_document_id:String(payload.get(`proof-${e.id}`)??'')||undefined}))});
        if(result.error){setError(result.error);return;}setReceipt(ux('batchSaved',{amount:money(total),party:parties.find((p)=>p.id===party)?.name??''}));setValues({});onDirtyChange?.(false);setRequestId(crypto.randomUUID());
      }catch{setError(ux('retryError'));}});
    }}>
      <label className="block text-sm font-medium">{ux(direction==='payable'?'choosePayee':'choosePayer')}<select required value={party} onChange={(e)=>{setParty(e.target.value);setValues({});}} className="mt-2 block w-full border"><option value="">{t('choose')}</option>{parties.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <details className="rounded-lg border px-4 py-3"><summary className="cursor-pointer text-sm text-primary">{ux('advancedPayment')}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">{t('installment')}<select value={installment} onChange={(e)=>{setInstallment(e.target.value);setValues({});}} className="mt-1 block w-full border">{(['partial','total','advance','balance'] as const).map((part)=><option key={part} value={part}>{t(`installments.${part}`)}</option>)}</select></label>
        <label className="text-sm">{t('currency')}<select value={currency} onChange={(e)=>{setCurrency(e.target.value);setValues({});}} className="mt-1 block w-full border"><option>ARS</option><option>BRL</option></select></label>
      </div></details>
      {!party&&<p className="rounded-lg bg-slate-50 p-4 text-sm text-muted-foreground">{ux('selectPartyHint')}</p>}
      {party&&!entries.length&&<div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900"><p>{ux('noEligible')}</p><Link className="mt-2 inline-block underline" href={`/finance/${direction==='payable'?'payments':'collections'}?status=review&group=all`}>{t('awaitingReview')}</Link></div>}
      {entries.length>0&&<fieldset className="space-y-3"><legend className="mb-3 text-sm font-semibold">{ux('chooseEntries')}</legend>{entries.map((e)=><div key={e.id} className="rounded-xl border p-4">
        <div className="flex flex-wrap justify-between gap-2"><div><p className="text-sm font-semibold">{e.orderNumber??e.description}</p><p className="mt-1 text-xs text-muted-foreground">{t('available')}: {money(e.available_amount)}</p></div><button type="button" className="text-sm font-medium text-primary underline" onClick={()=>setAmount(e.id,String(e.available_amount))}>{ux('payFull')}</button></div>
        <label className="mt-3 block text-sm">{t('amount')}<input aria-label={`${t('amount')} · ${e.orderNumber??e.description}`} type="number" inputMode="decimal" min="0" max={e.available_amount} step="0.01" value={values[e.id]??''} onChange={(event)=>setAmount(e.id,event.target.value)} className="mt-1 block w-full border tabular-nums"/></label>
        <p className="mt-2 text-xs text-muted-foreground">{ux('remaining')}: {money(Math.max(0,e.available_amount-Number(values[e.id]??0)))}</p>
        {Number(values[e.id])>0&&<label className="mt-3 block text-sm">{t('proof')}<select name={`proof-${e.id}`} className="mt-1 block w-full border"><option value="">{t('proofPending')}</option>{data.documents.filter((d)=>d.entry_id===e.id&&d.kind===(direction==='payable'?'transfer_proof':'bank_credit')).map((d)=><option key={d.id} value={d.id}>{d.file_name}</option>)}</select></label>}
      </div>)}</fieldset>}
      {entries.length>0&&<fieldset className="grid gap-3 sm:grid-cols-2"><legend className="mb-3 text-sm font-semibold">{ux('paymentDetails')}</legend>
        <label className="text-sm">{t('method')}<select name="method" className="mt-1 block w-full border"><option value="transfer">{t('transfer')}</option><option value="cash">{t('cash')}</option></select></label>
        <label className="text-sm">{t('actualDate')}<input type="date" name="date" required max={today} defaultValue={today} className="mt-1 block w-full border"/></label>
        <label className="text-sm sm:col-span-2">{t('reference')}<input name="reference" maxLength={160} className="mt-1 block w-full border"/></label>
      </fieldset>}
    </form>
    {entries.filter((e)=>Number(values[e.id])>0).map((e)=><div key={e.id}><p className="mb-2 text-xs text-muted-foreground">{e.orderNumber??e.description}</p><FinanceProofUpload entryId={e.id} direction={direction}/></div>)}
    <div className="space-y-3 border-t bg-white pt-4"><div className="flex items-center justify-between gap-3"><p className="text-sm">{ux('allocated')}</p><strong className="text-xl tabular-nums">{money(total)}</strong></div><p className="text-xs text-muted-foreground">{ux('recordOnly')} {ux('reviewPayment')}</p>
      {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <button form={formId} disabled={pending||total<=0||invalid} className="finance-button finance-button-primary w-full">{pending?ux('saving'):t('registerCash')}</button>
    </div>
  </div>;
  return embedded?content:<details className="finance-card p-4"><summary className="cursor-pointer text-sm font-semibold text-primary">{t(direction==='payable'?'batchPayment':'batchCollection')}</summary>{content}</details>;
}

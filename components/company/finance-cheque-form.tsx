"use client";
import { useFinanceActions } from "@/components/company/finance-action-context";
import { useState,useTransition } from "react";
import { financeMoney } from "@/lib/domain/finance-presentation";
import { useLocale,useTranslations } from "next-intl";
import { toast } from "sonner";

import { cents,chequeMaturity,suggestChequeAllocations } from "@/lib/domain/finance-ledger";
import type { FinanceWorkspace } from "@/lib/data/finance-workspace";

export function FinanceChequeForm({data,today,initialEntry}:{data:FinanceWorkspace;today:string;initialEntry?:string}) {
  const {registerFinanceCheque}=useFinanceActions();
  const t=useTranslations('FinanceV2'),ux=useTranslations('FinanceUX'),locale=useLocale();const initial=data.entries.find((e)=>e.id===initialEntry);
  const [direction,setDirection]=useState(initial?.direction??'receivable');
  const [party,setParty]=useState(initial?.client_id??initial?.supplier_id??'');
  const [project,setProject]=useState(initial?.projectId??'');const [invoice,setInvoice]=useState('');
  const [amount,setAmount]=useState('');const [currency,setCurrency]=useState(initial?.currency??'ARS');
  const [issued,setIssued]=useState(today);const [term,setTerm]=useState<30|60|90|120>(30);
  const [maturity,setMaturity]=useState(chequeMaturity(today,30));const [manual,setManual]=useState<Record<string,string>>({});
  const [requestId,setRequestId]=useState(()=>crypto.randomUUID());const [pending,start]=useTransition();
  const candidates=data.entries.filter((e)=>e.direction===direction&&e.currency===currency&&['review','approved'].includes(e.status)&&e.available_amount>0&&
    (e.client_id===party||e.supplier_id===party)&&(!project||e.projectId===project)&&(!invoice||e.invoices.some((i)=>i.id===invoice)));
  let suggestion:{allocations:{entry_id:string;amount:number}[];excess:number}={allocations:[],excess:0};
  try{suggestion=suggestChequeAllocations(cents(amount),candidates.map((e)=>({id:e.id,amount:cents(e.amount),paid:cents(e.paid_amount),reserved:cents(e.reserved_amount)})));}catch{}
  const values=candidates.map((e)=>({entry_id:e.id,amount:Number(manual[e.id]??suggestion.allocations.find((a)=>a.entry_id===e.id)?.amount??0)}));
  const total=values.reduce((sum,a)=>sum+Math.round(a.amount*100),0);
  const invoices=[...new Map(data.entries.filter((e)=>e.client_id===party||e.supplier_id===party).flatMap((e)=>e.invoices).map((i)=>[i.id,i])).values()];
  const input='mt-1 block w-full rounded-lg border bg-white p-2 text-sm';
  return <details open={!!initialEntry} className="finance-card group"><summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-primary">{t('newCheque')}</summary>
    <form className="space-y-5 border-t border-[#e5ecf1] p-5" onSubmit={(event)=>{event.preventDefault();const form=event.currentTarget;const payload=new FormData(form);
      start(async()=>{const result=await registerFinanceCheque(requestId,{installment:payload.get('installment'),direction,party_id:party,project_id:project||undefined,kind:payload.get('kind'),reference:payload.get('reference'),bank:payload.get('bank'),issued_on:issued,maturity_on:maturity,term_days:term,amount:Number(amount),currency,allocations:values.filter((a)=>a.amount>0)});
        if(result.error)toast.error(result.error);else{toast.success(t('saved'));setAmount('');setManual({});setRequestId(crypto.randomUUID());form.reset();}});
    }}><fieldset className="grid gap-4 sm:grid-cols-2"><legend className="mb-3 text-sm font-semibold">{ux('chequeIdentity')}</legend>
      <label className="text-xs">{t('direction')}<select className={input} value={direction} onChange={(e)=>{setDirection(e.target.value);setParty('');setProject('');setInvoice('');setManual({});}}><option value="receivable">{t('received')}</option><option value="payable">{t('issued')}</option></select></label>
      <label className="text-xs">{t(direction==='receivable'?'client':'beneficiary')}<select required className={input} value={party} onChange={(e)=>{setParty(e.target.value);setProject('');setInvoice('');setManual({});}}><option value="">{t('choose')}</option>
        {(direction==='receivable'?data.clients:data.suppliers.filter((s)=>!['installer','coordinator'].includes(s.kind))).map((p)=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
      </fieldset><div hidden={!party} className="space-y-5"><details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm text-primary">{ux('chequeFilters')}</summary><div className="mt-3 grid gap-4 sm:grid-cols-2"><label className="text-xs">{t('project')}<select className={input} value={project} onChange={(e)=>{setProject(e.target.value);setInvoice('');setManual({});}}><option value="">{t('allProjects')}</option>{data.projects.filter((p)=>direction==='payable'||p.client_id===party).map((p)=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
      <label className="text-xs">{t('invoice')}<select className={input} value={invoice} onChange={(e)=>{setInvoice(e.target.value);setManual({});}}><option value="">{t('allInvoices')}</option>{invoices.map((i)=><option value={i.id} key={i.id}>{i.invoice_number}</option>)}</select></label>
      </div></details><fieldset className="grid gap-4 sm:grid-cols-2"><legend className="mb-3 text-sm font-semibold">{ux('chequeDetails')}</legend><label className="text-xs">{t('installment')}<select name="installment" defaultValue="partial" className={input}>{(['total','partial','advance','balance'] as const).map((part)=><option key={part} value={part}>{t(`installments.${part}`)}</option>)}</select></label>
      <label className="text-xs">{t('chequeKind')}<select name="kind" className={input}><option value="electronic">{t('electronic')}</option><option value="physical">{t('physical')}</option></select></label>
      {(['reference','bank'] as const).map((key)=><label className="text-xs" key={key}>{t(key)}<input name={key} className={input} maxLength={key==='bank'?160:100} required/></label>)}
      <label className="text-xs">{t('currency')}<select value={currency} onChange={(e)=>{setCurrency(e.target.value);setManual({});}} className={input}><option>ARS</option><option>BRL</option></select></label>
      <label className="text-xs">{t('issuedOn')}<input type="date" required value={issued} onChange={(e)=>{setIssued(e.target.value);if(e.target.value)setMaturity(chequeMaturity(e.target.value,term));}} className={input}/></label>
      <label className="text-xs">{t('term')}<select value={term} onChange={(e)=>{const days=Number(e.target.value) as 30|60|90|120;setTerm(days);if(issued)setMaturity(chequeMaturity(issued,days));}} className={input}>{([30,60,90,120] as const).map((days)=><option key={days} value={days}>{t('days',{count:days})}</option>)}</select></label>
      <label className="text-xs">{t('maturity')}<input type="date" min={issued} required value={maturity} onChange={(e)=>setMaturity(e.target.value)} className={input}/></label>
      <label className="text-xs">{t('amount')}<input type="number" min="0.01" step="0.01" required value={amount} onChange={(e)=>{setAmount(e.target.value);setManual({});}} className={input}/></label>
    </fieldset><h3 className="text-sm font-semibold">{ux('chequeAllocation')}</h3><p className="text-xs text-muted-foreground">{t('suggestionHint')}</p>
      <div className="max-h-80 space-y-2 overflow-y-auto">{candidates.map((e)=><label key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"><span><span className="font-mono">{e.orderNumber??'—'}</span> · {e.description}<span className="block text-xs text-muted-foreground">{t('available')}: {financeMoney(e.available_amount,e.currency,locale)}</span></span><input aria-label={t('allocateTo',{order:e.orderNumber??e.description})} type="number" min="0" max={e.available_amount} step="0.01" className="w-36 rounded-lg border p-2 font-mono" value={manual[e.id]??suggestion.allocations.find((a)=>a.entry_id===e.id)?.amount??0} onChange={(event)=>setManual({...manual,[e.id]:event.target.value})}/></label>)}</div>
      {!candidates.length&&<p className="text-sm text-muted-foreground">{t('noAvailableEntries')}</p>}
      <p className="text-sm">{t('allocationTotal')}: <strong className="font-mono">{financeMoney(total/100,currency,locale)}</strong></p>
      {suggestion.excess>0&&<p role="alert" className="text-sm text-destructive">{t('allocationExcess')}</p>}
      <p role="status" className="text-sm text-muted-foreground">{total!==Math.round(Number(amount)*100)&&ux(total>Math.round(Number(amount)*100)?'chequeExcess':'chequeRemaining',{amount:financeMoney(Math.abs(Math.round(Number(amount)*100)-total)/100,currency,locale)})}</p><button disabled={pending||!party||!amount||total!==Math.round(Number(amount)*100)||suggestion.excess>0} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{t('saveCheque')}</button>
    </div>{!party&&<p className="rounded-lg bg-slate-50 p-4 text-sm text-muted-foreground">{ux('chooseChequeParty')}</p>}</form>
  </details>;
}

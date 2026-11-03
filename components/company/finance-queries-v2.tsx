"use client";
import { useFinanceQuery } from "@/lib/client/use-finance-query";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { FinanceWorkspace } from "@/lib/data/finance-workspace";
import { financePeriodRange,type FinancePeriod } from "@/lib/domain/finance-ledger";
import { FinancePeriodControls } from "@/components/company/finance-period-controls";
import { Dialog,DialogContent,DialogTitle,DialogDescription } from "@/components/ui/dialog";
import { FinanceMovements } from "@/components/company/finance-movements";
export function FinanceQueriesV2({data,today}:{data:FinanceWorkspace;today:string}) {
  const t=useTranslations('FinanceV2'),ux=useTranslations('FinanceUX');const {params,update}=useFinanceQuery();
  const category=params.get('category')??'all',q=params.get('q')??'',selected=params.get('selected')??'';
  const setCategory=(value:string)=>update({category:value,selected:null});const setQ=(value:string)=>update({q:value,selected:null});const setSelected=(value:string)=>update({selected:value});
  const differences=params.get('differences')==='1',order=params.get('order');
  const [period,setPeriod]=useState<FinancePeriod>('month');const [range,setRange]=useState(financePeriodRange(today,'month'));
  const change=(p:FinancePeriod,from?:string,to?:string)=>{setPeriod(p);setRange(p==='custom'?{from:from??range.from,to:to??range.to}:financePeriodRange(today,p));};
  const references=new Map<string,string[]>(),periodAmounts=new Map<string,number>();
  for(const tx of data.transactions){references.set(tx.entry_id,[...(references.get(tx.entry_id)??[]),tx.reference]);if(tx.occurred_on>=range.from&&tx.occurred_on<=range.to)periodAmounts.set(tx.entry_id,(periodAmounts.get(tx.entry_id)??0)+Math.round(tx.amount*100));}
  const chequeReferences=new Map(data.cheques.map((c)=>[c.id,c.reference]));
  for(const a of data.allocations)references.set(a.entry_id,[...(references.get(a.entry_id)??[]),chequeReferences.get(a.cheque_id)??'']);
  const entries=data.entries.filter((e)=>(!order||e.order_id===order)&&(!differences||e.invoices.some((i)=>i.sourceAmount!==null&&i.sourceAmount!==e.amount))&&(category==='all'||category==='orders'||category==='projects'||category==='sites'||
    (category==='clients'?e.direction==='receivable':category==='suppliers'?e.direction==='payable'&&!['installer','coordinator'].includes(e.supplierKind??''):e.supplierKind===category))&&
    [e.partyName,e.orderNumber,e.projectName,e.siteName,e.description,...e.invoices.map((i)=>i.invoice_number),...(references.get(e.id)??[])].some((s)=>s?.toLowerCase().includes(q.toLowerCase())));
  const grouped=new Map<string,{name:string;direction:string;currency:string;ids:string[];period:number;pending:number;reserved:number;credit:number}>();
  for(const e of entries){
    const element=category==='orders'?e.order_id:category==='projects'?e.projectId:category==='sites'?e.siteId:e.supplier_id??e.client_id;
    const key=`${element??'general'}:${e.direction}:${e.currency}`;
    const name=(category==='orders'?e.orderNumber:category==='projects'?e.projectName:category==='sites'?e.siteName:e.partyName)??t('generalCosts');
    const group=grouped.get(key)??{name,direction:e.direction,currency:e.currency,ids:[],period:0,pending:0,reserved:0,credit:0};
    group.ids.push(e.id);if(e.status!=='void'){group.pending+=e.open_amount;group.reserved+=e.reserved_amount;group.credit+=e.credit_amount;}
    group.period+=(periodAmounts.get(e.id)??0)/100;
    grouped.set(key,group);
  }
  const directory=category==='installer'||category==='coordinator'?data.people.filter((p)=>p.roles.includes(category)):
    category==='clients'?data.clients:category==='suppliers'?data.suppliers.filter((s)=>!['installer','coordinator'].includes(s.kind)):
    category==='orders'?data.orders.map((o)=>({id:o.id,name:o.order_number})):category==='projects'?data.projects:category==='sites'?data.sites:[];
  for(const item of directory){
    if(differences||order)continue;
    if(!item.name.toLowerCase().includes(q.toLowerCase()))continue;
    const represented=entries.some((e)=>category==='installer'||category==='coordinator'?e.installerId===item.id:category==='clients'?e.client_id===item.id:category==='suppliers'?e.supplier_id===item.id:category==='orders'?e.order_id===item.id:category==='projects'?e.projectId===item.id:e.siteId===item.id);
    if(!represented)grouped.set(`directory-${item.id}`,{name:item.name,direction:category==='clients'?'receivable':'payable',currency:'ARS',ids:[],period:0,pending:0,reserved:0,credit:0});
  }
  const groups=[...grouped.entries()].sort(([,a],[,b])=>a.name.localeCompare(b.name));
  const selectedGroup=grouped.get(selected);const money=(n:number,currency:string)=>new Intl.NumberFormat('es-AR',{style:'currency',currency}).format(n);
  return <main className="space-y-5 pb-12"><header><h1 className="text-3xl font-bold">{t('queries')}</h1><p className="mt-2 text-sm text-muted-foreground">{t('queriesHint')}</p></header>
    <div className="flex flex-wrap gap-2">{['all','orders','projects','sites','installer','coordinator','suppliers','clients'].map((value)=><button key={value} aria-pressed={category===value} onClick={()=>{setCategory(value);}} className={`rounded-lg border px-3 py-2 text-sm ${category===value?'border-primary bg-primary/10 text-primary':'bg-white'}`}>{t(`queryCategories.${value}` as 'queryCategories.all')}</button>)}</div>
    <div className="flex flex-wrap items-end justify-between gap-4"><input value={q} onChange={(e)=>{setQ(e.target.value);}} aria-label={t('search')} placeholder={t('search')} className="min-w-60 rounded-lg border bg-white p-2 text-sm"/><FinancePeriodControls period={period} from={range.from} to={range.to} onChange={change}/></div>
    <p className="rounded-lg bg-blue-50 p-3 text-sm text-slate-700">{ux('balanceScope')}</p>{(differences||order)&&<p className="text-sm">{differences?t('invoiceDifferencesLabel'):ux('selectedOrder')} <button className="text-primary underline" onClick={()=>update({differences:null,order:null})}>{ux('clearFilters')}</button></p>}<details className="text-xs text-muted-foreground"><summary className="cursor-pointer">{t('balanceScopesTitle')}</summary><p className="mt-2 max-w-4xl leading-relaxed">{t('balanceScopes')}</p></details>
    {range.from>range.to?<p role="alert" className="text-destructive">{t('invalidRange')}</p>:<>
    <div className="finance-card overflow-x-auto"><table className="finance-table finance-query-table min-w-[900px]"><thead><tr>{(['element','direction','periodCash','currentPending','reserved','credit','detail'] as const).map((key)=><th key={key}>{t(key)}</th>)}</tr></thead><tbody>{groups.map(([key,g])=><tr key={key} className={selected===key?'bg-primary/5':''}><td className="finance-primary-cell font-medium">{g.name}</td><td data-label={t('direction')} className="text-xs text-muted-foreground">{t(g.direction==='payable'?'outgoing':'incoming')}</td>{[g.period,g.pending,g.reserved,g.credit].map((n,i)=><td key={i} data-label={t((['periodCash','currentPending','reserved','credit'] as const)[i])} className="whitespace-nowrap text-right font-sans font-medium tabular-nums">{money(n,g.currency)}</td>)}<td className="finance-action-cell"><button className="inline-flex min-h-8 items-center whitespace-nowrap text-xs font-medium text-primary hover:underline" onClick={()=>setSelected(selected===key?'':key)}>{t('viewHistory')}</button></td></tr>)}{!groups.length&&<tr><td colSpan={7} className="text-center text-muted-foreground">{t('emptyMovements')}</td></tr>}</tbody></table></div>
    {selectedGroup&&<Dialog open onOpenChange={(open)=>{if(!open)setSelected('');}}><DialogContent className="finance-workspace max-h-[90dvh] overflow-y-auto sm:max-w-[980px]"><DialogTitle>{selectedGroup.name}</DialogTitle><DialogDescription>{ux('balanceScope')}</DialogDescription><section className="space-y-4"><FinanceMovements data={data} entryIds={selectedGroup.ids} from={range.from} to={range.to}/><div className="space-y-2">{entries.filter((e)=>selectedGroup.ids.includes(e.id)).map((e)=><details className="rounded-xl border bg-white p-4" key={e.id}><summary className="cursor-pointer text-sm">{e.orderNumber??e.description} · {e.partyName}</summary><div className="mt-3 space-y-2 text-sm">
      {e.order_id&&<Link className="block text-primary" href={`/finance/orders/${e.order_id}`}>{t('viewOrder')}</Link>}
      {e.invoices.some((i)=>i.sourceAmount!==null&&i.sourceAmount!==e.amount)&&<p className="text-orange-800">{t('invoiceChanged')}</p>}
      {data.documents.filter((d)=>d.entry_id===e.id).map((d)=><a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer" className="block text-primary underline">{d.file_name}</a>)}
    </div></details>)}</div></section></DialogContent></Dialog>}</>}
  </main>;
}

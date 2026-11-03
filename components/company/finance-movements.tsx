"use client";
import Link from "next/link";
import { useLocale,useTranslations } from "next-intl";
import { ArrowDownLeft,ArrowUpRight,Info } from "lucide-react";
import { financeDisplayDate,financeMoney } from "@/lib/domain/finance-presentation";
import type { FinanceWorkspace } from "@/lib/data/finance-workspace";

export function FinanceMovements({data,entryIds,from,to,confirmedOnly=false}:{confirmedOnly?:boolean;data:FinanceWorkspace;entryIds?:string[];from:string;to:string}) {
  const t=useTranslations('FinanceV2'),locale=useLocale();
  const entries=new Map(data.entries.filter((e)=>!entryIds||entryIds.includes(e.id)).map((e)=>[e.id,e]));
  const checks=new Map(data.cheques.map((c)=>[c.id,c]));
  const movements=[
    ...data.transactions.flatMap((tx)=>{const entry=entries.get(tx.entry_id);return entry?[{id:tx.id,date:tx.occurred_on,amount:tx.amount,kind:'realized' as const,entry,reference:tx.reference}]:[];}),
    ...[...entries.values()].filter((e)=>e.status!=='void'&&e.available_amount>0).map((entry)=>({id:`plan-${entry.id}`,date:entry.due_on,amount:entry.available_amount,kind:'planned' as const,entry,reference:''})),
    ...data.allocations.flatMap((a)=>{const entry=entries.get(a.entry_id),check=checks.get(a.cheque_id);return entry&&check?.status==='pending'?[{id:`${check.id}-${entry.id}`,date:check.maturity_on,amount:a.amount,kind:'chequePending' as const,entry,reference:check.reference}]:[];}),
  ].filter((m)=>(!confirmedOnly||m.kind==='realized')&&m.date&&m.date>=from&&m.date<=to).sort((a,b)=>(b.date??'').localeCompare(a.date??'')||a.id.localeCompare(b.id));
  return <section className="finance-card overflow-hidden">
    <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><h2 className="text-sm font-semibold">{t('movements')}</h2><details className="max-w-lg text-xs text-[#7b8e9d]"><summary className="flex cursor-pointer list-none items-center gap-1.5"><Info className="size-3.5" aria-hidden="true"/>{t('dateCriteria')}</summary><p className="mt-2 leading-relaxed">{t('movementDates')}</p></details></header>
    <div className="overflow-x-auto"><table className="finance-table min-w-[780px]"><thead><tr>
      {(['date','partyAndConcept','order','state','amount'] as const).map((key)=><th className={key==='amount'?'text-right':''} key={key}>{t(key)}</th>)}
    </tr></thead><tbody className="divide-y">{movements.map((m)=><tr key={m.id}>
      <td className="whitespace-nowrap text-xs text-[#718391]">{financeDisplayDate(m.date,locale)}</td><td><div className="flex items-center gap-3"><span className={`grid size-8 shrink-0 place-items-center rounded-lg ${m.entry.direction==='receivable'?'bg-emerald-50 text-emerald-600':'bg-orange-50 text-orange-600'}`}>{m.entry.direction==='receivable'?<ArrowDownLeft className="size-4" aria-label={t('incoming')}/>:<ArrowUpRight className="size-4" aria-label={t('outgoing')}/>}</span><div className="min-w-0"><p className="font-medium text-[#29495e]">{m.entry.partyName}</p><p className="mt-1 max-w-80 truncate text-xs text-[#8495a2]" title={`${m.entry.description} ${m.reference}`}>{m.entry.description}{m.reference&&` · ${m.reference}`}</p></div></div></td>
      <td>{m.entry.order_id?<Link className="rounded-md bg-[#f0f5f8] px-2 py-1 font-mono text-xs text-[#54809b]" href={`/finance/orders/${m.entry.order_id}`}>{m.entry.orderNumber}</Link>:<span className="text-slate-400">—</span>}</td>
      <td><span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${m.kind==='realized'?'bg-emerald-50 text-emerald-800':m.kind==='chequePending'?'bg-amber-50 text-amber-800':'bg-[#edf4fa] text-[#4b7b9b]'}`}><span className="size-1 rounded-full bg-current"/>{t(m.kind)}</span></td>
      <td className="whitespace-nowrap text-right font-sans text-[15px] font-semibold tracking-tight tabular-nums"><span className="mr-1 text-[#93a5b2]">{m.entry.direction==='receivable'?'+':'−'}</span>{financeMoney(m.amount,m.entry.currency,locale)}</td>
    </tr>)}{movements.length===0&&<tr><td colSpan={5} className="text-center text-muted-foreground">{t('emptyMovements')}</td></tr>}</tbody></table></div>
    <p className="border-t border-[#edf1f5] px-5 py-3 text-xs text-[#8495a2]">{t('movementCount',{count:movements.length})}</p>
  </section>;
}

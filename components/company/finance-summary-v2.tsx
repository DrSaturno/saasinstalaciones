"use client";
import { useFinanceActions } from "@/components/company/finance-action-context";
import { useState,useTransition } from "react";
import Link from "next/link";
import { useLocale,useTranslations } from "next-intl";
import { CalendarDays,ChevronRight,Download,RefreshCw,SlidersHorizontal,TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { FinanceWorkspace } from "@/lib/data/finance-workspace";
import { financePeriodRange,type FinancePeriod } from "@/lib/domain/finance-ledger";
import { nextFinanceWeekday } from "@/lib/domain/finance-forecast";
import { financeDisplayDate,financeMoney } from "@/lib/domain/finance-presentation";
import { FinancePeriodControls } from "@/components/company/finance-period-controls";
import { FinanceMovements } from "@/components/company/finance-movements";

export function FinanceSummaryV2({data,today}:{data:FinanceWorkspace;today:string}) {
  const {importExistingFinanceOrders}=useFinanceActions();
  const t=useTranslations('FinanceV2'),locale=useLocale();const [pending,start]=useTransition();
  const [period,setPeriod]=useState<FinancePeriod>('month'),[range,setRange]=useState(financePeriodRange(today,'month'));
  const change=(p:FinancePeriod,from?:string,to?:string)=>{setPeriod(p);setRange(p==='custom'?{from:from??range.from,to:to??range.to}:financePeriodRange(today,p));};
  const forecast=(zone:string,date:string)=>{
    const sums=new Map<string,number>();
    for(const e of data.entries)if(e.direction==='payable'&&e.order_id&&e.zone===zone&&e.status==='approved'&&e.due_on&&e.due_on<=date&&e.open_amount>0&&['installer','coordinator'].includes(e.supplierKind??''))sums.set(e.currency,(sums.get(e.currency)??0)+Math.round(e.open_amount*100));
    return [...sums].map(([currency,value])=>[currency,value/100] as const);
  };
  const alerts=[
    {count:data.entries.filter((e)=>e.status==='review'&&e.direction==='payable').length,label:t('reviewPayments'),href:'/finance/payments?status=review&group=all'},
    {count:data.entries.filter((e)=>e.status==='review'&&e.direction==='receivable').length,label:t('reviewCollections'),href:'/finance/collections?status=review'},
    {count:data.cheques.filter((c)=>c.status==='pending'&&c.maturity_on<today).length,label:t('overdueLabel'),href:'/finance/cheques?overdue=1'},
    {count:data.entries.filter((e)=>e.invoices.some((i)=>i.sourceAmount!==null&&i.sourceAmount!==e.amount)).length,label:t('invoiceDifferencesLabel'),href:'/finance/queries?differences=1'},
  ];
  const missingProofs=new Set(data.transactions.filter((tx)=>['transfer','check'].includes(tx.method)&&!tx.proof_document_id).map((tx)=>tx.batch_id??tx.cheque_id??tx.id)).size;
  const excessReservations=data.entries.filter((e)=>e.status!=='void'&&e.reserved_amount>e.open_amount).length;
  return <main className="space-y-6 pb-10">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="finance-title">{t('summary')}</h1><p className="mt-2 text-[13px] text-[#718391]">{t('summaryHint')}</p></div><div className="flex flex-wrap gap-2"><button disabled={pending} onClick={()=>start(async()=>{const res=await importExistingFinanceOrders();if(res.error)toast.error(res.error);else toast.success(t('synced'));})} className="finance-button"><RefreshCw className={`size-3.5 ${pending?'motion-safe:animate-spin':''}`} aria-hidden="true"/>{t('syncOrders')}</button><a className="finance-button finance-button-primary" href={`/api/finance/summary/pdf?from=${range.from}&to=${range.to}`} target="_blank" rel="noopener noreferrer"><Download className="size-4" aria-hidden="true"/>{t('downloadPdf')}</a></div></header>
    <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]">
      <section className="finance-card overflow-hidden"><header className="flex items-center gap-2.5 border-b border-[#e9eef3] px-5 py-4"><CalendarDays className="size-4 text-primary" aria-hidden="true"/><h2 className="text-sm font-semibold">{t('upcomingPayments')}</h2></header><div className="grid divide-y divide-[#e5ecf1] sm:grid-cols-2 sm:divide-x sm:divide-y-0">{(['amba','interior'] as const).map((zone)=>{
        const date=nextFinanceWeekday(today,zone==='amba'?1:2),sums=forecast(zone,date);
        return <Link href={`/finance/payments?zone=${zone}`} key={zone} className="group px-6 py-5 transition-colors hover:bg-[#f8fbfd] motion-reduce:transition-none"><div className="flex items-center justify-between gap-2"><p className="text-[13px] font-medium">{t(zone==='amba'?'monday':'tuesday')}</p><span className="rounded-md bg-[#eef5fa] px-2 py-1 text-xs font-medium text-[#54809b]">{zone==='amba'?'AMBA':t('interior')}</span></div><p className="mt-1 text-xs text-[#8596a3]">{financeDisplayDate(date,locale)}</p><div className="my-6 space-y-1">{sums.length?sums.map(([currency,amount])=><p key={currency} className="font-sans text-[32px] leading-tight font-semibold tracking-[-.04em] tabular-nums">{financeMoney(amount,currency,locale)}</p>):<p className="font-sans text-[32px] leading-tight text-slate-300">—</p>}</div><p className="flex items-center gap-2 text-xs text-[#718391]">{t('paymentCalendar')}<ChevronRight className="size-3.5 text-primary transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true"/></p></Link>;
      })}</div><p className="border-t border-[#e9eef3] bg-[#fafcfe] px-5 py-3 text-xs leading-relaxed text-[#7b8e9d]">{t('forecastHint')}</p></section>
      <section className="finance-card overflow-hidden"><header className="flex items-center gap-2.5 border-b border-[#e9eef3] px-5 py-4"><TriangleAlert className="size-4 text-amber-500" aria-hidden="true"/><h2 className="text-sm font-semibold">{t('attention')}</h2></header><div className="px-5 py-2">{alerts.map((alert)=><Link key={alert.label} href={alert.href} className="flex min-h-[57px] items-center gap-3 border-b border-[#eef2f6] last:border-b-0"><span className={`grid size-8 shrink-0 place-items-center rounded-lg text-sm font-semibold tabular-nums ${alert.count?'bg-amber-50 text-amber-700':'bg-[#f3f6f8] text-[#95a5b0]'}`}>{alert.count}</span><span className="flex-1 text-[13px] text-[#647b8c]">{alert.label}</span><ChevronRight className="size-3.5 text-[#a9b8c2]" aria-hidden="true"/></Link>)}
        {missingProofs>0&&<Link href="/finance/cash" className="block py-3 text-xs text-amber-800">{t('missingProofs',{count:missingProofs})}</Link>}{excessReservations>0&&<Link href="/finance/cheques" className="block py-3 text-xs text-amber-800">{t('excessReservations',{count:excessReservations})}</Link>}
      </div></section>
    </div>
    <section className="finance-card flex flex-wrap items-center justify-between gap-4 px-5 py-4"><p className="flex items-center gap-2 text-[13px] font-medium text-[#647b8c]"><SlidersHorizontal className="size-4" aria-hidden="true"/>{t('activityPeriod')}</p><FinancePeriodControls period={period} from={range.from} to={range.to} onChange={change}/></section>
    {range.from>range.to?<p role="alert" className="text-destructive">{t('invalidRange')}</p>:<FinanceMovements data={data} from={range.from} to={range.to}/>}
  </main>;
}

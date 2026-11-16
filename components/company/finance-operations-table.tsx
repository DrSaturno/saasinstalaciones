"use client";
import { useRef,useState } from "react";
import Link from "next/link";
import { useLocale,useTranslations } from "next-intl";
import { ArrowRight,ArrowUpRight,Download,FolderOpen,Paperclip } from "lucide-react";
import type { FinanceFilters } from "@/lib/data/finance-operations";
import { financeDisplayDate,financeMoney,type FinanceTableEntry,type FinanceTableDocument } from "@/lib/domain/finance-presentation";
import { FinanceEntryDetail } from "@/components/company/finance-entry-detail";
import { FinanceStageBadge } from "@/components/company/finance-hint";
import { financeStage } from "@/lib/domain/finance-approval";

function csvCell(value:string|number|null) {
  const raw=String(value??''),safe=/^[=+\-@\t\r]/.test(raw)?`'${raw}`:raw;
  return `"${safe.replaceAll('"','""')}"`;
}
function exportRows(entries:FinanceTableEntry[],headings:string[]) {
  const rows=[headings,...entries.map((entry)=>[entry.orderNumber,entry.partyName,entry.direction,entry.category,entry.installment,entry.zone,entry.description,entry.amount,entry.paid_amount??0,entry.open_amount??entry.amount,entry.currency,entry.due_on,entry.settled_on,entry.status])];
  const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map((row)=>row.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=`finanzas-${new Date().toISOString().slice(0,10)}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function FinanceOperationsTable({entries,exportEntries=entries,documents,filters,today,demo=false,filterAction='/finance/operations',hideFilters=false,initialEntryId}:{initialEntryId?:string;entries:FinanceTableEntry[];exportEntries?:FinanceTableEntry[];documents:FinanceTableDocument[];filters:FinanceFilters;today:string;demo?:boolean;filterAction?:string;hideFilters?:boolean}) {
  const t=useTranslations('FinanceOperations'),v2=useTranslations('FinanceV2'),locale=useLocale();
  // `initialEntryId` abre el detalle directo: así se llega desde el Resumen en un clic (FLX-70).
  const [selection,setSelection]=useState<{id:string;tab:'movement'|'documents'}|null>(initialEntryId?{id:initialEntryId,tab:'movement'}:null);
  const trigger=useRef<HTMLButtonElement|null>(null);
  const selected=entries.find((entry)=>entry.id===selection?.id);
  const byEntry=new Map<string,FinanceTableDocument[]>();for(const file of documents)byEntry.set(file.entry_id,[...(byEntry.get(file.entry_id)??[]),file]);
  return <section className="finance-card overflow-hidden">
    <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div className="flex items-center gap-2.5"><h2 className="text-sm font-semibold">{hideFilters?v2('obligations'):t('entries')}</h2><span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-500">{entries.length}</span></div>
      <div className="flex flex-wrap items-center gap-5 text-xs"><button type="button" onClick={()=>exportRows(exportEntries,[t('orderNumber'),t('party'),t('direction'),t('category'),t('installment'),t('zone'),t('description'),t('amount'),v2('alreadyRecorded'),v2('currentPending'),t('currency'),t('dueOn'),t('actualDate'),t('status')])} className="inline-flex min-h-8 items-center gap-1.5 font-medium text-[#6b7f8f] hover:text-primary"><Download className="size-3.5" aria-hidden="true"/>{v2('exportFiltered',{count:exportEntries.length})}</button><Link href={demo?'/finance-demo?view=cash':'/finance/cash'} className="inline-flex min-h-8 items-center gap-1.5 font-medium text-primary">{v2('cashHistory')}<ArrowUpRight className="size-3.5" aria-hidden="true"/></Link></div>
    </header>
    {!hideFilters&&<form action={filterAction} className="flex flex-wrap gap-2 border-t p-4 text-sm">{demo&&filterAction==='/finance/operations'&&<input type="hidden" name="demo" value="1"/>}
      <input name="q" defaultValue={filters.q??''} aria-label={t('search')} placeholder={t('search')} className="min-w-48 flex-1 rounded-lg border p-2"/>
      <select name="direction" defaultValue={filters.direction??''} aria-label={t('direction')} className="rounded-lg border p-2"><option value="">{t('allDirections')}</option><option value="payable">{t('payable')}</option><option value="receivable">{t('receivable')}</option></select>
      <select name="status" defaultValue={filters.status??''} aria-label={t('status')} className="rounded-lg border p-2"><option value="">{t('allStatuses')}</option>{(['review','approved','settled','void'] as const).map((status)=><option key={status} value={status}>{t(`statuses.${status}`)}</option>)}</select>
      <input name="from" type="date" defaultValue={filters.from??''} aria-label={t('from')} className="rounded-lg border p-2"/><input name="to" type="date" defaultValue={filters.to??''} aria-label={t('to')} className="rounded-lg border p-2"/><button className="finance-button">{t('filter')}</button>
    </form>}
    <div className="overflow-x-auto"><table className="finance-table finance-operations-table min-w-[680px]">
      <thead><tr><th>{v2('dueDate')}</th><th>{v2('partyAndConcept')}</th><th>{t('orderNumber')}</th><th className="text-right">{v2('currentPending')}</th><th>{t('status')}</th><th className="hidden xl:table-cell">{t('documents')}</th>{!demo&&<th><span className="sr-only">{t('actions')}</span></th>}</tr></thead>
      <tbody>{entries.map((entry)=>{
        const files=byEntry.get(entry.id)??[],money=(amount:number)=>financeMoney(amount,entry.currency,locale);
        return <tr key={entry.id}>
          <td data-label={v2('dueDate')} className="whitespace-nowrap text-xs text-[#5f7687]">{financeDisplayDate(entry.status==='settled'?entry.settled_on:entry.due_on,locale)}</td>
          <td className="finance-primary-cell"><p className="font-semibold text-[#25465b]">{entry.partyName}</p><p className="mt-1 max-w-64 truncate text-xs text-[#7c8d9a]" title={entry.description}>{!filters.direction&&<>{t(entry.direction as 'payable'|'receivable')} · </>}{t(`categories.${entry.category}` as 'categories.installation')} · {entry.description||t(`installments.${entry.installment}` as 'installments.total')}</p>{entry.source==='imported'&&<p className="mt-1 text-xs text-amber-800">{t('importedReview')}</p>}</td>
          <td data-label={t('orderNumber')}>{!demo&&entry.order_id?<Link href={`/finance/orders/${entry.order_id}`} className="rounded-md bg-[#f0f5f8] px-2 py-1 font-mono text-xs font-medium text-[#47718b] hover:bg-blue-50">{entry.orderNumber}</Link>:<span className="text-xs text-muted-foreground">{entry.orderNumber??'—'}</span>}</td>
          <td data-label={v2('currentPending')} className="whitespace-nowrap text-right"><p className="font-sans text-[15px] font-semibold tracking-tight tabular-nums">{money(entry.open_amount??(entry.status==='settled'?0:entry.amount))}</p>{!!entry.paid_amount&&<p className="mt-1 text-xs text-muted-foreground">{v2('totalAmount')}: {money(entry.amount)}</p>}</td>
          <td data-label={t('status')}><FinanceStageBadge stage={financeStage(entry,files.some((file)=>file.kind==='invoice'))} direction={entry.direction}/>{!!entry.reserved_amount&&<p className="mt-1 text-xs text-amber-800">{v2('chequeReservedShort')}</p>}{!!entry.credit_amount&&<p className="mt-1 text-xs text-emerald-700">{v2('credit')}: {money(entry.credit_amount)}</p>}</td>
          <td className="hidden xl:table-cell">{demo?<span className="text-xs text-muted-foreground">{v2('fileCount',{count:files.length})}</span>:<button type="button" onClick={(event)=>{trigger.current=event.currentTarget;setSelection({id:entry.id,tab:'documents'});}} aria-label={v2('filesFor',{party:entry.partyName})} className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs hover:bg-slate-100 ${files.length?'text-[#56758b]':'text-slate-400'}`}><Paperclip className="size-3.5" aria-hidden="true"/>{files.length||'—'}</button>}</td>
          {!demo&&<td className="finance-action-cell text-right"><button type="button" onClick={(event)=>{trigger.current=event.currentTarget;setSelection({id:entry.id,tab:'movement'});}} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#e2eaf0] bg-white px-3 text-xs font-medium text-[#3b647e] hover:border-primary/40 hover:bg-blue-50">{v2('manage')}<ArrowRight className="size-3.5" aria-hidden="true"/></button></td>}
        </tr>;
      })}</tbody>
    </table></div>
    {!entries.length&&<div className="p-12 text-center"><FolderOpen className="mx-auto mb-3 size-7 text-slate-300" aria-hidden="true"/><p className="text-sm font-medium text-slate-500">{t('empty')}</p></div>}
    {selected&&selection&&<FinanceEntryDetail key={`${selected.id}:${selection.tab}`} entry={selected} files={byEntry.get(selected.id)??[]} today={today} initialTab={selection.tab} onClose={()=>setSelection(null)} onRestoreFocus={()=>trigger.current?.focus()}/>}
  </section>;
}

import type { FinanceWorkspace } from "@/lib/data/finance-workspace";
import type { SummaryPdfData } from "@/lib/pdf/finance-summary-document";
import { nextFinanceWeekday } from "@/lib/domain/finance-forecast";

export type FinanceSummaryLabels = Pick<SummaryPdfData, 'title' | 'scope' | 'forecastTitle' | 'movementsTitle' | 'empty'> &
  Record<'realized' | 'planned' | 'outgoing' | 'incoming' | 'chequePending' | 'monday' | 'tuesday', string>;

/** The development preview and authenticated PDF use the same financial projection. */
export function buildFinanceSummaryData({workspace,today,from,to,company,locale,labels}: {
  workspace:FinanceWorkspace;today:string;from:string;to:string;company:string;locale:'es'|'pt';labels:FinanceSummaryLabels;
}): SummaryPdfData {
  const money=(n:number,currency:string)=>new Intl.NumberFormat(locale==='pt'?'pt-BR':'es-AR',{style:'currency',currency}).format(n);
  const entries=new Map(workspace.entries.map((e)=>[e.id,e]));
  const checks=new Map(workspace.cheques.map((c)=>[c.id,c]));
  const rows:SummaryPdfData['rows']=[
    ...workspace.transactions.flatMap((tx)=>{const e=entries.get(tx.entry_id);return e?[{id:tx.id,date:tx.occurred_on,party:e.partyName,state:labels.realized+' · '+labels[e.direction==='payable'?'outgoing':'incoming'],amount:money(tx.amount,e.currency)}]:[];}),
    ...workspace.entries.filter((e)=>e.status!=='void'&&e.available_amount>0&&e.due_on).map((e)=>({id:`plan-${e.id}`,date:e.due_on!,party:e.partyName,state:labels.planned+' · '+labels[e.direction==='payable'?'outgoing':'incoming'],amount:money(e.available_amount,e.currency)})),
    ...workspace.allocations.flatMap((a)=>{const e=entries.get(a.entry_id),c=checks.get(a.cheque_id);return e&&c?.status==='pending'?[{id:`${c.id}-${e.id}`,date:c.maturity_on,party:e.partyName,state:labels.chequePending,amount:money(a.amount,c.currency)}]:[];}),
  ].filter((row)=>row.date>=from&&row.date<=to).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
  const forecasts:SummaryPdfData['forecasts']=[];
  for(const zone of ['amba','interior']){
    const date=nextFinanceWeekday(today,zone==='amba'?1:2),sums=new Map<string,number>();
    for(const e of workspace.entries)if(e.direction==='payable'&&e.order_id&&e.status==='approved'&&e.zone===zone&&e.due_on&&e.due_on<=date&&e.open_amount>0&&['installer','coordinator'].includes(e.supplierKind??''))sums.set(e.currency,(sums.get(e.currency)??0)+e.open_amount);
    for(const [currency,amount]of sums)forecasts.push({label:labels[zone==='amba'?'monday':'tuesday'],date,amount:money(amount,currency)});
  }
  return {title:labels.title,company,period:`${from} — ${to}`,scope:labels.scope,forecastTitle:labels.forecastTitle,forecasts,movementsTitle:labels.movementsTitle,rows,empty:labels.empty};
}

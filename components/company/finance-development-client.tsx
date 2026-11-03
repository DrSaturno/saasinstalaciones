"use client";
import { useEffect,useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { FinanceWorkspace } from "@/lib/data/finance-workspace";
import type { Database } from "@/types/database";
import { FinanceActionContext,type FinanceActions } from "@/components/company/finance-action-context";
import { FinancePreviewShell } from "@/components/company/finance-preview-shell";
import { FinanceMovements } from "@/components/company/finance-movements";
import { FinanceSummaryV2 } from "@/components/company/finance-summary-v2";
import { FinancePaymentsV2 } from "@/components/company/finance-payments-v2";
import { FinanceChequeForm } from "@/components/company/finance-cheque-form";
import { FinanceChequeList } from "@/components/company/finance-cheque-list";
import { FinanceQueriesV2 } from "@/components/company/finance-queries-v2";
import { FinanceInvoiceForm } from "@/components/company/finance-invoice-form";
import { FinanceExpenseTemplateForm } from "@/components/company/finance-expense-template-form";
import { FinanceExpenseTemplateList } from "@/components/company/finance-expense-template-list";
import { FinanceSupplierForm } from "@/components/company/finance-supplier-form";
import { financeBusinessDate } from "@/lib/domain/finance-business-date";
type State={data:FinanceWorkspace;templates:Database['public']['Tables']['finance_expense_templates']['Row'][]};
function serialize(input:unknown) {
  if(!(input instanceof FormData))return input;
  return Object.fromEntries([...input.entries()].map(([key,value])=>[key,value instanceof File?{name:value.name,size:value.size,type:value.type}:value]));
}
export function FinanceDevelopmentClient({screen,entry,zone,order}:{screen:string;entry?:string;zone?:string;order?:string}) {
  const t=useTranslations('FinanceV2'),common=useTranslations('Common');const router=useRouter();
  const [state,setState]=useState<State|null>(null);const [error,setError]=useState('');
  useEffect(()=>{const controller=new AbortController();fetch('/api/finance-development',{signal:controller.signal}).then(async(response)=>{
    if(!response.ok)throw new Error('preview_load_failed');return await response.json() as State;
  }).then(setState).catch((err:unknown)=>{if(!controller.signal.aborted)setError(err instanceof Error?err.message:'preview_load_failed');});return()=>controller.abort();},[]);
  async function request(operation:string,...args:unknown[]) {
    try{
      const response=await fetch('/api/finance-development',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,args:args.map(serialize)})});
      const result=await response.json() as State&{error:string|null};if(result.error)return {error:result.error};setState(result);return {error:null};
    }catch{return {error:t('invalidData')};}
  }
  const actions:FinanceActions={
    registerFinanceCheque:(...args)=>request('registerFinanceCheque',...args),changeFinanceCheque:(...args)=>request('changeFinanceCheque',...args),registerFinanceBatch:(...args)=>request('registerFinanceBatch',...args),importExistingFinanceOrders:()=>request('importExistingFinanceOrders'),
    createFinanceSupplier:(...args)=>request('createFinanceSupplier',...args),createFinanceEntry:(...args)=>request('createFinanceEntry',...args),changeFinanceEntryStatus:(...args)=>request('changeFinanceEntryStatus',...args),registerFinanceTransaction:(...args)=>request('registerFinanceTransaction',...args),uploadFinanceDocument:(...args)=>request('uploadFinanceDocument',...args),
    createFinanceExpenseTemplate:(...args)=>request('createFinanceExpenseTemplate',...args),updateFinanceExpenseTemplate:(...args)=>request('updateFinanceExpenseTemplate',...args),generateFinanceExpenseMonth:(...args)=>request('generateFinanceExpenseMonth',...args),registerFinanceInvoice:(...args)=>request('registerFinanceInvoice',...args),markFinanceInvoiceSent:(...args)=>request('markFinanceInvoiceSent',...args),
  };
  if(error)return <p role="alert" className="p-8">{t('unavailableBody')}</p>;
  if(!state)return <p role="status" className="p-8">{common('loading')}</p>;
  const {data,templates}=state;const today=financeBusinessDate(new Date(),'America/Argentina/Buenos_Aires');
  return <FinanceActionContext.Provider value={actions}><FinancePreviewShell screen={screen} onReset={()=>void request('reset')} onClickCapture={(event)=>{
    const anchor=(event.target as HTMLElement).closest('a');if(!anchor)return;
    const url=new URL(anchor.href);if(url.origin!==window.location.origin)return;
    if(url.pathname.startsWith('/api/finance/')){event.preventDefault();window.open('/api/finance-development/document'+(url.pathname==='/api/finance/summary/pdf'?`?summary=1&${url.searchParams}`:''),'_blank','noopener,noreferrer');}
    else if(url.pathname==='/finance'||url.pathname.startsWith('/finance/')){event.preventDefault();const destination=url.pathname.replace('/finance','/finance-preview');if(url.pathname.startsWith('/finance/orders/'))url.searchParams.set('order',url.pathname.split('/').at(-1)??'');router.push(destination+url.search);}
  }}>
    {screen==='summary'&&<FinanceSummaryV2 data={data} today={today}/>}
    {screen==='payments'&&<FinancePaymentsV2 data={data} today={today} direction="payable" zone={zone}/>}
    {screen==='collections'&&<FinancePaymentsV2 data={data} today={today} direction="receivable"/>}
    {screen==='cheques'&&<main className="space-y-5"><h1 className="text-3xl font-bold">{t('cheques')}</h1><p className="text-sm text-muted-foreground">{t('chequesHint')}</p><FinanceChequeForm data={data} today={today} initialEntry={entry}/><FinanceChequeList data={data} today={today}/></main>}
    {screen==='cash'&&<main className="space-y-4"><h1 className="finance-title">{t('cashHistory')}</h1><FinanceMovements data={data} from="0001-01-01" to={today} confirmedOnly/></main>}
    {screen==='queries'&&order&&<p className="mb-4 text-sm text-muted-foreground">{data.orders.find((item)=>item.id===order)?.order_number}</p>}
    {screen==='queries'&&<FinanceQueriesV2 data={data} today={today}/>}
    {screen==='expenses'&&<main className="space-y-5"><h1 className="text-3xl font-bold">{t('fixedTemplates')}</h1><FinanceExpenseTemplateForm suppliers={data.suppliers} month={today.slice(0,7)}/><FinanceExpenseTemplateList templates={templates} supplierNames={Object.fromEntries(data.suppliers.map((s)=>[s.id,s.name]))}/></main>}
    {screen==='suppliers'&&<FinanceSupplierForm installers={data.people.map((p)=>({id:p.id,full_name:p.name}))}/>}
    {screen==='invoices'&&<main className="space-y-5"><h1 className="text-3xl font-bold">{t('manageInvoices')}</h1><FinanceInvoiceForm clients={data.clients} suppliers={data.suppliers} entries={data.entries.filter((e)=>e.status!=='void').map((e)=>({id:e.id,partyId:e.supplier_id??e.client_id??'',direction:e.direction==='payable'?'received':'issued',label:`${e.orderNumber??e.description} · ${e.partyName}`,capacity:e.amount-e.invoices.reduce((sum,i)=>sum+i.allocatedAmount,0),currency:e.currency}))}/>
      {[...new Map(data.entries.flatMap((e)=>e.invoices).map((i)=>[i.id,i])).values()].map((i)=><a key={i.id} href={`/api/finance/invoices/${i.id}/file`} className="block rounded-xl border bg-white p-4 text-primary">{i.invoice_number} · {i.amount.toFixed(2)}</a>)}</main>}
  </FinancePreviewShell></FinanceActionContext.Provider>;
}

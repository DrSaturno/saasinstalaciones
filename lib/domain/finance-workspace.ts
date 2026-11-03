import type { Database } from "@/types/database";
type Table<Name extends keyof Database['public']['Tables']> = Database['public']['Tables'][Name]['Row'];
export type FinanceWorkspaceSource = {
  entries:Database['public']['Views']['finance_entry_balances']['Row'][];
  suppliers:Table<'finance_suppliers'>[]; clients:Pick<Table<'clients'>,'id'|'name'>[];
  orders:Pick<Table<'work_orders'>,'id'|'order_number'|'title'|'project_id'|'site_id'|'status'>[];
  projects:Pick<Table<'projects'>,'id'|'name'|'client_id'>[]; sites:Pick<Table<'sites'>,'id'|'name'>[];
  transactions:Table<'finance_transactions'>[]; cheques:Table<'finance_cheques'>[]; allocations:Table<'finance_cheque_allocations'>[];
  documents:Pick<Table<'finance_documents'>,'id'|'entry_id'|'kind'|'file_name'>[];
  invoiceAllocations:Table<'finance_invoice_allocations'>[];invoices:Pick<Table<'finance_invoices'>,'id'|'invoice_number'|'amount'|'status'>[];
  events:Table<'finance_cheque_events'>[];
  people:{id:string;name:string;roles:string[]}[];
};
export function assembleFinanceWorkspace({entries,suppliers,clients,orders,projects,sites,transactions,cheques,allocations,documents,invoiceAllocations,invoices,events,people}:FinanceWorkspaceSource) {
  const orderMap=new Map(orders.map((row)=>[row.id,row]));
  const supplierMap=new Map(suppliers.map((row)=>[row.id,row]));
  const clientMap=new Map(clients.map((row)=>[row.id,row.name]));
  const projectMap=new Map(projects.map((row)=>[row.id,row]));
  const siteMap=new Map(sites.map((row)=>[row.id,row.name]));
  const invoiceMap=new Map(invoices.map((row)=>[row.id,row]));
  return { suppliers, clients, projects, orders, sites, people, transactions, cheques, allocations, events,
    entries:entries.map((row)=>{
      const order=orderMap.get(row.order_id??"");
      const supplier=supplierMap.get(row.supplier_id??"");
      return {...row,partyName:row.direction==='payable'?supplier?.name??'—':clientMap.get(row.client_id??'')??'—',
        supplierKind:row.category==='coordination'?'coordinator':supplier?.kind??null,installerId:supplier?.installer_id??null,
        projectId:row.project_id??order?.project_id??null,projectName:projectMap.get(row.project_id??order?.project_id??'')?.name??null,
        siteId:order?.site_id??null,siteName:siteMap.get(order?.site_id??'')??null,orderNumber:order?.order_number??null,
        invoices:invoiceAllocations.filter((a)=>a.entry_id===row.id).flatMap((a)=>{
          const invoice=invoiceMap.get(a.invoice_id);return invoice&&invoice.status!=='void'?[{...invoice,allocatedAmount:a.amount,sourceAmount:a.source_amount_at_registration}]:[];
        })};
    }),
    documents:[...documents.map((d)=>({...d,url:`/api/finance/documents/${d.id}`})),...invoiceAllocations.flatMap((a)=>{
      const invoice=invoiceMap.get(a.invoice_id);return invoice&&invoice.status!=='void'?[{id:invoice.id,entry_id:a.entry_id,kind:'invoice',file_name:invoice.invoice_number,url:`/api/finance/invoices/${invoice.id}/file`}]:[];
    })],
  };
}

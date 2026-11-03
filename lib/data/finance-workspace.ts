import "server-only";
import { assembleFinanceWorkspace } from "@/lib/domain/finance-workspace";
import { createClient } from "@/lib/supabase/server";

async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const result = await page(from, from + 999);
    if (result.error) throw new Error("finance_load_failed");
    rows.push(...(result.data ?? []));
    if (!result.data || result.data.length < 1000) return rows;
  }
}

/** Server-only, session/RLS scoped. Current balances are never date-filtered. */
export async function fetchFinanceWorkspace(companyId: string) {
  const db = await createClient();
  const [entries, suppliers, clients, orders, projects, sites, transactions, cheques, allocations, documents, invoiceAllocations, invoices, events, roster, roles] = await Promise.all([
    allRows((a,b) => db.from("finance_entry_balances").select("*").eq("company_id",companyId).order("id").range(a,b)),
    allRows((a,b) => db.from("finance_suppliers").select("*").eq("company_id",companyId).order("id").range(a,b)),
    allRows((a,b) => db.from("clients").select("id,name").eq("company_id",companyId).order("id").range(a,b)),
    allRows((a,b) => db.from("work_orders").select("id,order_number,title,project_id,site_id,status").eq("company_id",companyId).order("id").range(a,b)),
    allRows((a,b) => db.from("projects").select("id,name,client_id").eq("company_id",companyId).order("id").range(a,b)),
    allRows((a,b) => db.from("sites").select("id,name").eq("company_id",companyId).order("id").range(a,b)),
    allRows((a,b) => db.from("finance_transactions").select("*").eq("company_id",companyId).order("id").range(a,b)),
    allRows((a,b) => db.from("finance_cheques").select("*").eq("company_id",companyId).order("id").range(a,b)),
    allRows((a,b) => db.from("finance_cheque_allocations").select("*").eq("company_id",companyId).order("cheque_id").order("entry_id").range(a,b)),
    allRows((a,b) => db.from("finance_documents").select("id,entry_id,kind,file_name").eq("company_id",companyId).order("id").range(a,b)),
    allRows((a,b) => db.from("finance_invoice_allocations").select("*").eq("company_id",companyId).order("invoice_id").order("entry_id").range(a,b)),
    allRows((a,b) => db.from("finance_invoices").select("id,invoice_number,amount,status").eq("company_id",companyId).order("id").range(a,b)),
    allRows((a,b) => db.from("finance_cheque_events").select("*").eq("company_id",companyId).order("id").range(a,b)),
    allRows((a,b) => db.from('company_installers').select('installer_id').eq('company_id',companyId).eq('status','active').order('installer_id').range(a,b)),
    allRows((a,b) => db.from('company_membership_roles').select('user_id,role').eq('company_id',companyId).order('user_id').order('role').range(a,b)),
  ]);
  const people:{id:string;name:string;roles:string[]}[]=[];
  for(let i=0;i<roster.length;i+=100){
    const result=await db.from('profiles').select('id,full_name').in('id',roster.slice(i,i+100).map((r)=>r.installer_id));
    if(result.error)throw new Error('finance_load_failed');
    people.push(...(result.data??[]).map((p)=>({id:p.id,name:p.full_name,roles:roles.filter((r)=>r.user_id===p.id).map((r)=>r.role)})));
  }
  return assembleFinanceWorkspace({entries,suppliers,clients,orders,projects,sites,transactions,cheques,allocations,documents,invoiceAllocations,invoices,events,people});
}

export type FinanceWorkspace = Awaited<ReturnType<typeof fetchFinanceWorkspace>>;
export type WorkspaceEntry = FinanceWorkspace["entries"][number];

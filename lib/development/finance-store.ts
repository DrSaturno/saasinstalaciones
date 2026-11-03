import "server-only";
import type { PGlite } from "@electric-sql/pglite";
import { createFinanceTestDatabase } from "@/scripts/finance-test-database.mjs";
import { assembleFinanceWorkspace,type FinanceWorkspaceSource } from "@/lib/domain/finance-workspace";
import type { Database } from "@/types/database";
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const company=id(1),user=id(2),client=id(3),installer=id(4),project=id(5),site=id(6),vendor=id(7);
let instance:Promise<PGlite>|undefined;
async function seed() {
  const db=await createFinanceTestDatabase();
  await db.query("insert into companies(id,name) values($1,'Empresa de demostración')",[company]);
  await db.query("insert into profiles(id,company_id,role,full_name,is_owner) values($1,$2,'company_manager','Finanzas Demo',false),($3,null,'installer','Equipo Demo',false)",[user,company,installer]);
  await db.query('insert into company_staff_permissions(user_id,company_id,can_manage_finance) values($1,$2,true)',[user,company]);
  await db.query('insert into company_installers(company_id,installer_id) values($1,$2)',[company,installer]);
  await db.query("insert into clients(id,company_id,name) values($1,$2,'Cliente Horizonte Demo')",[client,company]);
  await db.query("insert into projects(id,company_id,client_id,name) values($1,$2,$3,'Renovación de sucursales Demo')",[project,company,client]);
  await db.query("insert into sites(id,company_id,name,zone) values($1,$2,'Sucursal Centro Demo','AMBA')",[site,company]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
  await db.query("insert into work_orders(id,company_id,project_id,site_id,order_number,title,amount,installer_amount,assigned_installer_id,status,finalized_at) values($1,$2,$3,$4,'OT90001','Instalación de cartelería Demo',600000,180000,$5,'finalizada',now()),($6,$2,$3,$4,'OT90002','Montaje de exhibidores Demo',400000,120000,$5,'finalizada',now())",[id(10),company,project,site,installer,id(11)]);
  await db.query("insert into finance_suppliers(id,company_id,name,kind) values($1,$2,'Servicios de oficina Demo','service'),($3,$2,'Sueldo Persona Demo','employee')",[vendor,company,id(8)]);
  await db.exec('set role authenticated');
  await db.query("insert into finance_entries(id,company_id,direction,supplier_id,category,description,amount,currency,due_on,created_by) values($1,$2,'payable',$3,'fixed','Alquiler oficina Demo',250000,'ARS',current_date+7,$4)",[id(20),company,vendor,user]);
  await db.query("insert into finance_expense_templates(id,company_id,supplier_id,category,description,amount,currency,due_day,starts_on,created_by) values($1,$2,$3,'payroll','Sueldo Persona Demo',480000,'ARS',5,date_trunc('month',current_date)::date,$4)",[id(21),company,id(8),user]);
  await db.query("select finance_generate_expense_month(date_trunc('month',current_date)::date)");
  const payables=await db.query<{id:string}>("select id from finance_entries where direction='payable' and order_id is not null");
  for(const entry of payables.rows){
    await db.query("insert into finance_documents(company_id,entry_id,kind,storage_path,file_name,mime_type,size_bytes,uploaded_by) values($1,$2,'invoice',$3,'factura-equipo-demo.pdf','application/pdf',100,$4)",[company,entry.id,`${company}/development/${entry.id}`,user]);
    await db.query("update finance_entries set status='approved',updated_by=$2 where id=$1",[entry.id,user]);
  }
  const receivables=await db.query<{id:string;amount:string}>("select id,amount from finance_entries where direction='receivable' order by id");
  await db.query("select finance_register_invoice($1,$2,'issued',$3,'FC-DEMO-001',current_date,current_date,1000000,'ARS',$4,'factura-cliente-demo.pdf',$5)",[id(30),company,client,`${company}/invoices/${id(30)}`,receivables.rows.map((e)=>({entry_id:e.id,amount:Number(e.amount)}))]);
  return db;
}
async function database(){
  if(process.env.NODE_ENV!=='development')throw new Error('development_only');
  instance??=seed();return instance;
}
export async function resetFinanceDevelopment(){if(instance){const db=await instance;await db.close();}instance=undefined;}
async function rows<T>(db:PGlite,sql:string):Promise<T[]> {
  const result=await db.query(sql);const numeric=new Set(['amount','paid_amount','open_amount','reserved_amount','available_amount','credit_amount','source_amount_at_registration','due_day']);
  return result.rows.map((row)=>Object.fromEntries(Object.entries(row as Record<string,unknown>).map(([key,value])=>[key,
    value instanceof Date?(key.endsWith('_on')||key==='period_month'?value.toISOString().slice(0,10):value.toISOString()):numeric.has(key)&&value!==null?Number(value):value]))) as T[];
}
export async function financeDevelopmentState(){
  const db=await database();
  const source:FinanceWorkspaceSource={
    entries:await rows(db,'select * from finance_entry_balances order by id'),suppliers:await rows(db,'select * from finance_suppliers order by name'),
    clients:await rows(db,'select id,name from clients'),orders:await rows(db,'select id,order_number,title,project_id,site_id,status from work_orders'),projects:await rows(db,'select id,name,client_id from projects'),sites:await rows(db,'select id,name from sites'),
    transactions:await rows(db,'select * from finance_transactions order by created_at'),cheques:await rows(db,'select * from finance_cheques'),allocations:await rows(db,'select * from finance_cheque_allocations'),
    documents:await rows(db,'select id,entry_id,kind,file_name from finance_documents'),invoiceAllocations:await rows(db,'select * from finance_invoice_allocations'),invoices:await rows(db,'select id,invoice_number,amount,status from finance_invoices'),events:await rows(db,'select * from finance_cheque_events'),
    people:[{id:installer,name:'Equipo Demo',roles:['installer']}],
  };
  return {data:assembleFinanceWorkspace(source),templates:await rows<Database['public']['Tables']['finance_expense_templates']['Row']>(db,'select * from finance_expense_templates')};
}
export async function mutateFinanceDevelopment(operation:string,args:unknown[]) {
  const db=await database();const form=(args[0]??{}) as Record<string,unknown>;
  const text=(key:string)=>String(form[key]??'');const amount=(key:string)=>Number(form[key]);
  switch(operation){
    case 'registerFinanceCheque':await db.query('select finance_register_cheque($1,$2)',args);break;
    case 'changeFinanceCheque':await db.query('select finance_change_cheque($1,$2,$3,$4)',args);break;
    case 'registerFinanceBatch':await db.query('select finance_register_payment_batch($1,$2)',args);break;
    case 'importExistingFinanceOrders':await db.query('select finance_import_existing_orders()');break;
    case 'changeFinanceEntryStatus':await db.query('update finance_entries set status=$2,updated_by=$3 where id=$1',[args[0],args[1],user]);break;
    case 'registerFinanceTransaction':await db.query('select finance_register_payment_batch($1,$2)',[text('requestId'),{amount:amount('amount'),method:text('method'),occurred_on:text('occurredOn'),reference:text('reference'),allocations:[{entry_id:text('entryId'),amount:amount('amount'),...(text('proofDocumentId')?{proof_document_id:text('proofDocumentId')}:{})}]}]);break;
    case 'uploadFinanceDocument':{
      const file=form.file as {name?:string;type?:string;size?:number}|undefined;
      await db.query('insert into finance_documents(id,company_id,entry_id,kind,storage_path,file_name,mime_type,size_bytes,uploaded_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[crypto.randomUUID(),company,text('entryId'),text('kind'),`${company}/development/${crypto.randomUUID()}`,file?.name??'comprobante-demo.pdf',file?.type||'application/pdf',Math.max(1,file?.size??1),user]);break;
    }
    case 'createFinanceSupplier':await db.query('insert into finance_suppliers(company_id,name,kind,tax_id,installer_id) values($1,$2,$3,$4,$5)',[company,text('name'),text('kind'),text('taxId'),text('installerId')||null]);break;
    case 'createFinanceEntry':await db.query("insert into finance_entries(company_id,direction,supplier_id,client_id,category,installment,description,amount,currency,due_on,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",[company,text('direction'),text('direction')==='payable'?text('supplierId'):null,text('direction')==='receivable'?text('clientId'):null,text('category'),text('installment')||'total',text('description'),amount('amount'),text('currency'),text('dueOn')||null,user]);break;
    case 'createFinanceExpenseTemplate':await db.query('insert into finance_expense_templates(company_id,supplier_id,category,description,amount,currency,due_day,starts_on,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[company,text('supplierId'),text('category'),text('description'),amount('amount'),text('currency'),amount('dueDay'),text('startsOn'),user]);break;
    case 'updateFinanceExpenseTemplate':await db.query('update finance_expense_templates set description=$2,amount=$3,due_day=$4,active=$5 where id=$1',[text('id'),text('description'),amount('amount'),amount('dueDay'),text('active')==='true']);break;
    case 'generateFinanceExpenseMonth':await db.query('select finance_generate_expense_month($1)',[String(args[0])+'-01']);break;
    case 'markFinanceInvoiceSent':await db.query("update finance_invoices set status='sent' where id=$1",[args[0]]);break;
    case 'registerFinanceInvoice':{
      const allocations=JSON.parse(text('allocations')) as {entry_id:string;amount:number}[];const invoice=crypto.randomUUID();
      await db.query('select finance_register_invoice($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[invoice,company,text('direction'),text('partyId'),text('invoiceNumber'),text('issuedOn'),text('dueOn')||null,allocations.reduce((sum,a)=>sum+Math.round(a.amount*100),0)/100,text('currency'),`${company}/invoices/${invoice}`,'factura-demo.pdf',allocations]);break;
    }
    default:throw new Error('unsupported_development_operation');
  }
  return financeDevelopmentState();
}

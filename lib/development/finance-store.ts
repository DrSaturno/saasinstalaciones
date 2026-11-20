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
  // Instaladores ficticios, para que la demostración se lea como una operación real.
  const team:[string,string][]=[[installer,'Martín Ríos'],[id(40),'Lucía Paredes'],[id(41),'Diego Sosa'],[id(42),'Cuadrilla Cuyo']];
  await db.query("insert into profiles(id,company_id,role,full_name,is_owner) values($1,$2,'company_manager','Finanzas Demo',true)",[user,company]);
  for(const [teamId,name] of team){
    await db.query("insert into profiles(id,company_id,role,full_name,is_owner) values($1,null,'installer',$2,false)",[teamId,name]);
    await db.query('insert into company_installers(company_id,installer_id) values($1,$2)',[company,teamId]);
  }
  await db.query("insert into clients(id,company_id,name) values($1,$2,'Cliente Horizonte Demo')",[client,company]);
  await db.query("insert into projects(id,company_id,client_id,name) values($1,$2,$3,'Renovación de sucursales Demo')",[project,company,client]);
  await db.query("insert into sites(id,company_id,name,zone,city,state) values($1,$2,'Sucursal Centro Demo','AMBA','Lanús','Buenos Aires'),($3,$2,'Sucursal Córdoba Demo','Interior','Córdoba','Córdoba'),($4,$2,'Sucursal Palermo Demo','AMBA','Palermo','Ciudad Autónoma de Buenos Aires'),($5,$2,'Sucursal Quilmes Demo','AMBA','Quilmes','Buenos Aires'),($6,$2,'Sucursal Rosario Demo','Interior','Rosario','Santa Fe'),($7,$2,'Sucursal Mendoza Demo','Interior','Mendoza','Mendoza')",[site,company,id(9),id(50),id(51),id(52),id(53)]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
  // [id, número, título, importe del cliente, importe del instalador, instalador, estado, local]
  const orders:[number,string,string,number,number,string,string,string][]=[
    [10,'OT90001','Instalación de cartelería Demo',600000,180000,installer,'finalizada',site],
    [11,'OT90002','Montaje de exhibidores Demo',400000,120000,installer,'finalizada',site],
    [12,'OT90003','Cartelería sucursal Córdoba Demo',500000,150000,id(41),'finalizada',id(9)],
    [103,'OT90004','Gráfica de vidriera Palermo Demo',350000,95000,id(40),'finalizada',id(50)],
    [104,'OT90005','Vinilo de piso Quilmes Demo',280000,72000,id(40),'finalizada',id(51)],
    [105,'OT90006','Tótem exterior Rosario Demo',720000,210000,id(41),'finalizada',id(52)],
    [106,'OT90007','Señalética Mendoza Demo',460000,138000,id(42),'finalizada',id(53)],
    [107,'OT90008','Cartelería Lanús (retoque) Demo',390000,110000,installer,'finalizada',site],
    // Todavía sin terminar: no aparecen para pagar hasta que Operaciones las finalice.
    [108,'OT90009','Mural interior Córdoba Demo',540000,160000,id(41),'en_proceso',id(9)],
    [109,'OT90010','Gráfica de heladeras Quilmes Demo',300000,85000,id(40),'planificada',id(51)],
  ];
  for(const [n,number,title,amount,installerAmount,assigned,status,siteId] of orders){
    await db.query("insert into work_orders(id,company_id,project_id,site_id,order_number,title,amount,installer_amount,assigned_installer_id,status,finalized_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,case when $10='finalizada' then now() end)",[id(n),company,project,siteId,number,title,amount,installerAmount,assigned,status]);
  }
  await db.query("insert into finance_suppliers(id,company_id,name,kind) values($1,$2,'Servicios de oficina Demo','service'),($3,$2,'Sueldo Persona Demo','employee')",[vendor,company,id(8)]);
  await db.exec('set role authenticated');
  await db.query("insert into finance_entries(id,company_id,direction,supplier_id,category,description,amount,currency,due_on,created_by) values($1,$2,'payable',$3,'fixed','Alquiler oficina Demo',250000,'ARS',current_date+7,$4)",[id(20),company,vendor,user]);
  await db.query("insert into finance_expense_templates(id,company_id,supplier_id,category,description,amount,currency,due_day,starts_on,created_by) values($1,$2,$3,'payroll','Sueldo Persona Demo',480000,'ARS',5,date_trunc('month',current_date)::date,$4)",[id(21),company,id(8),user]);
  await db.query("select finance_generate_expense_month(date_trunc('month',current_date)::date)");
  // Una orden llega ya aprobada y facturada (para recorrer el pago); las otras dos
  // quedan esperando la aprobación del dueño, una en AMBA y otra en el interior.
  const payables=await db.query<{id:string}>("select id from finance_entries where direction='payable' and order_id=$1",[id(10)]);
  for(const entry of payables.rows){
    await db.query("insert into finance_documents(company_id,entry_id,kind,storage_path,file_name,mime_type,size_bytes,uploaded_by) values($1,$2,'invoice',$3,'factura-equipo-demo.pdf','application/pdf',100,$4)",[company,entry.id,`${company}/development/${entry.id}`,user]);
    await db.query("update finance_entries set status='approved',updated_by=$2 where id=$1",[entry.id,user]);
  }
  // OT90008: aprobada pero sin factura todavía, para mostrar la etapa «falta factura».
  await db.query("update finance_entries set status='approved',updated_by=$2 where direction='payable' and order_id=$1",[id(107),user]);
  const receivables=await db.query<{id:string;amount:string}>("select id,amount from finance_entries where direction='receivable' order by id");
  await db.query("select finance_register_invoice($1,$2,'issued',$3,'FC-DEMO-001',current_date,current_date,$6,'ARS',$4,'factura-cliente-demo.pdf',$5)",[id(30),company,client,`${company}/invoices/${id(30)}`,receivables.rows.map((e)=>({entry_id:e.id,amount:Number(e.amount)})),receivables.rows.reduce((sum,e)=>sum+Number(e.amount),0)]);
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
    people:[[installer,'Martín Ríos'],[id(40),'Lucía Paredes'],[id(41),'Diego Sosa'],[id(42),'Cuadrilla Cuyo']].map(([personId,name])=>({id:personId,name,roles:['installer']})),
  };
  return {data:assembleFinanceWorkspace(source),templates:await rows<Database['public']['Tables']['finance_expense_templates']['Row']>(db,'select * from finance_expense_templates')};
}
async function attachProof(db:PGlite,operation:string,type:string,entryId:string,file?:{name?:string;type?:string;size?:number}) {
  await db.query('select finance_attach_operation_proof($1,$2,$3,$4,$5,$6)',[operation,type,`${company}/${entryId}/${crypto.randomUUID()}`,file?.name??'comprobante-demo.pdf',file?.type||'application/pdf',Math.max(1,file?.size??1)]);
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
      // Igual que la app: un comprobante subido a un pago ya registrado se ata a ese movimiento.
      if(['transfer_proof','bank_credit'].includes(text('kind'))){
        const open=await db.query<{id:string;batch_id:string|null;cheque_id:string|null}>('select id,batch_id,cheque_id from finance_transactions where entry_id=$1 and proof_document_id is null order by created_at desc limit 1',[text('entryId')]);
        const tx=open.rows[0];
        if(tx){await attachProof(db,tx.batch_id??tx.cheque_id??tx.id,tx.batch_id?'batch':tx.cheque_id?'cheque':'transaction',text('entryId'),file);break;}
      }
      await db.query('insert into finance_documents(id,company_id,entry_id,kind,storage_path,file_name,mime_type,size_bytes,uploaded_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[crypto.randomUUID(),company,text('entryId'),text('kind'),`${company}/development/${crypto.randomUUID()}`,file?.name??'comprobante-demo.pdf',file?.type||'application/pdf',Math.max(1,file?.size??1),user]);break;
    }
    case 'attachFinanceTransactionProof':await attachProof(db,text('operationId'),text('operationType')||'batch',text('entryId'),form.file as {name?:string;type?:string;size?:number}|undefined);break;
    case 'approveFinancePayables':{
      const items=(args[0] as {entryId:string;amount?:number}[]).map((item)=>({entry_id:item.entryId,...(item.amount===undefined?{}:{amount:item.amount})}));
      await db.query('select finance_approve_payables($1)',[JSON.stringify(items)]);break;
    }
    case 'rejectSupplierInvoice':await db.query('select finance_reject_supplier_invoice($1,$2)',[args[0],args[1]]);break;
    case 'createFinanceExpense':{
      const type=text('type'),concept=text('concept'),payee=text('payee')||concept;
      const found=await db.query<{id:string}>('select id from finance_suppliers where company_id=$1 and lower(name)=lower($2) limit 1',[company,payee]);
      let supplier=found.rows[0]?.id;
      if(!supplier){supplier=crypto.randomUUID();await db.query('insert into finance_suppliers(id,company_id,name,kind) values($1,$2,$3,$4)',[supplier,company,payee,type==='payroll'?'employee':'other']);}
      if(type==='oneoff')await db.query("insert into finance_entries(company_id,direction,supplier_id,category,installment,description,amount,currency,due_on,created_by) values($1,'payable',$2,$3,'total',$4,$5,$6,$7,$8)",[company,supplier,text('category'),concept,amount('amount'),text('currency'),text('dueOn'),user]);
      else{
        await db.query('insert into finance_expense_templates(company_id,supplier_id,category,description,amount,currency,due_day,starts_on,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[company,supplier,type==='payroll'?'payroll':'fixed',concept,amount('amount'),text('currency'),amount('dueDay'),`${text('startMonth')}-01`,user]);
        await db.query("select finance_generate_expense_month(date_trunc('month',current_date)::date)");
      }
      break;
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

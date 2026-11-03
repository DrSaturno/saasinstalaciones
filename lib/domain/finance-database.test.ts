import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createFinanceTestDatabase } from "@/scripts/finance-test-database.mjs";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const company=id(1), otherCompany=id(2), owner=id(3), finance=id(4), admin=id(5), installer=id(6), client=id(7), project=id(8), site=id(9), order=id(10);
let db: PGlite;
async function actAs(user: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
  await db.exec("set role authenticated");
}
async function entry() {
  const result=await db.query<{id:string}>("select id from finance_entries where order_id=$1 and direction='receivable'",[order]);
  return result.rows[0].id;
}
async function cheque(checkId=id(20),amount=500) {
  const payload={direction:"receivable",party_id:client,project_id:project,kind:"electronic",bank:"Banco ficticio",reference:checkId,
    issued_on:"2020-01-01",maturity_on:"2020-01-31",term_days:30,amount,currency:"ARS",allocations:[{entry_id:await entry(),amount}]};
  await db.query("select finance_register_cheque($1,$2)",[checkId,payload]);
  return payload;
}
beforeAll(async()=>{
  db=await createFinanceTestDatabase();
  await db.query("insert into companies(id) values($1),($2)",[company,otherCompany]);
  for(const [user,isOwner] of [[owner,true],[finance,false],[admin,false]] as const)
    await db.query("insert into profiles(id,company_id,role,is_owner) values($1,$2,'company_manager',$3)",[user,company,isOwner]);
  await db.query("insert into profiles(id,role) values($1,'installer')",[installer]);
  await db.query("insert into company_staff_permissions(user_id,company_id,can_manage_finance) values($1,$3,true),($2,$3,false)",[finance,admin,company]);
  await db.query("insert into company_installers(company_id,installer_id) values($1,$2)",[company,installer]);
  await db.query("insert into clients(id,company_id) values($1,$2)",[client,company]);
  await db.query("insert into projects(id,company_id,client_id) values($1,$2,$3)",[project,company,client]);
  await db.query("insert into sites(id,company_id) values($1,$2)",[site,company]);
  await db.query("insert into work_orders(id,company_id,project_id,site_id,order_number,amount,installer_amount,assigned_installer_id) values($1,$2,$3,$4,'OT-TEST',1000,200,$5)",[order,company,project,site,installer]);
},60000);
beforeEach(async()=>{await db.exec("begin");await actAs(finance);});
afterEach(async()=>{await db.exec("rollback; reset role");});
afterAll(async()=>{await db.close();});

describe("Finance PostgreSQL invariants and tenant policies",()=>{
  it("keeps pending cheques out of cash and reserves their allocations",async()=>{
    await cheque();
    expect((await db.query("select count(*)::int n from finance_cash_movements")).rows).toEqual([{n:0}]);
    const row=(await db.query("select open_amount,reserved_amount,available_amount from finance_entry_balances where id=$1",[await entry()])).rows[0];
    expect(row).toEqual({open_amount:"1000.00",reserved_amount:"500.00",available_amount:"500.00"});
  });
  it("retries registration without doubling a cheque or its reservation",async()=>{
    const payload=await cheque();
    await db.query("select finance_register_cheque($1,$2)",[id(20),payload]);
    expect((await db.query("select count(*)::int n from finance_cheques")).rows[0]).toEqual({n:1});
  });
  it("rejects over-reservation against the locked current balance",async()=>{
    await cheque(id(20),700);
    await expect(cheque(id(21),400)).rejects.toThrow("insufficient_available_balance");
  });
  it("does not settle on maturity; explicit confirmation creates cash once",async()=>{
    await cheque();
    await db.query("update finance_entries set status='approved',updated_by=$2 where id=$1",[await entry(),finance]);
    await db.query("select finance_change_cheque($1,'settled','2020-02-03','Acreditación confirmada')",[id(20)]);
    await db.query("select finance_change_cheque($1,'settled','2020-02-03','Acreditación confirmada')",[id(20)]);
    expect((await db.query("select count(*)::int n,sum(amount)::text amount from finance_cash_movements")).rows[0]).toEqual({n:1,amount:"500.00"});
    expect((await db.query("select reserved_amount from finance_entry_balances where id=$1",[await entry()])).rows[0]).toEqual({reserved_amount:"0.00"});
  });
  it("releases rejected cheques without inventing cash",async()=>{
    await cheque();
    await db.query("select finance_change_cheque($1,'rejected','2020-02-03','Sin fondos')",[id(20)]);
    expect((await db.query("select available_amount from finance_entry_balances where id=$1",[await entry()])).rows[0]).toEqual({available_amount:"1000.00"});
    expect((await db.query("select count(*)::int n from finance_cash_movements")).rows[0]).toEqual({n:0});
  });
  it("blocks bypassing the cheque lifecycle with a direct cash insert",async()=>{
    await db.query("update finance_entries set status='approved',updated_by=$2 where id=$1",[await entry(),finance]);
    await expect(db.query("insert into finance_transactions(company_id,entry_id,amount,occurred_on,method,created_by) values($1,$2,100,'2020-01-01','check',$3)",[company,await entry(),finance])).rejects.toThrow(/permission denied/);
  });
  it("forbids cheques to installers at the database boundary",async()=>{
    const supplier=(await db.query<{id:string}>("select id from finance_suppliers where installer_id=$1",[installer])).rows[0].id;
    await expect(db.query("select finance_register_cheque($1,$2)",[id(20),{direction:"payable",party_id:supplier,allocations:[{entry_id:id(12),amount:10}]}])).rejects.toThrow("field_team_transfer_or_cash_only");
  });
  it("admin sees operational prices but cannot see or write Finance",async()=>{
    await cheque(); await actAs(admin);
    expect((await db.query("select auth_can_see_commercials($1) allowed,finance_can_access($1) finance",[company])).rows[0]).toEqual({allowed:true,finance:false});
    for(const table of ["finance_entries","finance_cheques","finance_cheque_allocations","finance_cheque_events","finance_payment_batches","finance_documents","finance_invoices","finance_entry_events"])
      expect((await db.query(`select count(*)::int n from ${table}`)).rows[0]).toEqual({n:0});
    await expect(db.query("select finance_import_existing_orders()")).rejects.toThrow("finance_denied");
  });
  it("an employee cannot promote their own profile",async()=>{
    await actAs(admin);
    await expect(db.query("update profiles set is_owner=true where id=$1",[admin])).rejects.toThrow("profile_identity_immutable");
  });
  it("cannot use a different company even when the user has Finance",async()=>{
    expect((await db.query("select finance_can_access($1) allowed",[otherCompany])).rows[0]).toEqual({allowed:false});
    await expect(db.query("insert into finance_suppliers(company_id,name) values($1,'Cross tenant')",[otherCompany])).rejects.toThrow(/row-level security/);
  });
  it("updates OT values after a partial payment and records credit after a reduction",async()=>{
    const eid=await entry();
    await db.query("update finance_entries set status='approved',updated_by=$2 where id=$1",[eid,finance]);
    await db.query("select finance_register_payment_batch($1,$2)",[id(30),{method:"transfer",occurred_on:"2020-01-01",amount:300,allocations:[{entry_id:eid,amount:300}]}]);
    await db.exec("reset role");
    await db.query("update work_orders set amount=1200 where id=$1",[order]);
    await actAs(finance);
    expect((await db.query("select open_amount from finance_entry_balances where id=$1",[eid])).rows[0]).toEqual({open_amount:"900.00"});
    await db.exec("reset role"); await db.query("update work_orders set amount=200 where id=$1",[order]); await actAs(finance);
    expect((await db.query("select open_amount,credit_amount from finance_entry_balances where id=$1",[eid])).rows[0]).toEqual({open_amount:"0.00",credit_amount:"100.00"});
    expect((await db.query("select old_amount,new_amount from finance_entry_events where entry_id=$1 and old_amount=1200",[eid])).rows[0]).toEqual({old_amount:"1200.00",new_amount:"200.00"});
  });
  it("freezes a partially paid current month but updates unpaid months and clamps due days",async()=>{
    await db.exec('reset role');
    await db.query("insert into finance_suppliers(id,company_id,name,kind) values($1,$2,'Synthetic payroll','other')",[id(40),company]);
    await actAs(finance);
    const month=(await db.query<{month_value:string}>("select to_char(current_date,'YYYY-MM-01') as month_value")).rows[0].month_value;
    await db.query("insert into finance_expense_templates(id,company_id,supplier_id,category,description,amount,currency,due_day,starts_on,created_by) values($1,$2,$3,'fixed','Synthetic salary',1000,'ARS',31,$4,$5)",[id(41),company,id(40),month,finance]);
    await db.query('select finance_generate_expense_month($1)',[month]);
    await db.query("select finance_generate_expense_month(($1::date+interval '1 month')::date)",[month]);
    await db.query("update finance_entries set status='approved',updated_by=$2 where template_id=$1",[id(41),finance]);
    const current=(await db.query<{id:string}>('select id from finance_entries where template_id=$1 and period_month=$2',[id(41),month])).rows[0].id;
    await db.query('select finance_register_payment_batch($1,$2)',[id(42),{method:'cash',amount:200,occurred_on:month,allocations:[{entry_id:current,amount:200}]}]);
    await db.query('update finance_expense_templates set amount=1200,due_day=30 where id=$1',[id(41)]);
    const rows=(await db.query<{amount:string;period_month:string;due_on:string}>('select amount,period_month::text,due_on::text from finance_entries where template_id=$1 order by period_month',[id(41)])).rows;
    expect(rows.map((r)=>r.amount)).toEqual(['1000.00','1200.00']);
    expect(rows[0].period_month).toBe(month);
  });
  it("admin can create coordinator costs on an OT without Finance access",async()=>{
    await actAs(admin);
    await db.query("insert into order_financial_costs(id,company_id,order_id,payee_id,category,description,amount,created_by,updated_by) values($1,$2,$3,$4,'coordination','Synthetic coordination',80,$5,$5)",[id(45),company,order,installer,admin]);
    expect((await db.query('select count(*)::int n from order_financial_costs')).rows[0]).toEqual({n:1});
    expect((await db.query('select count(*)::int n from finance_entries')).rows[0]).toEqual({n:0});
    await actAs(finance);
    expect((await db.query("select amount from finance_entries where source_key=$1",[`order-cost:${id(45)}`])).rows[0]).toEqual({amount:'80.00'});
  });
  it("source synchronization remains idempotent after full settlement",async()=>{
    const eid=await entry();
    await db.query("update finance_entries set status='approved',updated_by=$2 where id=$1",[eid,finance]);
    await db.query("select finance_register_payment_batch($1,$2)",[id(46),{method:'transfer',amount:1000,occurred_on:'2020-01-01',allocations:[{entry_id:eid,amount:1000}]}]);
    await db.query('select finance_import_existing_orders()');
    await db.query('select finance_import_existing_orders()');
    expect((await db.query("select count(*)::int n from finance_entries where direction='receivable' and order_id=$1",[order])).rows[0]).toEqual({n:1});
  });
  it("allows a client advance before completion without creating extra debt",async()=>{
    const eid=await entry();
    await db.query('select finance_register_payment_batch($1,$2)',[id(47),{method:'transfer',installment:'advance',amount:300,occurred_on:'2020-01-01',allocations:[{entry_id:eid,amount:300}]}]);
    expect((await db.query('select open_amount from finance_entry_balances where id=$1',[eid])).rows[0]).toEqual({open_amount:'700.00'});
    expect((await db.query("select count(*)::int n from finance_entries where direction='receivable' and order_id=$1",[order])).rows[0]).toEqual({n:1});
  });
  it("bills a project contract once, without also charging its OTs",async()=>{
    await db.exec('reset role');
    await db.query("insert into projects(id,company_id,client_id,billing_mode,contract_amount) values($1,$2,$3,'project',5000)",[id(60),company,client]);
    await db.query("insert into work_orders(id,company_id,project_id,site_id,amount) values($1,$2,$3,$4,3000),($5,$2,$3,$4,2000)",[id(61),company,id(60),site,id(62)]);
    await actAs(finance);
    await db.query('select finance_import_existing_orders()');
    expect((await db.query("select count(*)::int n,sum(amount)::text amount from finance_entries where project_id=$1 and direction='receivable'",[id(60)])).rows[0]).toEqual({n:1,amount:'5000.00'});
  });
  it("links one transfer receipt to two OTs without duplicating the stored file or cash",async()=>{
    await db.exec('reset role');await db.query("insert into work_orders(id,company_id,project_id,site_id,amount) values($1,$2,$3,$4,500)",[id(70),company,project,site]);await actAs(finance);
    const ids=(await db.query<{id:string}>('select id from finance_entries where direction=\'receivable\' order by amount desc')).rows.map((r)=>r.id);
    await db.query("update finance_entries set status='approved',updated_by=$1 where direction='receivable'",[finance]);
    await db.query('select finance_register_payment_batch($1,$2)',[id(71),{method:'transfer',amount:500,occurred_on:'2020-01-01',allocations:[{entry_id:ids[0],amount:300},{entry_id:ids[1],amount:200}]}]);
    const path=`${company}/${ids[0]}/${id(72)}`;
    await db.query("select finance_attach_operation_proof($1,'batch',$2,'recibo-demo.pdf','application/pdf',100)",[id(71),path]);
    expect((await db.query('select count(*)::int n,count(distinct storage_path)::int files from finance_documents')).rows[0]).toEqual({n:2,files:1});
    expect((await db.query('select count(proof_document_id)::int proofs,sum(amount)::text amount from finance_transactions')).rows[0]).toEqual({proofs:2,amount:'500.00'});
  });
  it("keeps multi-OT invoices immutable and records the source amount for discrepancy alerts",async()=>{
    const eid=await entry(),invoice=id(73);
    await db.query("select finance_register_invoice($1,$2,'issued',$3,'DEMO-73','2020-01-01',null,1000,'ARS',$4,'factura-demo.pdf',$5)",[invoice,company,client,`${company}/invoices/${invoice}`,[{entry_id:eid,amount:1000}]]);
    expect((await db.query('select source_amount_at_registration from finance_invoice_allocations where invoice_id=$1',[invoice])).rows[0]).toEqual({source_amount_at_registration:'1000.00'});
    await expect(db.query('update finance_invoices set amount=900 where id=$1',[invoice])).rejects.toThrow();
  });
  it("a suspended company loses Finance access at the database boundary",async()=>{
    await db.exec('reset role');await db.query("update companies set status='suspended' where id=$1",[company]);await actAs(finance);
    expect((await db.query('select finance_can_access($1) allowed',[company])).rows[0]).toEqual({allowed:false});
    expect((await db.query('select count(*)::int n from finance_entries')).rows[0]).toEqual({n:0});
  });
});

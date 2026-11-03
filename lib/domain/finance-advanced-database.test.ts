import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createFinanceTestDatabase } from "@/scripts/finance-test-database.mjs";
const id=(n:number)=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let db:PGlite;
const company=id(1),finance=id(2),admin=id(3),person=id(4),client=id(5),project=id(6),site=id(7),order=id(8),helper=id(9);
async function login(user:string){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');}
beforeAll(async()=>{
  db=await createFinanceTestDatabase({advanced:true});
  await db.query('insert into companies(id) values($1)',[company]);
  for(const user of [finance,admin])await db.query("insert into profiles(id,company_id,role,is_owner) values($1,$2,'company_manager',false)",[user,company]);
  await db.query('insert into company_staff_permissions(user_id,company_id,can_manage_finance) values($1,$3,true),($2,$3,false)',[finance,admin,company]);
  for(const user of [person,helper]){await db.query("insert into profiles(id,role) values($1,'installer')",[user]);await db.query('insert into company_installers(company_id,installer_id) values($1,$2)',[company,user]);}
  await db.query('insert into clients(id,company_id) values($1,$2)',[client,company]);
  await db.query('insert into projects(id,company_id,client_id) values($1,$2,$3)',[project,company,client]);
  await db.query('insert into sites(id,company_id) values($1,$2)',[site,company]);
  await db.query('insert into work_orders(id,company_id,project_id,site_id,amount,installer_amount,assigned_installer_id) values($1,$2,$3,$4,null,100,$5)',[order,company,project,site,person]);
},60000);
beforeEach(async()=>{await db.exec('begin');await login(finance);});
afterEach(async()=>{await db.exec('rollback;reset role');});afterAll(async()=>{await db.close();});
describe('existing private-pricing / multi-installer schema',()=>{
  it('reads private OT prices and synchronizes edits made by Administration',async()=>{
    await login(admin);await db.query('insert into work_order_pricing(order_id,company_id,amount) values($1,$2,1000)',[order,company]);
    expect((await db.query('select count(*)::int n from finance_entries')).rows[0]).toEqual({n:0});
    await login(finance);
    expect((await db.query("select amount from finance_entries where direction='receivable' and order_id=$1",[order])).rows[0]).toEqual({amount:'1000.00'});
    await login(admin);await db.query('update work_order_pricing set amount=1200 where order_id=$1',[order]);await login(finance);
    expect((await db.query('select finance_order_commercial_amount($1)::text amount',[order])).rows[0]).toEqual({amount:'1200.00'});
    expect((await db.query("select amount from finance_entries where direction='receivable' and order_id=$1",[order])).rows[0]).toEqual({amount:'1200.00'});
  });
  it('bills a private project contract once while legacy columns remain NULL',async()=>{
    await db.exec('reset role');await db.query("insert into projects(id,company_id,client_id,billing_mode,contract_amount) values($1,$2,$3,'project',null)",[id(20),company,client]);
    await login(admin);await db.query('insert into project_pricing(project_id,company_id,contract_amount) values($1,$2,5000)',[id(20),company]);await login(finance);
    await db.query('select finance_import_existing_orders()');await db.query('select finance_import_existing_orders()');
    expect((await db.query("select count(*)::int n,sum(amount)::text amount from finance_entries where project_id=$1 and direction='receivable'",[id(20)])).rows[0]).toEqual({n:1,amount:'5000.00'});
  });
  it('brings helper costs in once and keeps them separate from the lead',async()=>{
    await login(admin);await db.query('insert into work_order_team_members(id,company_id,order_id,installer_id,installer_amount) values($1,$2,$3,$4,80)',[id(30),company,order,helper]);await login(finance);
    await db.query('select finance_import_existing_orders()');
    expect((await db.query("select count(*)::int n,sum(amount)::text amount from finance_entries where order_id=$1 and direction='payable'",[order])).rows[0]).toEqual({n:2,amount:'180.00'});
    await login(admin);await db.query('update work_order_team_members set installer_amount=90 where id=$1',[id(30)]);await login(finance);
    expect((await db.query("select amount from finance_entries where source_key=$1",[`order-helper:${id(30)}`])).rows[0]).toEqual({amount:'90.00'});
  });
  it('does not expose a private price through the Finance RPC to Administration',async()=>{
    await login(admin);await expect(db.query('select finance_order_commercial_amount($1)',[order])).rejects.toThrow('finance_denied');
  });
});

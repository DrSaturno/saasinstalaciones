import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createFinanceTestDatabase } from "@/scripts/finance-test-database.mjs";

// Circuito semanal (docs/specs/2026-11-13-finanzas-flujo-semanal): aprueba el
// dueño, factura el proveedor, recién ahí se paga. Datos sintéticos en memoria.
const id = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const company = id(1), owner = id(2), finance = id(3), installer = id(4), other = id(5), client = id(6),
  project = id(7), siteAmba = id(8), siteInterior = id(9), order = id(10), orderInterior = id(11), general = id(12);
let db: PGlite;

async function actAs(user: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated");
}
async function asSystem() { await db.exec("reset role"); }
async function payable(orderId = order) {
  await asSystem();
  return (await db.query<{ id: string }>(
    "select id from finance_entries where order_id=$1 and direction='payable'", [orderId])).rows[0].id;
}
async function finish(orderId = order) {
  await asSystem();
  await db.query("update work_orders set status='finalizada' where id=$1", [orderId]);
}
const invoicePath = (who: string, invoice: string) => `${company}/supplier-invoices/${who}/${invoice}`;
async function submitInvoice(who: string, invoice: string, amount: number, entries: string[], number = "A-0001") {
  await actAs(who);
  return db.query("select finance_submit_my_invoice($1,$2,$3,current_date,$4,$5,'factura.pdf',$6)",
    [invoice, company, number, amount, invoicePath(who, invoice), entries]);
}
const pay = (entryId: string, amount: number, batch = id(50)) => db.query(
  "select finance_register_payment_batch($1,$2)",
  [batch, { method: "transfer", amount, occurred_on: "2020-01-06", allocations: [{ entry_id: entryId, amount }] }]);
const approve = (items: { entry_id: string; amount?: number }[]) =>
  db.query<{ out: { entry_id: string; installer_id: string; amount: number }[] }>(
    "select finance_approve_payables($1) out", [JSON.stringify(items)]);

beforeAll(async () => {
  db = await createFinanceTestDatabase();
  await db.query("insert into companies(id) values($1)", [company]);
  await db.query("insert into profiles(id,company_id,role,is_owner) values($1,$3,'company_manager',true),($2,$3,'company_manager',false)", [owner, finance, company]);
  await db.query("insert into company_staff_permissions(user_id,company_id,can_manage_finance) values($1,$2,true)", [finance, company]);
  for (const user of [installer, other]) {
    await db.query("insert into profiles(id,role) values($1,'installer')", [user]);
    await db.query("insert into company_installers(company_id,installer_id) values($1,$2)", [company, user]);
  }
  await db.query("insert into clients(id,company_id) values($1,$2)", [client, company]);
  await db.query("insert into projects(id,company_id,client_id) values($1,$2,$3)", [project, company, client]);
  await db.query("insert into sites(id,company_id,zone,state,city) values($1,$3,'Buenos Aires','Buenos Aires','Quilmes'),($2,$3,'Santa Fe','Santa Fe','Rosario')", [siteAmba, siteInterior, company]);
  await db.query("insert into work_orders(id,company_id,project_id,site_id,order_number,amount,installer_amount,assigned_installer_id) values($1,$2,$3,$4,'OT-AMBA',1000,200,$5)", [order, company, project, siteAmba, installer]);
  await db.query("insert into work_orders(id,company_id,project_id,site_id,order_number,amount,installer_amount,assigned_installer_id) values($1,$2,$3,$4,'OT-INT',null,300,$5)", [orderInterior, company, project, siteInterior, other]);
  await db.query("insert into finance_suppliers(id,company_id,name,kind) values($1,$2,'Alquiler oficina','other')", [general, company]);
}, 60000);
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback; reset role"); });
afterAll(async () => { await db.close(); });

describe("zona de pago", () => {
  it("clasifica AMBA por provincia y ciudad, no por el texto AMBA", async () => {
    const zone = async (state: string, city: string, z: string) =>
      (await db.query<{ zone: string }>("select finance_classify_zone($1,$2,$3) zone", [state, city, z])).rows[0].zone;
    expect(await zone("Buenos Aires", "Quilmes", "Buenos Aires")).toBe("amba");
    expect(await zone("Buenos Aires", "MARTÍNEZ", "")).toBe("amba");
    expect(await zone("Ciudad Autónoma de Buenos Aires", "", "")).toBe("amba");
    expect(await zone("Buenos Aires", "CAPITAL FEDERAL", "Buenos Aires")).toBe("amba");
    expect(await zone("", "", "AMBA")).toBe("amba");
    expect(await zone("Buenos Aires", "Mar del Plata", "Buenos Aires")).toBe("interior");
    expect(await zone("Buenos Aires", "San Nicolás", "Buenos Aires")).toBe("interior");
    expect(await zone("Buenos Aires", "", "Buenos Aires")).toBe("interior");
    expect(await zone("Mendoza", "San Martín", "Mendoza")).toBe("interior");
  });
  it("cada pago de OT toma la zona de su local", async () => {
    const rows = (await db.query("select w.order_number,e.zone from finance_entries e join work_orders w on w.id=e.order_id where e.direction='payable' order by 1")).rows;
    expect(rows).toEqual([{ order_number: "OT-AMBA", zone: "amba" }, { order_number: "OT-INT", zone: "interior" }]);
  });
});

describe("fecha de finalización", () => {
  it("se sella al finalizar, fija el vencimiento y se borra al reabrir", async () => {
    await finish();
    const done = (await db.query<{ stamped: boolean; due: boolean }>(
      "select w.finalized_at is not null stamped, e.due_on is not null due from work_orders w join finance_entries e on e.order_id=w.id and e.direction='payable' where w.id=$1", [order])).rows[0];
    expect(done).toEqual({ stamped: true, due: true });
    await db.query("update work_orders set status='en_proceso' where id=$1", [order]);
    expect((await db.query("select finalized_at from work_orders where id=$1", [order])).rows[0]).toEqual({ finalized_at: null });
  });
});

describe("aprobación", () => {
  it("Finanzas no aprueba un pago con una escritura directa", async () => {
    const entry = await payable(); await finish(); await actAs(finance);
    await expect(db.query("update finance_entries set status='approved',updated_by=$2 where id=$1", [entry, finance])).rejects.toThrow("approval_owner_only");
  });
  it("Finanzas tampoco aprueba por la función de lote", async () => {
    const entry = await payable(); await finish(); await actAs(finance);
    await expect(approve([{ entry_id: entry }])).rejects.toThrow("approval_owner_only");
  });
  it("no aprueba el pago de una OT sin terminar", async () => {
    const entry = await payable(orderInterior); await actAs(owner);
    await expect(approve([{ entry_id: entry }])).rejects.toThrow("order_completion_required");
  });
  it("el monto corregido vuelve a la OT y queda en el historial", async () => {
    const entry = await payable(); await finish(); await actAs(owner);
    const result = (await approve([{ entry_id: entry, amount: 250 }])).rows[0].out;
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ entry_id: entry, installer_id: installer, amount: 250 });
    await asSystem();
    expect((await db.query("select installer_amount::text amount from work_orders where id=$1", [order])).rows[0]).toEqual({ amount: "250.00" });
    expect((await db.query("select amount::text,status from finance_entries where id=$1", [entry])).rows[0]).toEqual({ amount: "250.00", status: "approved" });
    expect((await db.query("select old_amount::text,new_amount::text from finance_entry_events where entry_id=$1 and old_amount is not null and old_amount<>new_amount", [entry])).rows)
      .toEqual([{ old_amount: "200.00", new_amount: "250.00" }]);
  });
  it("un gasto fijo se aprueba y se paga sin factura", async () => {
    await actAs(finance);
    await db.query("insert into finance_entries(id,company_id,direction,supplier_id,category,installment,description,amount,currency,due_on,created_by) values($1,$2,'payable',$3,'fixed','total','Alquiler',500,'ARS','2020-01-10',$4)", [id(60), company, general, finance]);
    await actAs(owner);
    expect((await approve([{ entry_id: id(60) }])).rows[0].out).toEqual([]);
    await actAs(finance);
    await pay(id(60), 500);
    expect((await db.query("select status from finance_entries where id=$1", [id(60)])).rows[0]).toEqual({ status: "settled" });
  });
});

describe("corregir el importe al aprobar", () => {
  it("el dueño corrige un gasto puntual y uno de plantilla; los importados no se pueden", async () => {
    await actAs(finance);
    await db.query("insert into finance_entries(id,company_id,direction,supplier_id,category,installment,description,amount,currency,due_on,created_by) values($1,$2,'payable',$3,'fixed','total','Alquiler',500,'ARS','2020-01-10',$4)", [id(61), company, general, finance]);
    await asSystem();
    await db.query("insert into finance_entries(id,company_id,direction,supplier_id,category,installment,description,amount,currency,source,source_key) values($1,$2,'payable',$3,'fixed','total','Histórico',300,'ARS','imported','h-1')", [id(62), company, general]);
    await actAs(owner);
    await approve([{ entry_id: id(61), amount: 650.5 }]);
    expect((await db.query("select amount::text,status from finance_entries where id=$1", [id(61)])).rows[0]).toEqual({ amount: "650.50", status: "approved" });
    expect((await db.query("select old_amount::text,new_amount::text from finance_entry_events where entry_id=$1 and old_amount is not null and old_amount<>new_amount", [id(61)])).rows)
      .toEqual([{ old_amount: "500.00", new_amount: "650.50" }]);
    await expect(approve([{ entry_id: id(62), amount: 10 }])).rejects.toThrow("amount_change_requires_source");
  });
  it("una plantilla: el cambio vale para ese mes y el resto de los meses conserva su importe", async () => {
    await actAs(finance);
    const month = (await db.query<{ m: string }>("select to_char(current_date,'YYYY-MM-01') m")).rows[0].m;
    await db.query("insert into finance_expense_templates(id,company_id,supplier_id,category,description,amount,currency,due_day,starts_on,created_by) values($1,$2,$3,'fixed','Internet',1000,'ARS',10,$4,$5)", [id(63), company, general, month, finance]);
    await db.query("select finance_generate_expense_month($1)", [month]);
    await db.query("select finance_generate_expense_month(($1::date+interval '1 month')::date)", [month]);
    const current = (await db.query<{ id: string }>("select id from finance_entries where template_id=$1 and period_month=$2", [id(63), month])).rows[0].id;
    await actAs(owner);
    await approve([{ entry_id: current, amount: 1200 }]);
    expect((await db.query<{ amount: string }>("select period_month::text,amount::text from finance_entries where template_id=$1 order by period_month", [id(63)])).rows.map((row) => row.amount)).toEqual(["1200.00", "1000.00"]);
  });
});

describe("factura del proveedor y pago", () => {
  async function approved() {
    const entry = await payable(); await finish(); await actAs(owner);
    await approve([{ entry_id: entry }]);
    return entry;
  }
  it("sin factura no se paga", async () => {
    const entry = await approved(); await actAs(finance);
    await expect(pay(entry, 200)).rejects.toThrow("invoice_required_to_pay");
  });
  it("con la factura del instalador se paga y queda saldado", async () => {
    const entry = await approved();
    await submitInvoice(installer, id(70), 200, [entry]);
    await actAs(finance);
    await pay(entry, 200);
    expect((await db.query("select status from finance_entries where id=$1", [entry])).rows[0]).toEqual({ status: "settled" });
  });
  it("la factura tiene que coincidir con lo aprobado", async () => {
    const entry = await approved();
    await expect(submitInvoice(installer, id(71), 199, [entry])).rejects.toThrow("invoice_amount_mismatch");
  });
  it("nadie factura el pago de otra persona", async () => {
    const entry = await approved();
    await expect(submitInvoice(other, id(72), 200, [entry])).rejects.toThrow("entry_not_billable");
  });
  it("no acepta un archivo fuera de la carpeta propia", async () => {
    const entry = await approved(); await actAs(installer);
    await expect(db.query("select finance_submit_my_invoice($1,$2,'A-9',current_date,200,$3,'f.pdf',$4)",
      [id(73), company, invoicePath(other, id(73)), [entry]])).rejects.toThrow("invoice_file_scope");
  });
  it("el instalador ve sólo lo suyo y nada del libro", async () => {
    const entry = await approved();
    await actAs(installer);
    expect((await db.query("select count(*)::int n from finance_entries")).rows[0]).toEqual({ n: 0 });
    const mine = (await db.query<{ list: { entry_id: string; amount: number; invoice: unknown }[] }>("select finance_my_billing() list")).rows[0].list;
    expect(mine.map((row) => row.entry_id)).toEqual([entry]);
    expect(mine[0]).toMatchObject({ amount: 200, invoice: null });
    await actAs(other);
    expect((await db.query<{ list: unknown[] }>("select finance_my_billing() list")).rows[0].list).toEqual([]);
  });
  it("Finanzas devuelve una factura mal cargada y el número se puede reutilizar", async () => {
    const entry = await approved();
    await submitInvoice(installer, id(74), 200, [entry], "B-7");
    await actAs(finance);
    await db.query("select finance_reject_supplier_invoice($1,'Archivo equivocado')", [id(74)]);
    await actAs(installer);
    expect((await db.query<{ list: { invoice: unknown }[] }>("select finance_my_billing() list")).rows[0].list[0].invoice).toBeNull();
    await submitInvoice(installer, id(75), 200, [entry], "B-7");
    await actAs(finance); await pay(entry, 200);
    await expect(db.query("select finance_reject_supplier_invoice($1,'Tarde')", [id(75)])).rejects.toThrow("invoice_has_payments");
  });
});

describe("cobros", () => {
  it("el cobro no se cierra sin factura emitida y se cierra solo al registrarla", async () => {
    await asSystem();
    const entry = (await db.query<{ id: string }>("select id from finance_entries where order_id=$1 and direction='receivable'", [order])).rows[0].id;
    await actAs(finance);
    await db.query("update finance_entries set status='approved',updated_by=$2 where id=$1", [entry, finance]);
    await db.query("select finance_register_payment_batch($1,$2)", [id(80), { method: "transfer", amount: 1000, occurred_on: "2020-01-06", allocations: [{ entry_id: entry, amount: 1000 }] }]);
    expect((await db.query("select status,open_amount::text from finance_entry_balances where id=$1", [entry])).rows[0]).toEqual({ status: "approved", open_amount: "0.00" });
    await db.query("select finance_register_invoice($1,$2,'issued',$3,'F-1','2020-01-05',null,1000,'ARS',$4,'f.pdf',$5)",
      [id(81), company, client, `${company}/invoices/${id(81)}`, JSON.stringify([{ entry_id: entry, amount: 1000 }])]);
    expect((await db.query("select status from finance_entries where id=$1", [entry])).rows[0]).toEqual({ status: "settled" });
  });
});

describe("aviso del domingo", () => {
  it("lista lo abierto de cada empresa con su zona, sólo si hay casilla", async () => {
    await asSystem();
    expect((await db.query("select count(*)::int n from finance_weekly_digest()")).rows[0]).toEqual({ n: 0 });
    // Configurado para «ahora»: el aviso toca en la hora local de la empresa.
    await db.query("insert into finance_payment_rules(company_id,digest_email,digest_weekday,digest_hour) values($1,'aviso@example.test',extract(isodow from now() at time zone 'America/Argentina/Buenos_Aires'),extract(hour from now() at time zone 'America/Argentina/Buenos_Aires'))", [company]);
    await finish();
    const row = (await db.query<{ recipient: string; payload: { entries: { zone: string; order_number: string; order_finished: boolean; has_invoice: boolean }[] } }>(
      "select recipient,payload from finance_weekly_digest()")).rows[0];
    expect(row.recipient).toBe("aviso@example.test");
    expect(row.payload.entries.map((e) => [e.order_number, e.zone, e.order_finished, e.has_invoice])).toEqual([
      ["OT-AMBA", "amba", true, false], ["OT-INT", "interior", false, false]]);
  });
  it("respeta el día y la hora configurados, y no se repite una vez enviado", async () => {
    await asSystem();
    await db.query("insert into finance_payment_rules(company_id,digest_email,digest_weekday,digest_hour) values($1,'aviso@example.test',extract(isodow from now() at time zone 'America/Argentina/Buenos_Aires'),extract(hour from now() at time zone 'America/Argentina/Buenos_Aires'))", [company]);
    expect((await db.query("select count(*)::int n from finance_weekly_digest()")).rows[0]).toEqual({ n: 1 });
    await db.query("select finance_mark_digest_sent($1)", [company]);
    expect((await db.query("select count(*)::int n from finance_weekly_digest()")).rows[0]).toEqual({ n: 0 });
    // Otro día de la semana: tampoco toca.
    await db.query("update finance_payment_rules set digest_last_sent_at=null, digest_weekday=((digest_weekday+2)%7)+1 where company_id=$1", [company]);
    expect((await db.query("select count(*)::int n from finance_weekly_digest()")).rows[0]).toEqual({ n: 0 });
    // Apagado: no manda aunque sea la hora.
    await db.query("update finance_payment_rules set digest_weekday=extract(isodow from now() at time zone 'America/Argentina/Buenos_Aires'), digest_enabled=false where company_id=$1", [company]);
    expect((await db.query("select count(*)::int n from finance_weekly_digest()")).rows[0]).toEqual({ n: 0 });
  });
  it("sólo el dueño ve la vista previa del aviso", async () => {
    await actAs(owner);
    const preview = (await db.query<{ p: { company_name: string; payload: { entries: unknown[] } } }>("select finance_digest_preview() p")).rows[0].p;
    expect(preview.payload.entries.length).toBeGreaterThan(0);
    await actAs(finance);
    await expect(db.query("select finance_digest_preview()")).rejects.toThrow("approval_owner_only");
  });
  it("un usuario con sesión no puede pedir el aviso", async () => {
    await actAs(owner);
    await expect(db.query("select * from finance_weekly_digest()")).rejects.toThrow(/permission denied/);
  });
});

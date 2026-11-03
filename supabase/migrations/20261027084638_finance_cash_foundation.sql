-- Extensión del módulo aislado: pagos parciales y gastos periódicos.
-- No aplicar en producción durante el desarrollo de esta rama.

create table public.finance_expense_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null,
  category text not null check (category in ('fixed','variable','service','logistics','motorcycle','travel','daily','other')),
  description text not null check (length(trim(description)) between 2 and 500),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null check (currency in ('ARS','BRL')),
  due_day smallint not null check (due_day between 1 and 31),
  starts_on date not null,
  ends_on date,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  constraint finance_template_supplier_fk foreign key (supplier_id, company_id)
    references public.finance_suppliers(id, company_id) on delete restrict,
  constraint finance_template_dates check (ends_on is null or ends_on >= starts_on)
);
create index finance_expense_templates_company_idx
  on public.finance_expense_templates(company_id, active);

-- La cabecera fiscal es única; cada imputación conserva la OT y el concepto.
create table public.finance_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  direction text not null check (direction in ('issued','received')),
  client_id uuid,
  supplier_id uuid,
  invoice_number text not null check (length(trim(invoice_number)) between 1 and 100),
  issued_on date not null,
  due_on date,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null check (currency in ('ARS','BRL')),
  status text not null default 'registered' check (status in ('registered','sent','void')),
  sent_at timestamptz,
  storage_path text unique,
  file_name text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, company_id),
  constraint finance_invoice_party check (
    (direction = 'issued' and client_id is not null and supplier_id is null) or
    (direction = 'received' and supplier_id is not null and client_id is null)),
  constraint finance_invoice_supplier_fk foreign key (supplier_id, company_id)
    references public.finance_suppliers(id, company_id) on delete restrict,
  constraint finance_invoice_client_fk foreign key (client_id, company_id)
    references public.clients(id, company_id) on delete restrict,
  constraint finance_invoice_file_check check ((storage_path is null) = (file_name is null))
);
create index finance_invoices_party_idx on public.finance_invoices(company_id, direction, issued_on);
create unique index finance_invoices_issued_number_idx
  on public.finance_invoices(company_id, client_id, invoice_number) where direction = 'issued';
create unique index finance_invoices_received_number_idx
  on public.finance_invoices(company_id, supplier_id, invoice_number) where direction = 'received';

create or replace function public.finance_validate_invoice_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if row(new.id, new.company_id, new.direction, new.client_id, new.supplier_id,
      new.invoice_number, new.issued_on, new.due_on, new.amount, new.currency,
      new.storage_path, new.file_name, new.created_by, new.created_at)
     is distinct from
     row(old.id, old.company_id, old.direction, old.client_id, old.supplier_id,
      old.invoice_number, old.issued_on, old.due_on, old.amount, old.currency,
      old.storage_path, old.file_name, old.created_by, old.created_at) then
    raise exception 'Los datos de una factura registrada no se pueden cambiar';
  end if;
  if old.direction <> 'issued' or old.status <> 'registered' or new.status <> 'sent' then
    raise exception 'Sólo una factura emitida y registrada puede marcarse enviada';
  end if;
  new.sent_at := now();
  return new;
end $$;
create trigger finance_invoice_update_guard before update on public.finance_invoices
  for each row execute function public.finance_validate_invoice_update();

create table public.finance_invoice_allocations (
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_id uuid not null,
  entry_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  primary key (invoice_id, entry_id),
  constraint finance_allocation_invoice_fk foreign key (invoice_id, company_id)
    references public.finance_invoices(id, company_id) on delete restrict,
  constraint finance_allocation_entry_fk foreign key (entry_id, company_id)
    references public.finance_entries(id, company_id) on delete restrict
);
create index finance_invoice_allocations_entry_idx
  on public.finance_invoice_allocations(entry_id);

create or replace function public.finance_validate_invoice_allocation()
returns trigger language plpgsql set search_path = public as $$
declare v_invoice public.finance_invoices%rowtype; v_entry public.finance_entries%rowtype;
  v_invoice_used numeric(14,2); v_entry_used numeric(14,2);
begin
  select * into v_invoice from public.finance_invoices
    where id = new.invoice_id and company_id = new.company_id for update;
  select * into v_entry from public.finance_entries
    where id = new.entry_id and company_id = new.company_id for update;
  if v_invoice.id is null or v_entry.id is null or v_invoice.status = 'void' or
     v_invoice.currency <> v_entry.currency or
     (v_invoice.direction = 'issued' and
       (v_entry.direction <> 'receivable' or v_invoice.client_id <> v_entry.client_id)) or
     (v_invoice.direction = 'received' and
       (v_entry.direction <> 'payable' or v_invoice.supplier_id <> v_entry.supplier_id)) then
    raise exception 'Factura y obligación incompatibles';
  end if;
  select coalesce(sum(amount),0) into v_invoice_used from public.finance_invoice_allocations
    where invoice_id = new.invoice_id;
  select coalesce(sum(amount),0) into v_entry_used from public.finance_invoice_allocations
    where entry_id = new.entry_id;
  if v_invoice_used + new.amount > v_invoice.amount or
     v_entry_used + new.amount > v_entry.amount then
    raise exception 'La imputación supera el saldo de factura u obligación';
  end if;
  return new;
end $$;
create trigger finance_invoice_allocation_validate_before_insert
  before insert on public.finance_invoice_allocations
  for each row execute function public.finance_validate_invoice_allocation();

alter table public.finance_entries
  drop constraint finance_entries_category_check;
alter table public.finance_entries
  add constraint finance_entries_category_check
    check (category in ('installation','coordination','logistics','fixed','variable','service','motorcycle','travel','daily','other'));
alter table public.finance_entries
  add column template_id uuid,
  add column period_month date,
  add constraint finance_entry_template_fk foreign key (template_id, company_id)
    references public.finance_expense_templates(id, company_id) on delete restrict,
  add constraint finance_entry_template_period check
    ((template_id is null and period_month is null) or
     (template_id is not null and period_month = date_trunc('month', period_month)::date));
create unique index finance_entries_template_month_idx
  on public.finance_entries(template_id, period_month) where template_id is not null;

create table public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entry_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  occurred_on date not null,
  method text not null check (method in ('transfer','cash','check','card','other')),
  reference text not null default '' check (length(reference) <= 160),
  proof_document_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, company_id),
  constraint finance_transaction_entry_fk foreign key (entry_id, company_id)
    references public.finance_entries(id, company_id) on delete restrict
);
alter table public.finance_documents add constraint finance_documents_identity_key
  unique (id, entry_id, company_id);
alter table public.finance_transactions add constraint finance_transaction_proof_fk
  foreign key (proof_document_id, entry_id, company_id)
  references public.finance_documents(id, entry_id, company_id) on delete restrict;
create index finance_transactions_entry_idx on public.finance_transactions(entry_id, occurred_on);
create unique index finance_transactions_proof_once_idx on public.finance_transactions(proof_document_id)
  where proof_document_id is not null;
create index finance_transactions_company_date_idx
  on public.finance_transactions(company_id, occurred_on);

create or replace function public.finance_validate_transaction()
returns trigger language plpgsql set search_path = public as $$
declare v_entry public.finance_entries%rowtype; v_paid numeric(14,2); v_kind text;
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.company_id <> old.company_id or
       new.entry_id <> old.entry_id or new.amount <> old.amount or
       new.occurred_on <> old.occurred_on or new.method <> old.method or
       new.reference <> old.reference or new.created_by is distinct from old.created_by or
       new.created_at is distinct from old.created_at then
      raise exception 'El movimiento de caja es inmutable; registre un ajuste';
    end if;
    if old.proof_document_id is not null or new.proof_document_id is null then
      raise exception 'Sólo se puede asociar un comprobante pendiente';
    end if;
    select * into v_entry from public.finance_entries
      where id = new.entry_id and company_id = new.company_id;
    select kind into v_kind from public.finance_documents
      where id = new.proof_document_id and entry_id = new.entry_id and company_id = new.company_id;
    if v_kind is distinct from (case when v_entry.direction = 'payable'
      then 'transfer_proof' else 'bank_credit' end) then
      raise exception 'El comprobante no corresponde al pago o cobro';
    end if;
    return new;
  end if;
  select * into v_entry from public.finance_entries
    where id = new.entry_id and company_id = new.company_id for update;
  if not found or v_entry.status not in ('approved','settled') then
    raise exception 'La obligación debe estar aprobada';
  end if;
  if new.occurred_on > current_date then
    raise exception 'No se puede registrar un pago o cobro futuro como realizado';
  end if;
  select coalesce(sum(amount), 0) into v_paid from public.finance_transactions
    where entry_id = new.entry_id and company_id = new.company_id;
  if v_paid + new.amount > v_entry.amount then
    raise exception 'El movimiento supera el saldo pendiente';
  end if;
  if new.proof_document_id is not null then
    select kind into v_kind from public.finance_documents
      where id = new.proof_document_id and entry_id = new.entry_id and company_id = new.company_id;
    if v_kind is distinct from (case when v_entry.direction = 'payable'
      then 'transfer_proof' else 'bank_credit' end) then
      raise exception 'El comprobante no corresponde al pago o cobro';
    end if;
  end if;
  return new;
end $$;
create trigger finance_transaction_validate_before_write
  before insert or update on public.finance_transactions
  for each row execute function public.finance_validate_transaction();

create or replace function public.finance_close_paid_entry()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_amount numeric(14,2); v_paid numeric(14,2);
begin
  select amount into v_amount from public.finance_entries
    where id = new.entry_id and company_id = new.company_id for update;
  select coalesce(sum(amount), 0) into v_paid from public.finance_transactions
    where entry_id = new.entry_id and company_id = new.company_id;
  if v_paid = v_amount then
    update public.finance_entries set status = 'settled', settled_on = new.occurred_on,
      updated_by = new.created_by where id = new.entry_id and company_id = new.company_id;
  end if;
  return new;
end $$;
revoke all on function public.finance_close_paid_entry() from public, anon, authenticated;
create trigger finance_transaction_close_after_insert
  after insert on public.finance_transactions
  for each row execute function public.finance_close_paid_entry();

-- Un gasto mensual genera una obligación concreta una sola vez por período.
create or replace function public.finance_generate_expense_month(p_month date)
returns integer language plpgsql security invoker set search_path = public as $$
declare v_month date := date_trunc('month', p_month)::date; v_count integer;
begin
  if p_month <> v_month then raise exception 'Indique el primer día del mes'; end if;
  insert into public.finance_entries
    (company_id, direction, supplier_id, category, installment, description,
     amount, currency, due_on, template_id, period_month, created_by)
  select t.company_id, 'payable', t.supplier_id, t.category, 'recurring',
    t.description, t.amount, t.currency,
    (v_month + (least(t.due_day, extract(day from
      (v_month + interval '1 month - 1 day'))::integer) - 1))::date,
    t.id, v_month, auth.uid()
  from public.finance_expense_templates t
  where t.active and public.finance_can_access(t.company_id)
    and t.starts_on < v_month + interval '1 month'
    and (t.ends_on is null or t.ends_on >= v_month)
  on conflict (template_id, period_month) where template_id is not null do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.finance_generate_expense_month(date) from public, anon;
grant execute on function public.finance_generate_expense_month(date) to authenticated;

alter table public.finance_expense_templates enable row level security;
alter table public.finance_transactions enable row level security;
alter table public.finance_invoices enable row level security;
alter table public.finance_invoice_allocations enable row level security;
grant select, insert, update on public.finance_expense_templates to authenticated;
grant select, insert, update on public.finance_transactions to authenticated;
grant select, insert, update on public.finance_invoices to authenticated;
grant select, insert on public.finance_invoice_allocations to authenticated;
create policy finance_templates_read on public.finance_expense_templates for select to authenticated
  using (public.finance_can_access(company_id));
create policy finance_templates_insert on public.finance_expense_templates for insert to authenticated
  with check (public.finance_can_access(company_id) and created_by = (select auth.uid()));
create policy finance_templates_update on public.finance_expense_templates for update to authenticated
  using (public.finance_can_access(company_id)) with check (public.finance_can_access(company_id));
create policy finance_transactions_read on public.finance_transactions for select to authenticated
  using (public.finance_can_access(company_id));
create policy finance_transactions_insert on public.finance_transactions for insert to authenticated
  with check (public.finance_can_access(company_id) and created_by = (select auth.uid()));
create policy finance_transactions_proof_update on public.finance_transactions for update to authenticated
  using (public.finance_can_access(company_id)) with check (public.finance_can_access(company_id));
create policy finance_invoices_read on public.finance_invoices for select to authenticated
  using (public.finance_can_access(company_id));
create policy finance_invoices_insert on public.finance_invoices for insert to authenticated
  with check (public.finance_can_access(company_id) and created_by = (select auth.uid())
    and status = 'registered' and sent_at is null);
create policy finance_invoices_update on public.finance_invoices for update to authenticated
  using (public.finance_can_access(company_id)) with check (public.finance_can_access(company_id));
create policy finance_allocations_read on public.finance_invoice_allocations for select to authenticated
  using (public.finance_can_access(company_id));
create policy finance_allocations_insert on public.finance_invoice_allocations for insert to authenticated
  with check (public.finance_can_access(company_id));

-- Cabecera e imputaciones se registran juntas. Un error deja toda la factura sin efecto.
create or replace function public.finance_register_invoice(
  p_id uuid, p_company_id uuid, p_direction text, p_party_id uuid,
  p_invoice_number text, p_issued_on date, p_due_on date,
  p_amount numeric, p_currency text, p_storage_path text,
  p_file_name text, p_allocations jsonb
) returns uuid language plpgsql security invoker set search_path = public as $$
declare v_total numeric(14,2);
begin
  if not public.finance_can_access(p_company_id) or auth.uid() is null then
    raise exception 'Acceso denegado';
  end if;
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' or
     jsonb_array_length(p_allocations) = 0 then
    raise exception 'La factura necesita al menos una imputación';
  end if;
  select sum(x.amount) into v_total from jsonb_to_recordset(p_allocations)
    as x(entry_id uuid, amount numeric);
  if v_total <> p_amount then
    raise exception 'La suma imputada debe coincidir con el importe de la factura';
  end if;
  insert into public.finance_invoices
    (id, company_id, direction, client_id, supplier_id, invoice_number,
     issued_on, due_on, amount, currency, storage_path, file_name, created_by)
  values (p_id, p_company_id, p_direction,
    case when p_direction = 'issued' then p_party_id end,
    case when p_direction = 'received' then p_party_id end,
    p_invoice_number, p_issued_on, p_due_on, p_amount, p_currency,
    p_storage_path, p_file_name, auth.uid());
  insert into public.finance_invoice_allocations(company_id, invoice_id, entry_id, amount)
  select p_company_id, p_id, x.entry_id, x.amount
  from jsonb_to_recordset(p_allocations) as x(entry_id uuid, amount numeric);
  if p_direction = 'issued' and p_due_on is not null then
    update public.finance_entries e set due_on = p_due_on, updated_by = auth.uid()
    where e.company_id = p_company_id and e.due_on is null
      and exists (select 1 from public.finance_invoice_allocations a
        where a.company_id = e.company_id and a.entry_id = e.id and a.invoice_id = p_id);
  end if;
  return p_id;
end $$;
revoke all on function public.finance_register_invoice(uuid,uuid,text,uuid,text,date,date,numeric,text,text,text,jsonb)
  from public, anon;
grant execute on function public.finance_register_invoice(uuid,uuid,text,uuid,text,date,date,numeric,text,text,text,jsonb)
  to authenticated;

create or replace function public.finance_validate_entry()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'review' or (new.installment = 'advance' and new.due_on is null) then
      raise exception 'La obligación debe comenzar en revisión; un anticipo requiere fecha';
    end if;
    return new;
  end if;
  if new.company_id <> old.company_id or new.direction <> old.direction or
     new.order_id is distinct from old.order_id or new.supplier_id is distinct from old.supplier_id or
     new.client_id is distinct from old.client_id or new.amount <> old.amount or
     new.currency <> old.currency or new.template_id is distinct from old.template_id or
     new.period_month is distinct from old.period_month then
    raise exception 'No se pueden cambiar identidad, contraparte o importe; registre un ajuste';
  end if;
  if old.status in ('settled','void') then
    raise exception 'Una obligación cerrada no puede modificarse';
  end if;
  if new.status = 'void' and old.status <> 'void' and exists (
    select 1 from public.finance_transactions tx
    where tx.entry_id = new.id and tx.company_id = new.company_id) then
    raise exception 'Una obligación con movimientos de caja requiere un ajuste trazable';
  end if;
  if new.status = 'approved' and old.status <> 'approved' and
     new.direction = 'payable' and new.order_id is not null and
     new.installment <> 'advance' and not exists (
       select 1 from public.work_orders w
       where w.id = new.order_id and w.company_id = new.company_id
         and w.status = 'finalizada' and w.finalized_at is not null) then
    raise exception 'La OT debe estar finalizada y aprobada antes de habilitar el pago';
  end if;
  if new.status = 'approved' and old.status <> 'approved' and
     new.direction = 'payable' and new.category in ('installation','coordination','logistics','service')
     and not exists (select 1 from public.finance_documents d
       where d.entry_id = new.id and d.kind = 'invoice')
     and not exists (select 1 from public.finance_invoice_allocations a
       join public.finance_invoices i on i.id = a.invoice_id and i.company_id = a.company_id
       where a.entry_id = new.id and i.status <> 'void') then
    raise exception 'Se requiere factura recibida para aprobar este pago';
  end if;
  if new.status = 'settled' and old.status <> 'settled' then
    if old.status <> 'approved' then raise exception 'Primero se debe aprobar'; end if;
    if (select coalesce(sum(tx.amount),0) from public.finance_transactions tx
      where tx.entry_id = new.id and tx.company_id = new.company_id) <> new.amount then
      raise exception 'No se puede saldar mientras exista saldo pendiente';
    end if;
  end if;
  if new.status is distinct from old.status and not (
    (old.status = 'review' and new.status in ('approved','void')) or
    (old.status = 'approved' and new.status in ('settled','void'))
  ) then raise exception 'Transición financiera inválida'; end if;
  new.updated_at := now();
  return new;
end $$;

drop view public.finance_cash_movements;
create view public.finance_cash_movements with (security_invoker = true) as
select tx.id, tx.company_id, e.direction, tx.occurred_on as settled_on,
  tx.amount, e.currency, e.order_id, e.supplier_id, e.client_id,
  e.category, e.description, tx.method, tx.reference, tx.entry_id,
  tx.proof_document_id
from public.finance_transactions tx
join public.finance_entries e on e.id = tx.entry_id and e.company_id = tx.company_id;
grant select on public.finance_cash_movements to authenticated;

create view public.finance_entry_balances with (security_invoker = true) as
select e.*, coalesce(tx.paid_amount,0)::numeric(14,2) as paid_amount,
  (e.amount - coalesce(tx.paid_amount,0))::numeric(14,2) as open_amount
from public.finance_entries e
left join (
  select entry_id, company_id, sum(amount) as paid_amount
  from public.finance_transactions group by entry_id, company_id
) tx on tx.entry_id = e.id and tx.company_id = e.company_id;
grant select on public.finance_entry_balances to authenticated;

-- En facturación por instalación, la OT aprobada abre la cuenta por cobrar.
-- Las órdenes finalizadas antes de instalar esta migración no se convierten
-- automáticamente en deuda: Administración las revisa una por una.
create or replace function public.finance_open_order_receivable()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_client uuid; v_mode text;
begin
  if new.status = 'finalizada' and new.finalized_at is not null and
     old.status is distinct from 'finalizada' and new.amount is not null and new.amount > 0 then
    select p.client_id, p.billing_mode into v_client, v_mode from public.projects p
      where p.id = new.project_id and p.company_id = new.company_id;
    if v_client is not null and v_mode = 'per_installation' and not exists (
      select 1 from public.finance_entries e where e.company_id = new.company_id
        and e.order_id = new.id and e.direction = 'receivable' and e.status <> 'void') then
      insert into public.finance_entries
        (company_id, direction, order_id, client_id, category, installment,
         description, amount, currency, created_by, source_key)
      values (new.company_id, 'receivable', new.id, v_client, 'installation', 'total',
        new.title, new.amount, new.currency, auth.uid(), 'order-client:' || new.id::text)
      on conflict (company_id, source, source_key) do nothing;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.finance_open_order_receivable() from public, anon, authenticated;
create trigger finance_order_receivable_after_completion
  after update of status, finalized_at on public.work_orders
  for each row execute function public.finance_open_order_receivable();

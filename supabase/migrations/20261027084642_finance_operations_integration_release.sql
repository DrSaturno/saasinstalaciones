-- Operational cost lines: accessible to administrative staff, separate from
-- Finance documents, cash, payroll and approvals. The lead cost stays on the OT.
create table public.order_financial_costs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),order_id uuid not null,
  payee_id uuid not null,category text not null check(category in ('installation','coordination','travel','other')),
  description text not null check(length(trim(description)) between 2 and 200),
  amount numeric(14,2) not null check(amount between 0 and 999999999999.99),active boolean not null default true,
  created_by uuid not null references public.profiles(id),updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,company_id),
  foreign key(order_id,company_id) references public.work_orders(id,company_id),
  foreign key(company_id,payee_id) references public.company_installers(company_id,installer_id)
);
create index order_financial_costs_order_idx on public.order_financial_costs(company_id,order_id);
alter table public.order_financial_costs enable row level security;
revoke all on public.order_financial_costs from anon,authenticated;
grant select,insert,update on public.order_financial_costs to authenticated;
create policy order_financial_costs_read on public.order_financial_costs for select to authenticated using(public.auth_is_company_manager(company_id));
create policy order_financial_costs_insert on public.order_financial_costs for insert to authenticated with check(public.auth_is_company_manager(company_id) and created_by=(select auth.uid()) and updated_by=(select auth.uid()));
create policy order_financial_costs_update on public.order_financial_costs for update to authenticated using(public.auth_is_company_manager(company_id)) with check(public.auth_is_company_manager(company_id) and updated_by=(select auth.uid()));

-- Acquire tenant lock before Operations takes row locks, consistent with Finance.
create function public.finance_lock_operational_company()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_company uuid:=public.auth_company();
begin
  if v_company is not null then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_company::text,0)); end if;
  return null;
end $$;
-- Project billing uses its contractual amount once; installation billing uses
-- OT prices. Switching an identity after opening the ledger requires review.
alter table public.finance_entries add column project_id uuid;
alter table public.finance_entries add foreign key(project_id,company_id) references public.projects(id,company_id);
update public.finance_entries e set project_id=w.project_id from public.work_orders w where w.id=e.order_id and w.company_id=e.company_id;
create index finance_entries_project_idx on public.finance_entries(company_id,project_id);
create function public.finance_entry_project()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_project uuid; v_client uuid;
begin
  if tg_op='UPDATE' and new.project_id is distinct from old.project_id then raise exception 'entry_project_immutable'; end if;
  if new.order_id is not null then
    select project_id into v_project from public.work_orders where id=new.order_id and company_id=new.company_id;
    if new.project_id is not null and new.project_id is distinct from v_project then raise exception 'order_project_mismatch'; end if;
    new.project_id:=v_project;
  end if;
  if new.direction='receivable' and new.project_id is not null then
    select client_id into v_client from public.projects where id=new.project_id and company_id=new.company_id;
    if new.client_id is distinct from v_client then raise exception 'project_client_mismatch'; end if;
  end if;
  return new;
end $$;
revoke all on function public.finance_entry_project() from public,anon,authenticated;
create trigger finance_entry_project_guard before insert or update on public.finance_entries for each row execute function public.finance_entry_project();
create function public.finance_sync_project()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and (new.client_id is distinct from old.client_id or new.currency<>old.currency or new.billing_mode<>old.billing_mode) and
    exists(select 1 from public.finance_entries where company_id=new.company_id and project_id=new.id) then raise exception 'project_financial_identity_requires_review'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.company_id::text,0));
  if new.billing_mode='project' and new.client_id is not null and coalesce(new.contract_amount,0)>0 then
    insert into public.finance_entries(company_id,direction,project_id,client_id,category,description,amount,currency,source,source_key,created_by)
      values(new.company_id,'receivable',new.id,new.client_id,'installation',new.name,new.contract_amount,new.currency,'operations','project-client:'||new.id,auth.uid())
      on conflict(company_id,source,source_key) do update set amount=excluded.amount,updated_by=auth.uid() where finance_entries.amount is distinct from excluded.amount;
  elsif new.billing_mode='project' then
    update public.finance_entries set amount=0,updated_by=auth.uid() where company_id=new.company_id and source='operations' and source_key='project-client:'||new.id and amount<>0;
  end if;
  return new;
end $$;
revoke all on function public.finance_sync_project() from public,anon,authenticated;
create trigger finance_project_company_lock before insert or update on public.projects for each statement execute function public.finance_lock_operational_company();
create trigger finance_project_sync after insert or update of client_id,contract_amount,currency,billing_mode on public.projects for each row execute function public.finance_sync_project();

drop view public.finance_entry_balances;
create view public.finance_entry_balances with(security_invoker=true) as
select e.*,coalesce(tx.paid_amount,0)::numeric(14,2) paid_amount,
  greatest(0,e.amount-coalesce(tx.paid_amount,0))::numeric(14,2) open_amount,
  coalesce(ch.reserved_amount,0)::numeric(14,2) reserved_amount,
  greatest(0,e.amount-coalesce(tx.paid_amount,0)-coalesce(ch.reserved_amount,0))::numeric(14,2) available_amount,
  greatest(0,coalesce(tx.paid_amount,0)-e.amount)::numeric(14,2) credit_amount
from public.finance_entries e
left join(select entry_id,company_id,sum(amount) paid_amount from public.finance_transactions group by entry_id,company_id) tx on tx.entry_id=e.id and tx.company_id=e.company_id
left join(select a.entry_id,a.company_id,sum(a.amount) reserved_amount from public.finance_cheque_allocations a join public.finance_cheques c on c.id=a.cheque_id and c.company_id=a.company_id where c.status='pending' group by a.entry_id,a.company_id) ch on ch.entry_id=e.id and ch.company_id=e.company_id;
grant select on public.finance_entry_balances to authenticated;
create or replace function public.finance_import_existing_orders()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_company uuid:=public.auth_company(); v_row record; v_count integer:=0;
begin
  if not coalesce(public.finance_can_access(v_company),false) then raise exception 'finance_denied' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_company::text,0));
  insert into public.finance_entries(company_id,direction,project_id,client_id,category,description,amount,currency,source,source_key,created_by)
    select p.company_id,'receivable',p.id,p.client_id,'installation',p.name,p.contract_amount,p.currency,'operations','project-client:'||p.id,auth.uid()
    from public.projects p where p.company_id=v_company and p.billing_mode='project' and p.client_id is not null and coalesce(p.contract_amount,0)>0
    on conflict(company_id,source,source_key) do update set amount=excluded.amount,updated_by=auth.uid() where finance_entries.amount is distinct from excluded.amount;
  for v_row in select id from public.work_orders where company_id=v_company order by id loop
    perform public.finance_sync_order(v_row.id);v_count:=v_count+1;
  end loop;
  return v_count;
end $$;
revoke all on function public.finance_lock_operational_company() from public,anon,authenticated;
create trigger finance_order_company_lock before insert or update on public.work_orders for each statement execute function public.finance_lock_operational_company();
create trigger finance_extra_cost_company_lock before insert or update on public.order_financial_costs for each statement execute function public.finance_lock_operational_company();
create trigger finance_entry_company_lock before insert or update on public.finance_entries for each statement execute function public.finance_lock_operational_company();

create function public.finance_sync_operational_cost()
returns trigger language plpgsql security definer set search_path = '' as $$
declare w public.work_orders; v_supplier uuid; v_name text; v_kind text; v_key text;
begin
  if tg_op='UPDATE' and (new.id<>old.id or new.company_id<>old.company_id or new.order_id<>old.order_id or new.payee_id<>old.payee_id or new.category<>old.category or new.created_by<>old.created_by) then raise exception 'cost_identity_immutable'; end if;
  select * into w from public.work_orders where id=new.order_id and company_id=new.company_id;
  if new.active and not exists(select 1 from public.company_installers where company_id=new.company_id and installer_id=new.payee_id and status='active') then raise exception 'active_roster_required'; end if;
  if new.category='installation' and new.payee_id=w.assigned_installer_id then raise exception 'edit_lead_cost_on_order'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.company_id::text,0));
  v_kind:=case when new.category='coordination' then 'coordinator' else 'installer' end;
  select full_name into v_name from public.profiles where id=new.payee_id;
  insert into public.finance_suppliers(company_id,name,kind,installer_id) values(new.company_id,coalesce(nullif(v_name,''),'Equipo'),v_kind,new.payee_id)
    on conflict(company_id,installer_id) do nothing;
  select id into v_supplier from public.finance_suppliers where company_id=new.company_id and installer_id=new.payee_id;
  v_key:='order-cost:'||new.id;
  if new.active and new.amount>0 then
    insert into public.finance_entries(company_id,direction,order_id,supplier_id,category,installment,zone,description,amount,currency,created_by,source,source_key)
      select new.company_id,'payable',new.order_id,v_supplier,new.category,'total',case when s.zone='AMBA' then 'amba' else 'interior' end,new.description,new.amount,w.currency,auth.uid(),'operations',v_key
      from public.sites s where s.id=w.site_id and s.company_id=w.company_id
      on conflict(company_id,source,source_key) do update set amount=excluded.amount,description=excluded.description,updated_by=auth.uid()
      where finance_entries.amount is distinct from excluded.amount;
  else
    update public.finance_entries e set amount=coalesce((select sum(t.amount) from public.finance_transactions t where t.entry_id=e.id),0),updated_by=auth.uid()
      where e.company_id=new.company_id and e.source='operations' and e.source_key=v_key
      and e.amount is distinct from coalesce((select sum(t.amount) from public.finance_transactions t where t.entry_id=e.id),0);
  end if;
  return new;
end $$;
revoke all on function public.finance_sync_operational_cost() from public,anon,authenticated;
create trigger finance_operational_cost_sync after insert or update on public.order_financial_costs for each row execute function public.finance_sync_operational_cost();

-- Replacing the lead must not zero unrelated coordinator/reimbursement costs.
-- The canonical source function is changed below in the preceding migration;
-- this separate table never becomes a second source for the lead amount.
alter table public.finance_suppliers drop constraint finance_suppliers_kind_check;
alter table public.finance_suppliers add constraint finance_suppliers_kind_check check(kind in ('installer','coordinator','logistics','service','employee','other'));
alter table public.finance_suppliers add constraint finance_supplier_member_kind check(installer_id is null or kind in ('installer','coordinator'));
create function public.finance_supplier_identity()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.id<>old.id or new.company_id<>old.company_id or new.installer_id is distinct from old.installer_id then raise exception 'supplier_identity_immutable'; end if;
  return new;
end $$;
revoke all on function public.finance_supplier_identity() from public,anon,authenticated;
create trigger finance_supplier_identity_guard before update on public.finance_suppliers for each row execute function public.finance_supplier_identity();
alter table public.finance_entries drop constraint finance_entries_category_check;
alter table public.finance_entries add constraint finance_entries_category_check check(category in ('installation','coordination','logistics','fixed','payroll','variable','service','motorcycle','travel','daily','other'));
alter table public.finance_expense_templates drop constraint finance_expense_templates_category_check;
alter table public.finance_expense_templates add constraint finance_expense_templates_category_check check(category in ('fixed','payroll','variable','service','logistics','motorcycle','travel','daily','other'));
-- PostgreSQL numeric accepts NaN; upper bounds exclude it at the storage layer.
alter table public.finance_entries add constraint finance_entry_finite_amount check(amount<=999999999999.99);
alter table public.finance_expense_templates add constraint finance_template_finite_amount check(amount<=999999999999.99);
alter table public.finance_transactions add constraint finance_transaction_finite_amount check(amount<=999999999999.99);
alter table public.finance_invoices add constraint finance_invoice_finite_amount check(amount<=999999999999.99);
alter table public.finance_invoice_allocations add constraint finance_invoice_allocation_finite_amount check(amount<=999999999999.99);
alter table public.finance_cheques add constraint finance_cheque_finite_amount check(amount<=999999999999.99);
alter table public.finance_cheque_allocations add constraint finance_cheque_allocation_finite_amount check(amount<=999999999999.99);

create function public.finance_project_installer_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_installer uuid;v_status text;v_old text;v_order public.work_orders;
begin
  if new.source<>'operations' or new.source_key not like 'order-team:%' or new.order_id is null then return new; end if;
  select installer_id into v_installer from public.finance_suppliers where id=new.supplier_id and company_id=new.company_id;
  select * into v_order from public.work_orders where id=new.order_id and company_id=new.company_id;
  if v_order.assigned_installer_id is distinct from v_installer then return new; end if;
  -- Preserve legacy paid flags until Finance reconciles their opening history.
  if tg_op='INSERT' and v_order.payment_status='paid' and not exists(select 1 from public.finance_transactions where entry_id=new.id) then return new; end if;
  v_status:=case when new.amount>0 and new.status<>'void' and (select coalesce(sum(t.amount),0) from public.finance_transactions t where t.entry_id=new.id)>=new.amount then 'paid' else 'pending' end;
  if v_order.payment_status is distinct from v_status then
    update public.work_orders set payment_status=v_status,payment_status_changed_at=now(),payment_status_changed_by=auth.uid() where id=new.order_id and company_id=new.company_id;
    insert into public.order_payment_events(order_id,company_id,status,note,changed_by) values(new.order_id,new.company_id,v_status,'Finance ledger',auth.uid());
  end if;
  return new;
end $$;
revoke all on function public.finance_project_installer_payment() from public,anon,authenticated;
create trigger finance_installer_payment_projection after insert or update of amount,status on public.finance_entries
  for each row execute function public.finance_project_installer_payment();
create function public.finance_guard_legacy_payment()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated','anon') then
    if (tg_op='INSERT' and new.payment_status<>'pending') or (tg_op='UPDATE' and (new.payment_status is distinct from old.payment_status or new.payment_status_changed_at is distinct from old.payment_status_changed_at or new.payment_status_changed_by is distinct from old.payment_status_changed_by)) then raise exception 'use_finance_ledger'; end if;
  end if;
  return new;
end $$;
revoke all on function public.finance_guard_legacy_payment() from public,anon,authenticated;
create trigger finance_order_payment_guard before insert or update of payment_status on public.work_orders for each row execute function public.finance_guard_legacy_payment();
create or replace function public.set_order_payment_status(p_order_id uuid,p_status text,p_note text default '')
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.finance_can_access(public.auth_company()) then raise exception 'finance_denied' using errcode='42501'; end if;
  if exists(select 1 from public.work_orders where id=p_order_id and company_id=public.auth_company() and payment_status=p_status) then return; end if;
  raise exception 'use_finance_ledger';
end $$;
revoke all on function public.set_order_payment_status(uuid,text,text) from public,anon;
grant execute on function public.set_order_payment_status(uuid,text,text) to authenticated;
drop policy finance_storage_cleanup on storage.objects;
create policy finance_storage_cleanup on storage.objects for delete to authenticated using(
  bucket_id='finance-private' and public.finance_can_access(public.auth_company()) and (storage.foldername(name))[1]=public.auth_company()::text
  and not exists(select 1 from public.finance_documents d where d.storage_path=name)
  and not exists(select 1 from public.finance_invoices i where i.storage_path=name)
);

-- Only atomic RPCs can create cash or invoices. REST cannot leave half an invoice.
revoke insert on public.finance_transactions,public.finance_invoices,public.finance_invoice_allocations from authenticated;
create or replace function public.finance_register_invoice(
  p_id uuid,p_company_id uuid,p_direction text,p_party_id uuid,p_invoice_number text,p_issued_on date,p_due_on date,
  p_amount numeric,p_currency text,p_storage_path text,p_file_name text,p_allocations jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_total numeric;
begin
  if not coalesce(public.finance_can_access(p_company_id),false) or auth.uid() is null then raise exception 'finance_denied' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_company_id::text,0));
  if p_allocations is null or jsonb_typeof(p_allocations)<>'array' or jsonb_array_length(p_allocations) not between 1 and 100 then raise exception 'allocations_required'; end if;
  if p_storage_path is distinct from p_company_id::text||'/invoices/'||p_id::text then raise exception 'invoice_file_scope'; end if;
  select sum(x.amount) into v_total from jsonb_to_recordset(p_allocations) as x(entry_id uuid,amount numeric);
  if v_total is distinct from p_amount or not(p_amount>0 and p_amount<=999999999999.99) then raise exception 'invoice_total_mismatch'; end if;
  if exists(select 1 from jsonb_to_recordset(p_allocations) as x(entry_id uuid,amount numeric) where x.amount is null or x.amount<=0 or x.amount>999999999999.99 or round(x.amount,2)<>x.amount) then raise exception 'invalid_amount'; end if;
  insert into public.finance_invoices(id,company_id,direction,client_id,supplier_id,invoice_number,issued_on,due_on,amount,currency,storage_path,file_name,created_by)
    values(p_id,p_company_id,p_direction,case when p_direction='issued' then p_party_id end,case when p_direction='received' then p_party_id end,
      p_invoice_number,p_issued_on,p_due_on,p_amount,p_currency,p_storage_path,p_file_name,auth.uid());
  insert into public.finance_invoice_allocations(company_id,invoice_id,entry_id,amount)
    select p_company_id,p_id,x.entry_id,x.amount from jsonb_to_recordset(p_allocations) as x(entry_id uuid,amount numeric);
  if p_direction='issued' and p_due_on is not null then
    update public.finance_entries e set due_on=p_due_on,updated_by=auth.uid() where e.company_id=p_company_id and e.due_on is null and e.status in ('review','approved')
      and exists(select 1 from public.finance_invoice_allocations a where a.entry_id=e.id and a.company_id=p_company_id and a.invoice_id=p_id);
  end if;
  return p_id;
end $$;


-- Compatible with canonical main and the private-pricing / multi-installer work.
-- Internal readers never grant field staff access to client prices.
create function public.finance_order_source_amount(p_order uuid,p_company uuid)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v_amount numeric;
begin
  if to_regclass('public.work_order_pricing') is not null then
    execute 'select amount from public.work_order_pricing where order_id=$1 and company_id=$2' into v_amount using p_order,p_company;
  else select amount into v_amount from public.work_orders where id=p_order and company_id=p_company; end if;
  return v_amount;
end $$;
revoke all on function public.finance_order_source_amount(uuid,uuid) from public,anon,authenticated;
create function public.finance_project_source_amount(p_project uuid,p_company uuid)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v_amount numeric;
begin
  if to_regclass('public.project_pricing') is not null then
    execute 'select contract_amount from public.project_pricing where project_id=$1 and company_id=$2' into v_amount using p_project,p_company;
  else select contract_amount into v_amount from public.projects where id=p_project and company_id=p_company; end if;
  return v_amount;
end $$;
revoke all on function public.finance_project_source_amount(uuid,uuid) from public,anon,authenticated;
create or replace function public.finance_sync_order(p_order uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare w public.work_orders; v_client uuid; v_zone text; v_supplier uuid; v_name text; v_mode text; v_amount numeric;
begin
  select * into w from public.work_orders where id=p_order;
  if not found then return; end if;
  v_amount:=public.finance_order_source_amount(w.id,w.company_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(w.company_id::text,0));
  select client_id,billing_mode into v_client,v_mode from public.projects where id=w.project_id and company_id=w.company_id;
  select case when zone='AMBA' then 'amba' else 'interior' end into v_zone from public.sites where id=w.site_id and company_id=w.company_id;
  if v_client is not null and v_mode='per_installation' and v_amount is not null and v_amount>0 then
    insert into public.finance_entries(company_id,direction,order_id,client_id,category,installment,description,amount,currency,created_by,source,source_key)
      values(w.company_id,'receivable',w.id,v_client,'installation','total',w.title,v_amount,w.currency,auth.uid(),'operations','order-client:'||w.id)
      on conflict(company_id,source,source_key) do update set amount=excluded.amount,description=excluded.description,updated_by=auth.uid()
      where finance_entries.amount is distinct from excluded.amount;
  else
    update public.finance_entries set amount=0,updated_by=auth.uid() where company_id=w.company_id and source='operations' and source_key='order-client:'||w.id and amount<>0;
  end if;
  -- Canonical main currently has a lead installer cost. The source key includes
  -- the person: reassigning never moves somebody else's historical payment.
  if w.assigned_installer_id is not null and w.installer_amount is not null and w.installer_amount>0 then
    select full_name into v_name from public.profiles where id=w.assigned_installer_id;
    insert into public.finance_suppliers(company_id,name,kind,installer_id)
      values(w.company_id,coalesce(nullif(v_name,''),'Equipo'),'installer',w.assigned_installer_id)
      on conflict(company_id,installer_id) do nothing;
    select id into v_supplier from public.finance_suppliers where company_id=w.company_id and installer_id=w.assigned_installer_id;
    insert into public.finance_entries(company_id,direction,order_id,supplier_id,category,installment,zone,description,amount,currency,created_by,source,source_key)
      values(w.company_id,'payable',w.id,v_supplier,'installation','total',v_zone,w.title,w.installer_amount,w.currency,auth.uid(),'operations','order-team:'||w.id||':'||w.assigned_installer_id)
      on conflict(company_id,source,source_key) do update set amount=excluded.amount,description=excluded.description,zone=excluded.zone,updated_by=auth.uid()
      where finance_entries.amount is distinct from excluded.amount;
  end if;
  -- A reassignment never cancels the former person's unpaid balance.
  -- Finance reviews it separately; existing cash remains with that person.
  update public.finance_entries e set status='review',updated_by=auth.uid()
    where e.company_id=w.company_id and e.order_id=w.id and e.direction='payable' and e.source='operations' and e.source_key like 'order-team:%'
      and (w.assigned_installer_id is null or e.source_key<>'order-team:'||w.id||':'||w.assigned_installer_id or coalesce(w.installer_amount,0)=0)
      and e.status='approved' and e.amount>(select coalesce(sum(t.amount),0) from public.finance_transactions t where t.entry_id=e.id);

end $$;
revoke all on function public.finance_sync_order(uuid) from public,anon,authenticated;

create function public.finance_sync_project_amount(p_project uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.projects;v_amount numeric;
begin
  select * into p from public.projects where id=p_project;
  if not found or p.billing_mode<>'project' then return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p.company_id::text,0));
  v_amount:=public.finance_project_source_amount(p.id,p.company_id);
  if p.client_id is not null and coalesce(v_amount,0)>0 then
    insert into public.finance_entries(company_id,direction,project_id,client_id,category,description,amount,currency,source,source_key,created_by)
      values(p.company_id,'receivable',p.id,p.client_id,'installation',p.name,v_amount,p.currency,'operations','project-client:'||p.id,auth.uid())
      on conflict(company_id,source,source_key) do update set amount=excluded.amount,updated_by=auth.uid() where finance_entries.amount is distinct from excluded.amount;
  else
    update public.finance_entries set amount=0,updated_by=auth.uid() where company_id=p.company_id and source='operations' and source_key='project-client:'||p.id and amount<>0;
  end if;
end $$;
revoke all on function public.finance_sync_project_amount(uuid) from public,anon,authenticated;
create or replace function public.finance_sync_project()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and (new.client_id is distinct from old.client_id or new.currency<>old.currency or new.billing_mode<>old.billing_mode) and
    exists(select 1 from public.finance_entries where company_id=new.company_id and project_id=new.id) then raise exception 'project_financial_identity_requires_review'; end if;
  perform public.finance_sync_project_amount(new.id);
  return new;
end $$;
create function public.finance_private_price_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_row jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  if tg_table_name='work_order_pricing' then perform public.finance_sync_order((v_row->>'order_id')::uuid);
  else perform public.finance_sync_project_amount((v_row->>'project_id')::uuid); end if;
  return null;
end $$;
revoke all on function public.finance_private_price_changed() from public,anon,authenticated;

create function public.finance_sync_helper(p_member uuid,p_company uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_row jsonb;w public.work_orders;v_supplier uuid;v_name text;v_key text:='order-helper:'||p_member;v_amount numeric;
begin
  if to_regclass('public.work_order_team_members') is null then return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_company::text,0));
  execute 'select to_jsonb(m) from public.work_order_team_members m where id=$1 and company_id=$2' into v_row using p_member,p_company;
  if v_row is null or v_row->>'status'<>'active' or coalesce((v_row->>'installer_amount')::numeric,0)=0 then
    update public.finance_entries e set status='review',updated_by=auth.uid()
      where e.company_id=p_company and e.source='operations' and e.source_key=v_key and e.status='approved'
        and e.amount>(select coalesce(sum(t.amount),0) from public.finance_transactions t where t.entry_id=e.id);
    return;
  end if;
  select * into w from public.work_orders where id=(v_row->>'order_id')::uuid and company_id=p_company;
  if not found then return; end if;
  if w.assigned_installer_id=(v_row->>'installer_id')::uuid then return; end if;
  select full_name into v_name from public.profiles where id=(v_row->>'installer_id')::uuid;
  insert into public.finance_suppliers(company_id,name,kind,installer_id) values(p_company,coalesce(nullif(v_name,''),'Equipo'),'installer',(v_row->>'installer_id')::uuid) on conflict(company_id,installer_id) do nothing;
  select id into v_supplier from public.finance_suppliers where company_id=p_company and installer_id=(v_row->>'installer_id')::uuid;
  v_amount:=(v_row->>'installer_amount')::numeric;
  insert into public.finance_entries(company_id,direction,order_id,supplier_id,category,installment,zone,description,amount,currency,created_by,source,source_key)
    select p_company,'payable',w.id,v_supplier,'installation','total',case when s.zone='AMBA' then 'amba' else 'interior' end,w.title,v_amount,w.currency,auth.uid(),'operations',v_key from public.sites s where s.id=w.site_id and s.company_id=p_company
    on conflict(company_id,source,source_key) do update set amount=excluded.amount,updated_by=auth.uid() where finance_entries.amount is distinct from excluded.amount;
end $$;
revoke all on function public.finance_sync_helper(uuid,uuid) from public,anon,authenticated;
create function public.finance_helper_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_row jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin perform public.finance_sync_helper((v_row->>'id')::uuid,(v_row->>'company_id')::uuid);return null;end $$;
revoke all on function public.finance_helper_changed() from public,anon,authenticated;

do $$ begin
  if to_regclass('public.work_order_pricing') is not null then
    execute 'create trigger finance_private_order_lock before insert or update or delete on public.work_order_pricing for each statement execute function public.finance_lock_operational_company()';
    execute 'create trigger finance_private_order_price after insert or update or delete on public.work_order_pricing for each row execute function public.finance_private_price_changed()';
  end if;
  if to_regclass('public.project_pricing') is not null then
    execute 'create trigger finance_private_project_lock before insert or update or delete on public.project_pricing for each statement execute function public.finance_lock_operational_company()';
    execute 'create trigger finance_private_project_price after insert or update or delete on public.project_pricing for each row execute function public.finance_private_price_changed()';
  end if;
  if to_regclass('public.work_order_team_members') is not null then
    execute 'create trigger finance_helper_company_lock before insert or update or delete on public.work_order_team_members for each statement execute function public.finance_lock_operational_company()';
    execute 'create trigger finance_helper_sync after insert or update or delete on public.work_order_team_members for each row execute function public.finance_helper_changed()';
  end if;
end $$;
create or replace function public.finance_import_existing_orders()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_company uuid:=public.auth_company();v_row record;v_count integer:=0;
begin
  if not coalesce(public.finance_can_access(v_company),false) then raise exception 'finance_denied' using errcode='42501';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_company::text,0));
  for v_row in select id from public.projects where company_id=v_company order by id loop perform public.finance_sync_project_amount(v_row.id);end loop;
  for v_row in select id from public.work_orders where company_id=v_company order by id loop perform public.finance_sync_order(v_row.id);v_count:=v_count+1;end loop;
  if to_regclass('public.work_order_team_members') is not null then
    for v_row in execute 'select id from public.work_order_team_members where company_id=$1 order by id' using v_company loop perform public.finance_sync_helper(v_row.id,v_company);end loop;
  end if;
  return v_count;
end $$;
create function public.finance_order_commercial_amount(p_order uuid)
returns numeric language plpgsql stable security definer set search_path = '' as $$
declare v_company uuid;
begin
  select company_id into v_company from public.work_orders where id=p_order;
  if not coalesce(public.finance_can_access(v_company),false) then raise exception 'finance_denied' using errcode='42501';end if;
  return public.finance_order_source_amount(p_order,v_company);
end $$;
revoke all on function public.finance_order_commercial_amount(uuid) from public,anon;
grant execute on function public.finance_order_commercial_amount(uuid) to authenticated;

create function public.finance_helper_payment_projection()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_row jsonb;v_status text;v_paid numeric;
begin
  if new.source<>'operations' or new.source_key not like 'order-helper:%' or to_regclass('public.work_order_team_members') is null then return new;end if;
  execute 'select to_jsonb(m) from public.work_order_team_members m where id=$1 and company_id=$2' into v_row using substring(new.source_key from 14)::uuid,new.company_id;
  if v_row is null then return new;end if;
  select coalesce(sum(amount),0) into v_paid from public.finance_transactions where entry_id=new.id;
  if tg_op='INSERT' and v_row->>'payment_status'='paid' and v_paid=0 then return new;end if;
  v_status:=case when new.amount>0 and v_paid>=new.amount and new.status<>'void' then 'paid' else 'pending' end;
  if v_row->>'payment_status' is distinct from v_status then
    execute 'update public.work_order_team_members set payment_status=$1,payment_status_changed_at=now(),payment_status_changed_by=auth.uid() where id=$2 and company_id=$3'
      using v_status,(v_row->>'id')::uuid,new.company_id;
  end if;
  return new;
end $$;
revoke all on function public.finance_helper_payment_projection() from public,anon,authenticated;
create trigger finance_helper_payment_projection after insert or update of amount,status on public.finance_entries for each row execute function public.finance_helper_payment_projection();

-- One stored receipt may document several allocations of the same operation.
alter table public.finance_documents drop constraint finance_documents_storage_path_key;
alter table public.finance_documents add constraint finance_document_entry_path_kind unique(entry_id,storage_path,kind);
create function public.finance_attach_operation_proof(p_operation uuid,p_type text,p_path text,p_name text,p_mime text,p_size bigint)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_company uuid:=public.auth_company();v_row record;v_document uuid;v_count integer:=0;v_path text[]:=string_to_array(p_path,'/');
begin
  if not coalesce(public.finance_can_access(v_company),false) then raise exception 'finance_denied' using errcode='42501';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_company::text,0));
  if p_type not in ('batch','cheque','transaction') or array_length(v_path,1)<>3 or v_path[1]<>v_company::text or
    p_size not between 1 and 10485760 or p_mime not in ('application/pdf','image/jpeg','image/png','image/webp') then raise exception 'invalid_proof';end if;
  perform v_path[3]::uuid;
  if not exists(select 1 from public.finance_transactions t where t.company_id=v_company and t.entry_id=v_path[2]::uuid and
    ((p_type='batch' and t.batch_id=p_operation) or (p_type='cheque' and t.cheque_id=p_operation) or (p_type='transaction' and t.id=p_operation))) then raise exception 'proof_operation_mismatch';end if;
  for v_row in select t.id,t.entry_id,e.direction from public.finance_transactions t join public.finance_entries e on e.id=t.entry_id and e.company_id=t.company_id
    where t.company_id=v_company and t.proof_document_id is null and ((p_type='batch' and t.batch_id=p_operation) or (p_type='cheque' and t.cheque_id=p_operation) or (p_type='transaction' and t.id=p_operation)) order by t.id loop
    v_document:=null;
    insert into public.finance_documents(company_id,entry_id,kind,storage_path,file_name,mime_type,size_bytes,uploaded_by)
      values(v_company,v_row.entry_id,case when v_row.direction='payable' then 'transfer_proof' else 'bank_credit' end,p_path,p_name,p_mime,p_size,auth.uid())
      on conflict(entry_id,storage_path,kind) do nothing returning id into v_document;
    if v_document is null then select id into v_document from public.finance_documents where entry_id=v_row.entry_id and storage_path=p_path and kind=case when v_row.direction='payable' then 'transfer_proof' else 'bank_credit' end;end if;
    update public.finance_transactions set proof_document_id=v_document where id=v_row.id and company_id=v_company and proof_document_id is null;
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;
revoke all on function public.finance_attach_operation_proof(uuid,text,text,text,text,bigint) from public,anon;
grant execute on function public.finance_attach_operation_proof(uuid,text,text,text,text,bigint) to authenticated;
create or replace view public.finance_cash_movements with(security_invoker=true) as
select t.id,t.company_id,e.direction,t.occurred_on as settled_on,t.amount,e.currency,e.order_id,e.supplier_id,e.client_id,e.category,e.description,t.method,t.reference,t.entry_id,t.proof_document_id,t.batch_id,t.cheque_id
from public.finance_transactions t join public.finance_entries e on e.id=t.entry_id and e.company_id=t.company_id;

revoke all on public.finance_suppliers,public.finance_payment_rules,public.finance_entries,public.finance_documents,public.finance_entry_events,
  public.finance_expense_templates,public.finance_transactions,public.finance_invoices,public.finance_invoice_allocations,
  public.finance_cheques,public.finance_cheque_allocations,public.finance_cheque_events,public.finance_payment_batches,
  public.finance_entry_balances,public.finance_cash_movements,public.finance_invoice_differences from anon;

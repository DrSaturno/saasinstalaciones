-- SDD 2026-10-27. No connection to ARCA or banking is made by this migration.
-- Administrative staff can price OTs; only the owner and finance staff see the ledger.
create or replace function public.finance_can_access(p_company uuid)
returns boolean language sql stable security invoker set search_path = public as $$
  select public.auth_is_company_manager(p_company) and exists(select 1 from public.companies c where c.id=p_company and c.status='active') and (
    public.auth_is_company_owner(p_company) or exists (
      select 1 from public.company_staff_permissions s
      where s.user_id = (select auth.uid()) and s.company_id = p_company and s.can_manage_finance
    ))
$$;
create or replace function public.auth_can_see_commercials(p_company_id uuid)
returns boolean language sql stable security invoker set search_path = public as $$
  select public.auth_is_company_manager(p_company_id)
$$;
revoke all on function public.auth_can_see_commercials(uuid) from public, anon;
grant execute on function public.auth_can_see_commercials(uuid) to authenticated;

-- Own-profile UPDATE must never turn an employee into an owner or change tenant.
create function public.finance_protect_profile_identity()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user = 'authenticated' and (new.id <> old.id or new.role <> old.role or
    new.company_id is distinct from old.company_id or new.is_owner <> old.is_owner) then
    raise exception 'profile_identity_immutable' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.finance_protect_profile_identity() from public, anon, authenticated;
create trigger finance_profile_identity_guard before update on public.profiles
  for each row execute function public.finance_protect_profile_identity();
create policy profiles_company_staff_read on public.profiles for select to authenticated
  using (public.auth_is_company_owner(company_id) and role = 'company_manager');

do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.projects'::regclass and conname='projects_id_company_key') then
    alter table public.projects add constraint projects_id_company_key unique(id,company_id);
  end if;
end $$;
create table public.finance_cheques (
  id uuid primary key,
  company_id uuid not null references public.companies(id),
  direction text not null check (direction in ('payable','receivable')),
  supplier_id uuid, client_id uuid, project_id uuid,
  kind text not null check (kind in ('physical','electronic')),
  reference text not null check (length(trim(reference)) between 1 and 100),
  bank text not null check (length(trim(bank)) between 1 and 160),
  issued_on date not null, maturity_on date not null,
  term_days integer check (term_days in (30,60,90,120)),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null check (currency in ('ARS','BRL')),
  status text not null default 'pending' check (status in ('pending','settled','rejected','cancelled','endorsed')),
  settled_on date, created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  request_payload jsonb not null,
  unique (id,company_id),
  check (maturity_on >= issued_on),
  check ((status = 'settled') = (settled_on is not null)),
  check ((direction='payable' and supplier_id is not null and client_id is null) or
         (direction='receivable' and client_id is not null and supplier_id is null)),
  foreign key (supplier_id,company_id) references public.finance_suppliers(id,company_id),
  foreign key (client_id,company_id) references public.clients(id,company_id),
  foreign key (project_id,company_id) references public.projects(id,company_id)
);
create index finance_cheques_queue_idx on public.finance_cheques(company_id,status,maturity_on);
-- A bank/reference cannot silently be registered twice for the same counterparty.
create unique index finance_cheques_reference_idx on public.finance_cheques
  (company_id,direction,bank,reference,coalesce(supplier_id,client_id));

create table public.finance_cheque_allocations (
  company_id uuid not null references public.companies(id),
  cheque_id uuid not null, entry_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  primary key (cheque_id,entry_id),
  foreign key (cheque_id,company_id) references public.finance_cheques(id,company_id),
  foreign key (entry_id,company_id) references public.finance_entries(id,company_id)
);
create index finance_cheque_allocations_entry_idx on public.finance_cheque_allocations(company_id,entry_id);
create table public.finance_cheque_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id), cheque_id uuid not null,
  status text not null, occurred_on date not null, note text not null default '',
  created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  foreign key (cheque_id,company_id) references public.finance_cheques(id,company_id)
);
create index finance_cheque_events_history_idx on public.finance_cheque_events(company_id,cheque_id,created_at);
create table public.finance_payment_batches (
  id uuid primary key, company_id uuid not null references public.companies(id),
  request_payload jsonb not null, created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(), unique (id,company_id)
);
alter table public.finance_transactions add column cheque_id uuid, add column batch_id uuid,
  add column installment text not null default 'partial' check(installment in ('total','partial','advance','balance'));
alter table public.finance_cheques add column installment text not null default 'partial' check(installment in ('total','partial','advance','balance'));
alter table public.finance_transactions add foreign key (cheque_id,company_id) references public.finance_cheques(id,company_id);
alter table public.finance_transactions add foreign key (batch_id,company_id) references public.finance_payment_batches(id,company_id);
create unique index finance_transaction_cheque_entry_idx on public.finance_transactions(cheque_id,entry_id) where cheque_id is not null;
create unique index finance_transaction_batch_entry_idx on public.finance_transactions(batch_id,entry_id) where batch_id is not null;

alter table public.finance_cheques enable row level security;
alter table public.finance_cheque_allocations enable row level security;
alter table public.finance_cheque_events enable row level security;
alter table public.finance_payment_batches enable row level security;
revoke all on public.finance_cheques,public.finance_cheque_allocations,public.finance_cheque_events,public.finance_payment_batches from anon,authenticated;
grant select on public.finance_cheques,public.finance_cheque_allocations,public.finance_cheque_events,public.finance_payment_batches to authenticated;
create policy finance_cheques_read on public.finance_cheques for select to authenticated using (public.finance_can_access(company_id));
create policy finance_cheque_allocations_read on public.finance_cheque_allocations for select to authenticated using (public.finance_can_access(company_id));
create policy finance_cheque_events_read on public.finance_cheque_events for select to authenticated using (public.finance_can_access(company_id));
create policy finance_payment_batches_read on public.finance_payment_batches for select to authenticated using (public.finance_can_access(company_id));

-- Serialized per tenant; every settlement and reservation uses the same lock.
-- No caller can insert a cheque allocation directly, including via REST.
create function public.finance_register_cheque(p_id uuid,p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid := public.auth_company(); v_existing public.finance_cheques;
  v_entry public.finance_entries; v_row record; v_total numeric := 0; v_available numeric;
begin
  if not coalesce(public.finance_can_access(v_company),false) then raise exception 'finance_denied' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_company::text,0));
  select * into v_existing from public.finance_cheques where id=p_id;
  if found then
    if v_existing.company_id=v_company and v_existing.request_payload=p_data then return p_id; end if;
    raise exception 'idempotency_conflict';
  end if;
  if jsonb_typeof(p_data->'allocations') <> 'array' or jsonb_array_length(p_data->'allocations') not between 1 and 100 then
    raise exception 'allocations_required';
  end if;
  if (select count(*) <> count(distinct x->>'entry_id') from jsonb_array_elements(p_data->'allocations') x) then raise exception 'duplicate_entry'; end if;
  if p_data->>'direction'='payable' and exists (select 1 from public.finance_suppliers s
    where s.id=(p_data->>'party_id')::uuid and s.company_id=v_company and s.kind in ('installer','coordinator')) then
    raise exception 'field_team_transfer_or_cash_only';
  end if;
  for v_row in select (x->>'entry_id')::uuid id,(x->>'amount')::numeric amount
    from jsonb_array_elements(p_data->'allocations') x order by 1 loop
    if v_row.amount is null or v_row.amount <= 0 or round(v_row.amount,2)<>v_row.amount then raise exception 'invalid_amount'; end if;
    select * into v_entry from public.finance_entries where id=v_row.id and company_id=v_company for update;
    if not found or v_entry.status not in ('review','approved') or
      v_entry.direction is distinct from p_data->>'direction' or v_entry.currency is distinct from p_data->>'currency' or
      coalesce(v_entry.supplier_id,v_entry.client_id) is distinct from (p_data->>'party_id')::uuid then raise exception 'entry_mismatch'; end if;
    if nullif(p_data->>'project_id','') is not null and v_entry.project_id is distinct from (p_data->>'project_id')::uuid then raise exception 'project_mismatch'; end if;
    select v_entry.amount - coalesce((select sum(t.amount) from public.finance_transactions t where t.entry_id=v_entry.id),0)
      - coalesce((select sum(a.amount) from public.finance_cheque_allocations a join public.finance_cheques c on c.id=a.cheque_id
        where a.entry_id=v_entry.id and c.status='pending'),0) into v_available;
    if v_row.amount > v_available then raise exception 'insufficient_available_balance'; end if;
    v_total := v_total + v_row.amount;
  end loop;
  if v_total is distinct from (p_data->>'amount')::numeric then raise exception 'allocation_total_mismatch'; end if;
  insert into public.finance_cheques(id,company_id,direction,supplier_id,client_id,project_id,kind,reference,bank,issued_on,maturity_on,term_days,amount,currency,created_by,request_payload,installment)
  values(p_id,v_company,p_data->>'direction',case when p_data->>'direction'='payable' then (p_data->>'party_id')::uuid end,
    case when p_data->>'direction'='receivable' then (p_data->>'party_id')::uuid end,nullif(p_data->>'project_id','')::uuid,
    p_data->>'kind',p_data->>'reference',p_data->>'bank',(p_data->>'issued_on')::date,(p_data->>'maturity_on')::date,
    nullif(p_data->>'term_days','')::int,v_total,p_data->>'currency',auth.uid(),p_data,coalesce(p_data->>'installment','partial'));
  insert into public.finance_cheque_allocations(company_id,cheque_id,entry_id,amount)
    select v_company,p_id,(x->>'entry_id')::uuid,(x->>'amount')::numeric from jsonb_array_elements(p_data->'allocations') x;
  insert into public.finance_cheque_events(company_id,cheque_id,status,occurred_on,created_by)
    values(v_company,p_id,'pending',(p_data->>'issued_on')::date,auth.uid());
  return p_id;
end $$;
revoke all on function public.finance_register_cheque(uuid,jsonb) from public,anon;
grant execute on function public.finance_register_cheque(uuid,jsonb) to authenticated;

-- Actual cash cannot consume amounts reserved by a pending cheque.
create or replace function public.finance_validate_transaction()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_entry public.finance_entries; v_available numeric; v_kind text; v_today date;
begin
  if tg_op='UPDATE' then
    if (to_jsonb(new)-'proof_document_id') is distinct from (to_jsonb(old)-'proof_document_id') or
      old.proof_document_id is not null or new.proof_document_id is null then raise exception 'transaction_immutable'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.company_id::text,0));
  select * into v_entry from public.finance_entries where id=new.entry_id and company_id=new.company_id for update;
  if not found then raise exception 'entry_missing'; end if;
  if new.proof_document_id is not null then
    select kind into v_kind from public.finance_documents where id=new.proof_document_id and entry_id=new.entry_id and company_id=new.company_id;
    if v_kind is distinct from (case when v_entry.direction='payable' then 'transfer_proof' else 'bank_credit' end) then raise exception 'proof_mismatch'; end if;
  end if;
  if tg_op='UPDATE' then return new; end if;
  if v_entry.status not in ('approved','settled') and not(v_entry.status='review' and new.installment='advance') then raise exception 'approval_required'; end if;
  if v_entry.status='review' and new.installment='advance' and v_entry.direction='payable' and
    not exists(select 1 from public.finance_documents d where d.entry_id=v_entry.id and d.kind='invoice') and
    not exists(select 1 from public.finance_invoice_allocations a join public.finance_invoices i on i.id=a.invoice_id where a.entry_id=v_entry.id and i.status<>'void') then raise exception 'advance_invoice_required'; end if;
  select (now() at time zone case when country='BR' then 'America/Sao_Paulo' else 'America/Argentina/Buenos_Aires' end)::date
    into v_today from public.companies where id=new.company_id;
  if new.occurred_on>v_today then raise exception 'future_cash'; end if;
  if exists(select 1 from public.finance_suppliers s where s.id=v_entry.supplier_id and s.kind in ('installer','coordinator'))
    and new.method not in ('transfer','cash') then raise exception 'field_team_transfer_or_cash_only'; end if;
  if new.method='check' then
    if not exists(select 1 from public.finance_cheques c join public.finance_cheque_allocations a on a.cheque_id=c.id and a.company_id=c.company_id
      where c.id=new.cheque_id and c.company_id=new.company_id and c.status='settled' and c.settled_on=new.occurred_on
        and a.entry_id=new.entry_id and a.amount=new.amount) then raise exception 'cheque_settlement_required'; end if;
  elsif new.cheque_id is not null then raise exception 'invalid_cheque_method'; end if;
  select v_entry.amount-coalesce((select sum(amount) from public.finance_transactions where entry_id=new.entry_id),0)
    -coalesce((select sum(a.amount) from public.finance_cheque_allocations a join public.finance_cheques c on c.id=a.cheque_id
      where a.entry_id=new.entry_id and c.status='pending'),0) into v_available;
  -- A confirmed bank event must be recorded even if Operations reduced an OT
  -- after receiving the instrument. This exposes credit instead of losing cash.
  if new.cheque_id is null and new.amount>v_available then raise exception 'insufficient_available_balance'; end if;
  return new;
end $$;

create function public.finance_change_cheque(p_id uuid,p_status text,p_on date,p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_company uuid:=public.auth_company(); v_check public.finance_cheques; v_row record; v_today date;
begin
  if not coalesce(public.finance_can_access(v_company),false) then raise exception 'finance_denied' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_company::text,0));
  select * into v_check from public.finance_cheques where id=p_id and company_id=v_company for update;
  if not found then raise exception 'cheque_missing'; end if;
  if v_check.status=p_status then return; end if;
  if v_check.status<>'pending' or p_status not in ('settled','rejected','cancelled','endorsed') or
    (p_status='endorsed' and v_check.direction<>'receivable') then raise exception 'invalid_cheque_transition'; end if;
  select (now() at time zone case when country='BR' then 'America/Sao_Paulo' else 'America/Argentina/Buenos_Aires' end)::date
    into v_today from public.companies where id=v_company;
  if p_on is null or p_on>v_today or p_on<v_check.issued_on or length(coalesce(p_note,''))>500 then raise exception 'invalid_event_date'; end if;
  if p_status<>'settled' and length(trim(coalesce(p_note,'')))=0 then raise exception 'event_note_required'; end if;
  if p_status='settled' and exists(select 1 from public.finance_cheque_allocations a join public.finance_entries e on e.id=a.entry_id
    where a.cheque_id=p_id and e.status not in ('approved','settled') and not(e.status='review' and v_check.installment='advance')) then raise exception 'approval_required'; end if;
  update public.finance_cheques set status=p_status,settled_on=case when p_status='settled' then p_on end where id=p_id;
  if p_status='settled' then
    for v_row in select * from public.finance_cheque_allocations where cheque_id=p_id order by entry_id loop
      insert into public.finance_transactions(company_id,entry_id,amount,occurred_on,method,reference,cheque_id,created_by,installment)
        values(v_company,v_row.entry_id,v_row.amount,p_on,'check',v_check.reference,p_id,auth.uid(),v_check.installment);
    end loop;
  end if;
  insert into public.finance_cheque_events(company_id,cheque_id,status,occurred_on,note,created_by)
    values(v_company,p_id,p_status,p_on,coalesce(p_note,''),auth.uid());
end $$;
revoke all on function public.finance_change_cheque(uuid,text,date,text) from public,anon;
grant execute on function public.finance_change_cheque(uuid,text,date,text) to authenticated;

-- One transfer/cash receipt, many obligations (and consequently many invoices).
create function public.finance_register_payment_batch(p_id uuid,p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company uuid:=public.auth_company(); v_existing public.finance_payment_batches; v_row record;
  v_entry public.finance_entries; v_party uuid; v_direction text; v_currency text;
begin
  if not coalesce(public.finance_can_access(v_company),false) then raise exception 'finance_denied' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_company::text,0));
  select * into v_existing from public.finance_payment_batches where id=p_id;
  if found then
    if v_existing.company_id=v_company and v_existing.request_payload=p_data then return p_id; end if;
    raise exception 'idempotency_conflict';
  end if;
  if p_data->>'method' not in ('transfer','cash') or jsonb_typeof(p_data->'allocations') <> 'array'
    or jsonb_array_length(p_data->'allocations') not between 1 and 100 then raise exception 'invalid_payment'; end if;
  if (select count(*)<>count(distinct x->>'entry_id') from jsonb_array_elements(p_data->'allocations') x) then raise exception 'duplicate_entry'; end if;
  if (p_data->>'amount')::numeric is distinct from (select sum((x->>'amount')::numeric) from jsonb_array_elements(p_data->'allocations') x) then raise exception 'allocation_total_mismatch'; end if;
  insert into public.finance_payment_batches(id,company_id,request_payload,created_by) values(p_id,v_company,p_data,auth.uid());
  for v_row in select (x->>'entry_id')::uuid id,(x->>'amount')::numeric amount,nullif(x->>'proof_document_id','')::uuid proof
    from jsonb_array_elements(p_data->'allocations') x order by 1 loop
    if v_row.amount is null or v_row.amount<=0 or round(v_row.amount,2)<>v_row.amount then raise exception 'invalid_amount'; end if;
    select * into v_entry from public.finance_entries where id=v_row.id and company_id=v_company for update;
    if not found then raise exception 'entry_missing'; end if;
    if v_party is null then
      v_party:=coalesce(v_entry.supplier_id,v_entry.client_id); v_direction:=v_entry.direction; v_currency:=v_entry.currency;
    elsif v_party<>coalesce(v_entry.supplier_id,v_entry.client_id) or v_direction<>v_entry.direction or v_currency<>v_entry.currency then raise exception 'payment_party_mismatch'; end if;
    insert into public.finance_transactions(company_id,entry_id,amount,occurred_on,method,reference,batch_id,proof_document_id,created_by,installment)
      values(v_company,v_row.id,v_row.amount,(p_data->>'occurred_on')::date,p_data->>'method',coalesce(p_data->>'reference',''),p_id,v_row.proof,auth.uid(),coalesce(p_data->>'installment','partial'));
  end loop;
  return p_id;
end $$;
revoke all on function public.finance_register_payment_batch(uuid,jsonb) from public,anon;
grant execute on function public.finance_register_payment_batch(uuid,jsonb) to authenticated;

-- Updates from Operations retain confirmed cash and immutable fiscal documents.
alter table public.finance_entries drop constraint finance_entries_source_check;
alter table public.finance_entries add constraint finance_entries_source_check check (source in ('manual','imported','operations'));
-- Adopt only rows produced by the previous OT trigger, never manual debt.
update public.finance_entries set source='operations' where source='manual' and source_key like 'order-client:%';
alter table public.finance_entries drop constraint finance_entries_amount_check;
alter table public.finance_entries add constraint finance_entries_amount_check check (amount>=0);
alter table public.finance_entries drop constraint finance_entries_installment_check;
alter table public.finance_entries add constraint finance_entries_installment_check check (installment in ('advance','balance','total','partial','recurring'));
alter table public.finance_entry_events add column old_amount numeric(14,2),add column new_amount numeric(14,2);

create or replace function public.finance_validate_entry()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_internal boolean := current_user not in ('authenticated','anon'); v_paid numeric;
begin
  if tg_op='INSERT' then
    if new.status<>'review' or (new.installment='advance' and new.due_on is null) or
      (not v_internal and (new.source<>'manual' or new.amount<=0)) then raise exception 'invalid_new_entry'; end if;
    if not v_internal and new.source='manual' and new.order_id is not null and exists(
      select 1 from public.finance_entries e where e.company_id=new.company_id and e.order_id=new.order_id and e.source='operations' and e.status<>'void'
        and e.direction=new.direction and coalesce(e.supplier_id,e.client_id)=coalesce(new.supplier_id,new.client_id)
        and (e.category=new.category or new.direction='receivable')
    ) then raise exception 'use_existing_obligation'; end if;
    return new;
  end if;
  if new.id<>old.id or new.company_id<>old.company_id or new.direction<>old.direction or
    new.order_id is distinct from old.order_id or new.supplier_id is distinct from old.supplier_id or
    new.client_id is distinct from old.client_id or new.currency<>old.currency or
    new.source<>old.source or new.source_key is distinct from old.source_key or
    new.template_id is distinct from old.template_id or new.period_month is distinct from old.period_month then raise exception 'entry_identity_immutable'; end if;
  if new.amount<>old.amount then
    if not v_internal or (old.source<>'operations' and old.template_id is null) then raise exception 'amount_change_requires_source'; end if;
  end if;
  if v_internal and (old.source='operations' or old.template_id is not null) and new.amount<>old.amount then
    select coalesce(sum(amount),0) into v_paid from public.finance_transactions where entry_id=new.id;
    if old.status<>'void' then
      if v_paid>=new.amount and v_paid>0 then
        new.status:='settled'; select max(occurred_on) into new.settled_on from public.finance_transactions where entry_id=new.id;
      elsif old.status='settled' then new.status:='approved'; new.settled_on:=null;
      end if;
    end if;
    new.updated_at:=now(); return new;
  end if;
  if v_internal and new.status='settled' and old.status='review' and exists(select 1 from public.finance_transactions where entry_id=new.id and installment='advance') then
    select coalesce(sum(amount),0) into v_paid from public.finance_transactions where entry_id=new.id;
    if v_paid>=new.amount then new.updated_at:=now(); return new; end if;
  end if;
  if v_internal and new.source='operations' and old.status='approved' and new.status='review' and new.amount=old.amount then
    new.settled_on:=null;new.updated_at:=now();return new;
  end if;
  if old.status in ('settled','void') then raise exception 'entry_closed'; end if;
  if new.status='void' and (exists(select 1 from public.finance_transactions where entry_id=new.id) or
    exists(select 1 from public.finance_cheque_allocations a join public.finance_cheques c on c.id=a.cheque_id where a.entry_id=new.id and c.status='pending')) then raise exception 'entry_has_cash_or_reservations'; end if;
  if new.status='approved' and old.status<>'approved' then
    if new.direction='payable' and new.order_id is not null and new.installment<>'advance' and
      not exists(select 1 from public.work_orders w where w.id=new.order_id and w.company_id=new.company_id and w.status='finalizada' and w.finalized_at is not null) then raise exception 'order_completion_required'; end if;
    if new.direction='payable' and new.category in ('installation','coordination','logistics','service') and
      not exists(select 1 from public.finance_documents d where d.entry_id=new.id and d.kind='invoice') and
      not exists(select 1 from public.finance_invoice_allocations a join public.finance_invoices i on i.id=a.invoice_id and i.company_id=a.company_id where a.entry_id=new.id and i.status<>'void') then raise exception 'invoice_required'; end if;
  end if;
  if new.status='settled' then
    select coalesce(sum(amount),0) into v_paid from public.finance_transactions where entry_id=new.id;
    if old.status<>'approved' or v_paid<new.amount then raise exception 'pending_balance'; end if;
  end if;
  if new.status is distinct from old.status and not ((old.status='review' and new.status in ('approved','void')) or
    (old.status='approved' and new.status in ('settled','void'))) then raise exception 'invalid_entry_transition'; end if;
  new.updated_at:=now(); return new;
end $$;

create or replace function public.finance_audit_entry()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' then
    insert into public.finance_entry_events(company_id,entry_id,to_status,changed_by,new_amount)
      values(new.company_id,new.id,new.status,auth.uid(),new.amount);
  elsif old.status is distinct from new.status or old.amount is distinct from new.amount then
    insert into public.finance_entry_events(company_id,entry_id,from_status,to_status,changed_by,old_amount,new_amount)
      values(new.company_id,new.id,old.status,new.status,auth.uid(),old.amount,new.amount);
  end if;
  return new;
end $$;
create or replace function public.finance_close_paid_entry()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.finance_entries e set status='settled',settled_on=new.occurred_on,updated_by=new.created_by
    where e.id=new.entry_id and e.company_id=new.company_id and (e.status='approved' or (e.status='review' and new.installment='advance'))
      and (select coalesce(sum(t.amount),0) from public.finance_transactions t where t.entry_id=e.id)>=e.amount;
  return new;
end $$;

-- Private helper, executable only through triggers or the authorized backfill RPC.
create function public.finance_sync_order(p_order uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare w public.work_orders; v_client uuid; v_zone text; v_supplier uuid; v_name text; v_mode text;
begin
  select * into w from public.work_orders where id=p_order;
  if not found then return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(w.company_id::text,0));
  select client_id,billing_mode into v_client,v_mode from public.projects where id=w.project_id and company_id=w.company_id;
  select case when zone='AMBA' then 'amba' else 'interior' end into v_zone from public.sites where id=w.site_id and company_id=w.company_id;
  if v_client is not null and v_mode='per_installation' and w.amount is not null and w.amount>0 then
    insert into public.finance_entries(company_id,direction,order_id,client_id,category,installment,description,amount,currency,created_by,source,source_key)
      values(w.company_id,'receivable',w.id,v_client,'installation','total',w.title,w.amount,w.currency,auth.uid(),'operations','order-client:'||w.id)
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
create function public.finance_sync_order_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin perform public.finance_sync_order(new.id); return new; end $$;
revoke all on function public.finance_sync_order_trigger() from public,anon,authenticated;
drop trigger finance_order_receivable_after_completion on public.work_orders;
create trigger finance_order_sync after insert or update of amount,installer_amount,assigned_installer_id,status,finalized_at,title on public.work_orders
  for each row execute function public.finance_sync_order_trigger();
create function public.finance_import_existing_orders()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_company uuid:=public.auth_company(); v_row record; v_count integer:=0;
begin
  if not coalesce(public.finance_can_access(v_company),false) then raise exception 'finance_denied' using errcode='42501'; end if;
  for v_row in select id from public.work_orders where company_id=v_company order by id loop
    perform public.finance_sync_order(v_row.id); v_count:=v_count+1;
  end loop;
  return v_count;
end $$;
revoke all on function public.finance_import_existing_orders() from public,anon;
grant execute on function public.finance_import_existing_orders() to authenticated;

create function public.finance_update_recurring_entries()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_month date;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.company_id::text,0));
  if new.company_id<>old.company_id or new.supplier_id<>old.supplier_id or new.currency<>old.currency then raise exception 'template_identity_immutable'; end if;
  select date_trunc('month',now() at time zone case when country='BR' then 'America/Sao_Paulo' else 'America/Argentina/Buenos_Aires' end)::date
    into v_month from public.companies where id=new.company_id;
  update public.finance_entries e set amount=new.amount,description=new.description,
    due_on=(e.period_month + (least(new.due_day,extract(day from (e.period_month+interval '1 month - 1 day'))::int)-1))::date,
    updated_by=auth.uid()
    where e.template_id=new.id and e.company_id=new.company_id and e.period_month>=v_month and e.status in ('review','approved')
      and not exists(select 1 from public.finance_transactions t where t.entry_id=e.id)
      and not exists(select 1 from public.finance_cheque_allocations a join public.finance_cheques c on c.id=a.cheque_id where a.entry_id=e.id and c.status='pending');
  return new;
end $$;
revoke all on function public.finance_update_recurring_entries() from public,anon,authenticated;
create trigger finance_recurring_update after update of amount,description,due_day on public.finance_expense_templates
  for each row execute function public.finance_update_recurring_entries();

drop view public.finance_entry_balances;
create view public.finance_entry_balances with(security_invoker=true) as
select e.*,coalesce(tx.paid_amount,0)::numeric(14,2) paid_amount,
  greatest(0,e.amount-coalesce(tx.paid_amount,0))::numeric(14,2) open_amount,
  coalesce(ch.reserved_amount,0)::numeric(14,2) reserved_amount,
  greatest(0,e.amount-coalesce(tx.paid_amount,0)-coalesce(ch.reserved_amount,0))::numeric(14,2) available_amount,
  greatest(0,coalesce(tx.paid_amount,0)-e.amount)::numeric(14,2) credit_amount
from public.finance_entries e
left join (select entry_id,company_id,sum(amount) paid_amount from public.finance_transactions group by entry_id,company_id) tx
  on tx.entry_id=e.id and tx.company_id=e.company_id
left join (select a.entry_id,a.company_id,sum(a.amount) reserved_amount from public.finance_cheque_allocations a
  join public.finance_cheques c on c.id=a.cheque_id and c.company_id=a.company_id where c.status='pending' group by a.entry_id,a.company_id) ch
  on ch.entry_id=e.id and ch.company_id=e.company_id;
grant select on public.finance_entry_balances to authenticated;

alter table public.finance_invoice_allocations add column source_amount_at_registration numeric(14,2);
create function public.finance_invoice_snapshot()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  select amount into new.source_amount_at_registration from public.finance_entries where id=new.entry_id and company_id=new.company_id;
  return new;
end $$;
revoke all on function public.finance_invoice_snapshot() from public,anon,authenticated;
create trigger finance_invoice_source_snapshot before insert on public.finance_invoice_allocations
  for each row execute function public.finance_invoice_snapshot();
create view public.finance_invoice_differences with(security_invoker=true) as
select a.company_id,a.invoice_id,a.entry_id,a.amount invoice_amount,e.amount current_amount
from public.finance_invoice_allocations a join public.finance_entries e on e.id=a.entry_id and e.company_id=a.company_id
join public.finance_invoices i on i.id=a.invoice_id and i.company_id=a.company_id
where i.status<>'void' and e.source='operations' and a.source_amount_at_registration is distinct from e.amount;
grant select on public.finance_invoice_differences to authenticated;

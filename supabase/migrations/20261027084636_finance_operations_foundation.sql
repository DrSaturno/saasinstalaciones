-- Circuito financiero privado por empresa. Sólo se aplica al promover esta rama.
-- Una fila representa una cuota o concepto: anticipo, saldo y total son registros
-- distintos, lo que permite varias personas y varios pagos para una misma OT.

create table public.finance_suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 160),
  kind text not null default 'other' check (kind in ('installer','coordinator','logistics','service','other')),
  tax_id text not null default '',
  installer_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint finance_supplier_roster_fk foreign key (company_id, installer_id)
    references public.company_installers(company_id, installer_id) on delete restrict,
  unique (id, company_id),
  unique (company_id, installer_id)
);
create index finance_suppliers_name_idx on public.finance_suppliers(company_id, name);

create table public.finance_payment_rules (
  company_id uuid primary key references public.companies(id) on delete cascade,
  amba_weekday smallint not null default 1 check (amba_weekday between 1 and 7),
  interior_weekday smallint not null default 2 check (interior_weekday between 1 and 7),
  updated_at timestamptz not null default now()
);

create table public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  direction text not null check (direction in ('payable','receivable')),
  order_id uuid,
  supplier_id uuid,
  client_id uuid,
  category text not null check (category in ('installation','coordination','logistics','fixed','variable','service','other')),
  installment text not null default 'total' check (installment in ('advance','balance','total','recurring')),
  zone text check (zone in ('amba','interior')),
  description text not null default '',
  amount numeric(14,2) not null check (amount > 0),
  currency text not null check (currency in ('ARS','BRL')),
  due_on date,
  status text not null default 'review' check (status in ('review','approved','settled','void')),
  settled_on date,
  source text not null default 'manual' check (source in ('manual','imported')),
  source_key text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  unique (company_id, source, source_key),
  constraint finance_entry_party check (
    (direction = 'payable' and supplier_id is not null and client_id is null) or
    (direction = 'receivable' and client_id is not null and supplier_id is null)
  ),
  constraint finance_entry_order_zone check
    (order_id is null or direction <> 'payable' or zone is not null),
  constraint finance_entry_order_fk foreign key (order_id, company_id)
    references public.work_orders(id, company_id) on delete restrict,
  constraint finance_entry_supplier_fk foreign key (supplier_id, company_id)
    references public.finance_suppliers(id, company_id) on delete restrict,
  constraint finance_entry_settled_date check ((status = 'settled') = (settled_on is not null))
);
-- clients_id_company_key ya existe en canonical_locations; la FK conserva tenant.
alter table public.finance_entries add constraint finance_entry_client_fk
  foreign key (client_id, company_id) references public.clients(id, company_id) on delete restrict;
create index finance_entries_queue_idx on public.finance_entries(company_id, status, due_on);
create index finance_entries_order_idx on public.finance_entries(order_id) where order_id is not null;
create index finance_entries_supplier_idx on public.finance_entries(supplier_id, due_on);
create index finance_entries_client_idx on public.finance_entries(client_id, due_on);

create table public.finance_documents (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('invoice','transfer_proof','bank_credit','payment_order')),
  storage_path text not null unique,
  file_name text not null check (length(file_name) between 1 and 255),
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint finance_documents_entry_fk foreign key (entry_id, company_id)
    references public.finance_entries(id, company_id) on delete restrict
);
create index finance_documents_entry_idx on public.finance_documents(entry_id, kind);

create table public.finance_entry_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entry_id uuid not null,
  from_status text,
  to_status text not null,
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint finance_events_entry_fk foreign key (entry_id, company_id)
    references public.finance_entries(id, company_id) on delete restrict
);
create index finance_entry_events_idx on public.finance_entry_events(entry_id, created_at);

alter table public.finance_suppliers enable row level security;
alter table public.finance_payment_rules enable row level security;
alter table public.finance_entries enable row level security;
alter table public.finance_documents enable row level security;
alter table public.finance_entry_events enable row level security;

-- Si el esquema de subcuentas ya fue integrado, respeta su permiso granular
-- de Finanzas. En la base de esta rama aún sólo existe el gerente dueño.
create or replace function public.finance_can_access(p_company uuid)
returns boolean language plpgsql stable security invoker set search_path = public as $$
declare v_allowed boolean;
begin
  if to_regprocedure('public.auth_can_see_commercials(uuid)') is not null then
    execute 'select public.auth_can_see_commercials($1)' into v_allowed using p_company;
    return coalesce(v_allowed, false);
  end if;
  return public.auth_is_company_manager(p_company);
end $$;
revoke all on function public.finance_can_access(uuid) from public, anon;
grant execute on function public.finance_can_access(uuid) to authenticated;

grant select, insert, update on public.finance_suppliers, public.finance_payment_rules,
  public.finance_entries to authenticated;
grant select, insert on public.finance_documents to authenticated;
grant select on public.finance_entry_events to authenticated;

create policy finance_suppliers_read on public.finance_suppliers for select to authenticated
  using (public.finance_can_access(company_id));
create policy finance_suppliers_insert on public.finance_suppliers for insert to authenticated
  with check (public.finance_can_access(company_id));
create policy finance_suppliers_update on public.finance_suppliers for update to authenticated
  using (public.finance_can_access(company_id)) with check (public.finance_can_access(company_id));
create policy finance_rules_read on public.finance_payment_rules for select to authenticated
  using (public.finance_can_access(company_id));
create policy finance_rules_insert on public.finance_payment_rules for insert to authenticated
  with check (public.finance_can_access(company_id));
create policy finance_rules_update on public.finance_payment_rules for update to authenticated
  using (public.finance_can_access(company_id)) with check (public.finance_can_access(company_id));
create policy finance_entries_read on public.finance_entries for select to authenticated
  using (public.finance_can_access(company_id));
create policy finance_entries_insert on public.finance_entries for insert to authenticated
  with check (public.finance_can_access(company_id) and created_by = (select auth.uid()) and status = 'review');
create policy finance_entries_update on public.finance_entries for update to authenticated
  using (public.finance_can_access(company_id))
  with check (public.finance_can_access(company_id) and updated_by = (select auth.uid()));
create policy finance_documents_read on public.finance_documents for select to authenticated
  using (public.finance_can_access(company_id));
create policy finance_documents_insert on public.finance_documents for insert to authenticated
  with check (public.finance_can_access(company_id) and uploaded_by = (select auth.uid()));
create policy finance_events_read on public.finance_entry_events for select to authenticated
  using (public.finance_can_access(company_id));

-- La fecha de previsión sólo nace de trabajo terminado. Los anticipos exigen
-- una fecha explícita. El día de pago es siempre el siguiente, nunca el mismo.
create or replace function public.finance_next_payment_date(p_finished date, p_weekday smallint)
returns date language sql immutable strict as $$
  select p_finished + case when (p_weekday - extract(isodow from p_finished)::integer + 7) % 7 = 0
    then 7 else (p_weekday - extract(isodow from p_finished)::integer + 7) % 7 end
$$;
revoke all on function public.finance_next_payment_date(date, smallint) from public, anon;
grant execute on function public.finance_next_payment_date(date, smallint) to authenticated;

create or replace function public.finance_schedule_entry()
returns trigger language plpgsql set search_path = public as $$
declare v_finished date; v_weekday smallint;
begin
  if new.direction <> 'payable' or new.installment = 'advance'
     or new.order_id is null or new.zone is null then return new; end if;
  select (w.finalized_at at time zone case when c.country = 'BR' then 'America/Sao_Paulo'
              else 'America/Argentina/Buenos_Aires' end)::date into v_finished
    from public.work_orders w join public.companies c on c.id = w.company_id
    where w.id = new.order_id and w.company_id = new.company_id and w.status = 'finalizada';
  if v_finished is null then
    new.due_on := null;
    return new;
  end if;
  select case when new.zone = 'amba' then coalesce(amba_weekday, 1)
              else coalesce(interior_weekday, 2) end into v_weekday
    from public.finance_payment_rules where company_id = new.company_id;
  new.due_on := public.finance_next_payment_date(v_finished,
    coalesce(v_weekday, case when new.zone = 'amba' then 1 else 2 end)::smallint);
  return new;
end $$;
create trigger finance_schedule_entry_before_insert before insert on public.finance_entries
  for each row execute function public.finance_schedule_entry();

create or replace function public.finance_schedule_on_completion()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_finished date;
begin
  if new.status = 'finalizada' and new.finalized_at is not null
     and (old.status is distinct from 'finalizada' or old.finalized_at is distinct from new.finalized_at) then
    select (new.finalized_at at time zone case when c.country = 'BR' then 'America/Sao_Paulo'
                  else 'America/Argentina/Buenos_Aires' end)::date into v_finished
      from public.companies c where c.id = new.company_id;
    update public.finance_entries e set due_on = public.finance_next_payment_date(
      v_finished,
      (case when e.zone = 'amba' then coalesce(r.amba_weekday, 1)
            else coalesce(r.interior_weekday, 2) end)::smallint), updated_at = now()
    from public.finance_payment_rules r
    where e.order_id = new.id and e.company_id = new.company_id
      and r.company_id = new.company_id and e.direction = 'payable'
      and e.installment <> 'advance' and e.zone is not null
      and e.status in ('review','approved');
    -- Empresas sin fila de reglas conservan los valores por defecto.
    update public.finance_entries e set due_on = public.finance_next_payment_date(
      v_finished, (case when e.zone = 'amba' then 1 else 2 end)::smallint), updated_at = now()
    where e.order_id = new.id and e.company_id = new.company_id
      and not exists (select 1 from public.finance_payment_rules r where r.company_id = new.company_id)
      and e.direction = 'payable' and e.installment <> 'advance'
      and e.zone is not null and e.status in ('review','approved');
  end if;
  return new;
end $$;
revoke all on function public.finance_schedule_on_completion() from public, anon, authenticated;
create trigger finance_schedule_order_after_update after update of status, finalized_at on public.work_orders
  for each row execute function public.finance_schedule_on_completion();

create or replace function public.finance_validate_entry()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'review' or (new.installment = 'advance' and new.due_on is null) then
      raise exception 'El asiento debe comenzar en revisión; un anticipo requiere fecha';
    end if;
    return new;
  end if;
  if new.company_id <> old.company_id or new.direction <> old.direction or
     new.order_id is distinct from old.order_id or new.supplier_id is distinct from old.supplier_id or
     new.client_id is distinct from old.client_id or new.amount <> old.amount or new.currency <> old.currency then
    raise exception 'No se pueden cambiar identidad, contraparte o importe; anule y cree otro asiento';
  end if;
  if old.status in ('settled','void') then
    raise exception 'Un asiento cerrado no puede modificarse';
  end if;
  if new.status = 'approved' and old.status <> 'approved' and not exists (
    select 1 from public.finance_documents d where d.entry_id = new.id and d.kind = 'invoice') then
    raise exception 'Se requiere factura para aprobar';
  end if;
  if new.status = 'settled' and old.status <> 'settled' then
    if old.status <> 'approved' then raise exception 'Primero se debe aprobar'; end if;
    if not exists (select 1 from public.finance_documents d where d.entry_id = new.id
      and d.kind = case when new.direction = 'payable' then 'transfer_proof' else 'bank_credit' end) then
      raise exception 'Se requiere comprobante de transferencia o acreditación real';
    end if;
  end if;
  if new.status is distinct from old.status and not (
    (old.status = 'review' and new.status in ('approved','void')) or
    (old.status = 'approved' and new.status in ('settled','void'))
  ) then raise exception 'Transición financiera inválida'; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger finance_validate_entry_before_write before insert or update on public.finance_entries
  for each row execute function public.finance_validate_entry();

create or replace function public.finance_audit_entry()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.finance_entry_events(company_id, entry_id, from_status, to_status, changed_by)
    values (new.company_id, new.id, null, new.status, auth.uid());
  elsif old.status is distinct from new.status then
    insert into public.finance_entry_events(company_id, entry_id, from_status, to_status, changed_by)
    values (new.company_id, new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end $$;
revoke all on function public.finance_audit_entry() from public, anon, authenticated;
create trigger finance_audit_entry_after_write after insert or update on public.finance_entries
  for each row execute function public.finance_audit_entry();

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('finance-private', 'finance-private', false, 10485760,
  array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy finance_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'finance-private' and public.finance_can_access(public.auth_company())
    and (storage.foldername(name))[1] = public.auth_company()::text);
create policy finance_storage_read on storage.objects for select to authenticated
  using (bucket_id = 'finance-private' and public.finance_can_access(public.auth_company())
    and (storage.foldername(name))[1] = public.auth_company()::text);
create policy finance_storage_cleanup on storage.objects for delete to authenticated
  using (bucket_id = 'finance-private' and public.finance_can_access(public.auth_company())
    and (storage.foldername(name))[1] = public.auth_company()::text
    and not exists (select 1 from public.finance_documents d where d.storage_path = name));

-- No se publica una vista sin security_invoker: la caja lee la misma RLS.
create view public.finance_cash_movements with (security_invoker = true) as
select id, company_id, direction, settled_on, amount, currency, order_id, supplier_id,
  client_id, category, description
from public.finance_entries where status = 'settled';
grant select on public.finance_cash_movements to authenticated;

-- Tablero gerencial: trazabilidad de asignación, reprogramaciones, visitas e incidencias.

alter table public.work_orders
  add column assigned_at timestamptz,
  add column original_scheduled_date date,
  add column reschedule_count integer not null default 0
    check (reschedule_count >= 0),
  add column visit_count integer not null default 0
    check (visit_count >= 0);

update public.work_orders
set
  assigned_at = case
    when assigned_installer_id is not null then created_at
    else null
  end,
  original_scheduled_date = scheduled_date,
  visit_count = case
    when status in ('en_proceso', 'en_revision', 'finalizada') then 1
    else 0
  end;

create or replace function public.track_order_operational_metadata()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.assigned_installer_id is not null then
      new.assigned_at := coalesce(new.assigned_at, now());
    end if;
    new.original_scheduled_date :=
      coalesce(new.original_scheduled_date, new.scheduled_date);
    return new;
  end if;

  if old.assigned_installer_id is null
     and new.assigned_installer_id is not null
     and new.assigned_at is null then
    new.assigned_at := now();
  end if;

  if old.scheduled_date is distinct from new.scheduled_date then
    new.original_scheduled_date :=
      coalesce(old.original_scheduled_date, old.scheduled_date, new.scheduled_date);
    if old.scheduled_date is not null then
      new.reschedule_count := old.reschedule_count + 1;
    end if;
  end if;

  if old.status <> 'en_proceso' and new.status = 'en_proceso' then
    new.visit_count := old.visit_count + 1;
  end if;

  return new;
end;
$$;

create trigger work_orders_track_operational_metadata
  before insert or update of assigned_installer_id, scheduled_date, status
  on public.work_orders
  for each row execute function public.track_order_operational_metadata();

create index work_orders_company_assigned_at_idx
  on public.work_orders (company_id, assigned_at);
create index work_orders_company_reschedules_idx
  on public.work_orders (company_id, reschedule_count)
  where reschedule_count > 0;

create table public.order_incidents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  company_id uuid not null references public.companies (id) on delete cascade,
  category text not null check (category in (
    'failed_visit',
    'missing_materials',
    'client_absent',
    'technical_issue',
    'revisit_required',
    'complaint',
    'rejected_work',
    'incomplete_work',
    'other'
  )),
  severity text not null default 'medium'
    check (severity in ('low', 'medium', 'high', 'critical')),
  description text not null default '',
  requires_revisit boolean not null default false,
  status text not null default 'open'
    check (status in ('open', 'resolved')),
  created_by uuid references public.profiles (id) on delete set null,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_incidents_order_company_fk
    foreign key (order_id, company_id)
    references public.work_orders (id, company_id) on delete cascade,
  constraint order_incidents_resolution_check check (
    (status = 'open' and resolved_at is null)
    or (status = 'resolved' and resolved_at is not null)
  )
);

create index order_incidents_company_status_idx
  on public.order_incidents (company_id, status, severity);
create index order_incidents_order_idx
  on public.order_incidents (order_id, created_at desc);

create or replace function public.touch_order_incident_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger order_incidents_touch_updated_at
  before update on public.order_incidents
  for each row execute function public.touch_order_incident_updated_at();

alter table public.order_incidents enable row level security;

create policy order_incidents_company_all on public.order_incidents
  for all
  using (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  )
  with check (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  );
create policy order_incidents_installer_read on public.order_incidents
  for select using (
    exists (
      select 1
      from public.work_orders w
      where w.id = order_id
        and w.company_id = company_id
        and w.assigned_installer_id = auth.uid()
    )
  );

create policy order_incidents_installer_insert on public.order_incidents
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.work_orders w
      where w.id = order_id
        and w.company_id = company_id
        and w.assigned_installer_id = auth.uid()
    )
  );

-- Expansión operativa: proyectos multizona, ficha permanente de locaciones,
-- disponibilidad de instaladores, numeración regional y base de Calendar.

-- ---------------------------------------------------------------------------
-- Proyectos: alcance contratado, geografía y modalidad económica.
-- ---------------------------------------------------------------------------
alter table public.projects
  add column country text,
  add column zones text[] not null default '{}',
  add column planned_installations integer not null default 0,
  add column billing_mode text not null default 'per_installation',
  add column contract_amount numeric(14, 2),
  add column currency text,
  add column updated_at timestamptz not null default now();

update public.projects p
set
  country = c.country,
  currency = case when c.country = 'BR' then 'BRL' else 'ARS' end,
  zones = coalesce(
    (
      select array_agg(distinct s.zone order by s.zone)
      from public.sites s
      where s.project_id = p.id and nullif(trim(s.zone), '') is not null
    ),
    '{}'
  ),
  planned_installations = (
    select count(*)::integer from public.sites s where s.project_id = p.id
  )
from public.companies c
where c.id = p.company_id;

alter table public.projects
  alter column country set not null,
  alter column country set default 'AR',
  alter column currency set not null,
  alter column currency set default 'ARS',
  add constraint projects_country_check check (country in ('AR', 'BR')),
  add constraint projects_currency_check check (currency in ('ARS', 'BRL')),
  add constraint projects_billing_mode_check
    check (billing_mode in ('project', 'per_installation')),
  add constraint projects_planned_installations_check
    check (planned_installations >= 0),
  add constraint projects_contract_amount_check
    check (contract_amount is null or contract_amount >= 0),
  add constraint projects_schedule_check
    check (ends_at is null or starts_at is null or ends_at >= starts_at);

create or replace function public.touch_project_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.currency := case when new.country = 'BR' then 'BRL' else 'ARS' end;
  return new;
end;
$$;

create trigger projects_touch_updated_at
  before insert or update on public.projects
  for each row execute function public.touch_project_updated_at();

-- ---------------------------------------------------------------------------
-- Locaciones: archivo reversible y ficha operativa permanente.
-- ---------------------------------------------------------------------------
alter table public.sites
  add column archived_at timestamptz,
  add column contact_name text not null default '',
  add column contact_phone text not null default '',
  add column contact_email text not null default '',
  add column opening_hours text not null default '',
  add column access_notes text not null default '',
  add column parking_notes text not null default '',
  add column technical_notes text not null default '',
  add column risk_notes text not null default '',
  add column permanent_notes text not null default '',
  add column updated_at timestamptz not null default now(),
  add constraint sites_id_company_key unique (id, company_id),
  add constraint sites_lat_check check (lat is null or lat between -90 and 90),
  add constraint sites_lng_check check (lng is null or lng between -180 and 180);

create index sites_active_project_idx
  on public.sites (project_id, name) where archived_at is null;

create or replace function public.touch_site_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger sites_touch_updated_at
  before update on public.sites
  for each row execute function public.touch_site_updated_at();

create table public.site_attachments (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null,
  company_id uuid not null references public.companies (id) on delete cascade,
  storage_path text not null,
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text not null check (
    mime_type like 'image/%' or mime_type = 'application/pdf'
  ),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint site_attachments_site_company_fk
    foreign key (site_id, company_id)
    references public.sites (id, company_id) on delete cascade,
  constraint site_attachments_path_key unique (site_id, storage_path)
);

create index site_attachments_site_idx
  on public.site_attachments (site_id, created_at);

alter table public.site_attachments enable row level security;

create policy site_attachments_company_all on public.site_attachments
  for all
  using (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  )
  with check (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  );

create policy site_attachments_installer_read on public.site_attachments
  for select using (
    exists (
      select 1 from public.work_orders w
      where w.site_id = site_attachments.site_id
        and w.assigned_installer_id = auth.uid()
    )
  );

-- El mismo bucket aloja evidencia de órdenes y archivos permanentes del local.
-- Extendemos la lectura para que un instalador asignado a cualquier orden del
-- local pueda abrir los adjuntos de su ficha.
drop policy if exists evidence_read on storage.objects;
create policy evidence_read on storage.objects
  for select using (
    bucket_id = 'evidence'
    and (
      (storage.foldername(name))[1] = public.auth_company()::text
      or owner = auth.uid()
      or exists (
        select 1 from public.work_orders w
        where w.id = ((storage.foldername(name))[2])::uuid
          and w.assigned_installer_id = auth.uid()
      )
      or exists (
        select 1 from public.work_orders w
        where w.site_id = ((storage.foldername(name))[2])::uuid
          and w.assigned_installer_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Órdenes: cierre real y numeración atómica por zona.
-- ---------------------------------------------------------------------------
alter table public.work_orders
  add column finalized_at timestamptz;

update public.work_orders
set finalized_at = updated_at
where status = 'finalizada' and finalized_at is null;

create index work_orders_company_schedule_idx
  on public.work_orders (company_id, scheduled_date, scheduled_end_date);
create index work_orders_company_finalized_idx
  on public.work_orders (company_id, finalized_at)
  where finalized_at is not null;

create or replace function public.validate_order_transition()
returns trigger
language plpgsql
as $$
begin
  if old.status = new.status then
    new.updated_at := now();
    return new;
  end if;
  if not (
    (old.status = 'pendiente'    and new.status in ('relevamiento', 'planificada', 'cancelada')) or
    (old.status = 'relevamiento' and new.status in ('planificada', 'cancelada')) or
    (old.status = 'planificada'  and new.status in ('en_proceso', 'cancelada')) or
    (old.status = 'en_proceso'   and new.status in ('en_revision')) or
    (old.status = 'en_revision'  and new.status in ('finalizada', 'en_proceso'))
  ) then
    raise exception 'transición de estado inválida: % → %', old.status, new.status;
  end if;
  if new.status = 'finalizada' then
    new.finalized_at := coalesce(new.finalized_at, now());
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create table public.order_sequences (
  company_id uuid not null references public.companies (id) on delete cascade,
  zone_code text not null,
  current_value integer not null,
  updated_at timestamptz not null default now(),
  primary key (company_id, zone_code)
);

alter table public.order_sequences enable row level security;

create policy order_sequences_company_read on public.order_sequences
  for select using (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  );

alter table public.work_orders
  drop constraint if exists work_orders_order_number_key;

create or replace function public.next_regional_order_number(
  p_company_id uuid,
  p_site_id uuid
)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_country text;
  v_zone text;
  v_state text;
  v_code text;
  v_start integer;
  v_value integer;
begin
  select p.country, upper(trim(s.zone)), upper(trim(s.state))
    into v_country, v_zone, v_state
  from public.sites s
  join public.projects p on p.id = s.project_id
  where s.id = p_site_id and s.company_id = p_company_id;

  if not found then
    raise exception 'La instalación no pertenece a la empresa';
  end if;

  if v_country = 'BR' then
    v_code := regexp_replace(coalesce(nullif(v_state, ''), nullif(v_zone, ''), 'BR'), '[^A-Z0-9]', '', 'g');
    v_code := 'BR-' || left(v_code, 3);
    v_start := 1;
  elsif coalesce(v_zone, '') like 'AMBA%' then
    v_code := 'AMBA';
    v_start := 13000;
  else
    v_code := 'INT';
    v_start := 700;
  end if;

  insert into public.order_sequences (company_id, zone_code, current_value)
  values (p_company_id, v_code, v_start)
  on conflict (company_id, zone_code) do update
    set current_value = public.order_sequences.current_value + 1,
        updated_at = now()
  returning current_value into v_value;

  return v_code || '-' || case
    when v_code in ('AMBA', 'INT') then v_value::text
    else lpad(v_value::text, 5, '0')
  end;
end;
$$;

revoke all on function public.next_regional_order_number(uuid, uuid) from public;

create or replace function public.assign_order_number()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.order_number is null or new.order_number = '' then
    new.order_number := public.next_regional_order_number(new.company_id, new.site_id);
  end if;
  return new;
end;
$$;

-- Los datos existentes son demo: se renumeran en orden de creación para que
-- toda la muestra respete la nueva convención regional.
truncate table public.order_sequences;
do $$
declare
  v_order record;
begin
  for v_order in
    select id, company_id, site_id
    from public.work_orders
    order by company_id, created_at, id
  loop
    update public.work_orders
    set order_number = public.next_regional_order_number(
      v_order.company_id,
      v_order.site_id
    )
    where id = v_order.id;
  end loop;
end;
$$;

alter table public.work_orders
  alter column order_number set not null,
  add constraint work_orders_company_order_number_key
    unique (company_id, order_number);

-- ---------------------------------------------------------------------------
-- Disponibilidad: horario habitual + excepciones justificadas.
-- ---------------------------------------------------------------------------
create table public.installer_weekly_availability (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  installer_id uuid not null references public.installers (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  timezone text not null default 'America/Argentina/Buenos_Aires',
  created_at timestamptz not null default now(),
  constraint installer_weekly_time_check check (ends_at > starts_at),
  constraint installer_weekly_unique
    unique (company_id, installer_id, weekday, starts_at, ends_at)
);

create index installer_weekly_lookup_idx
  on public.installer_weekly_availability (company_id, installer_id, weekday);

alter table public.installer_weekly_availability enable row level security;

create policy installer_weekly_manager_read
  on public.installer_weekly_availability for select using (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  );

create policy installer_weekly_own_all
  on public.installer_weekly_availability for all
  using (
    installer_id = auth.uid()
    and exists (
      select 1 from public.company_installers ci
      where ci.company_id = installer_weekly_availability.company_id
        and ci.installer_id = auth.uid()
        and ci.status = 'active'
    )
  )
  with check (
    installer_id = auth.uid()
    and exists (
      select 1 from public.company_installers ci
      where ci.company_id = installer_weekly_availability.company_id
        and ci.installer_id = auth.uid()
        and ci.status = 'active'
    )
  );

create table public.installer_unavailability (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  installer_id uuid not null references public.installers (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null check (char_length(trim(reason)) between 2 and 500),
  created_at timestamptz not null default now(),
  constraint installer_unavailability_time_check check (ends_at > starts_at)
);

create index installer_unavailability_lookup_idx
  on public.installer_unavailability (company_id, installer_id, starts_at, ends_at);

alter table public.installer_unavailability enable row level security;

create policy installer_unavailability_manager_read
  on public.installer_unavailability for select using (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  );

create policy installer_unavailability_own_all
  on public.installer_unavailability for all
  using (
    installer_id = auth.uid()
    and exists (
      select 1 from public.company_installers ci
      where ci.company_id = installer_unavailability.company_id
        and ci.installer_id = auth.uid()
        and ci.status = 'active'
    )
  )
  with check (
    installer_id = auth.uid()
    and exists (
      select 1 from public.company_installers ci
      where ci.company_id = installer_unavailability.company_id
        and ci.installer_id = auth.uid()
        and ci.status = 'active'
    )
  );

create or replace function public.replace_installer_weekly_availability(
  p_company_id uuid,
  p_entries jsonb
)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if public.auth_role() is distinct from 'installer' then
    raise exception 'Solo un instalador puede editar su disponibilidad';
  end if;
  if not exists (
    select 1 from public.company_installers ci
    where ci.company_id = p_company_id
      and ci.installer_id = auth.uid()
      and ci.status = 'active'
  ) then
    raise exception 'El instalador no pertenece al equipo activo';
  end if;

  delete from public.installer_weekly_availability
  where company_id = p_company_id and installer_id = auth.uid();

  insert into public.installer_weekly_availability (
    company_id, installer_id, weekday, starts_at, ends_at, timezone
  )
  select
    p_company_id,
    auth.uid(),
    entry.weekday,
    entry.starts_at,
    entry.ends_at,
    coalesce(nullif(entry.timezone, ''), 'America/Argentina/Buenos_Aires')
  from jsonb_to_recordset(coalesce(p_entries, '[]'::jsonb)) as entry(
    weekday smallint,
    starts_at time,
    ends_at time,
    timezone text
  )
  where entry.weekday between 0 and 6 and entry.ends_at > entry.starts_at;
end;
$$;

revoke all on function public.replace_installer_weekly_availability(uuid, jsonb) from public;
grant execute on function public.replace_installer_weekly_availability(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Google Calendar: tokens cifrados por la aplicación y eventos por conexión.
-- ---------------------------------------------------------------------------
create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  google_email text not null default '',
  calendar_id text not null default 'primary',
  encrypted_access_token text not null,
  encrypted_refresh_token text not null,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_connections_user_key unique (user_id)
);

alter table public.calendar_connections enable row level security;

create policy calendar_connections_own_all on public.calendar_connections
  for all
  using (
    user_id = auth.uid()
    and company_id = public.auth_company()
    and public.auth_role() = 'company_manager'
  )
  with check (
    user_id = auth.uid()
    and company_id = public.auth_company()
    and public.auth_role() = 'company_manager'
  );

create table public.calendar_order_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  connection_id uuid not null references public.calendar_connections (id) on delete cascade,
  order_id uuid not null,
  google_event_id text not null,
  last_synced_at timestamptz not null default now(),
  constraint calendar_order_events_order_company_fk
    foreign key (order_id, company_id)
    references public.work_orders (id, company_id) on delete cascade,
  constraint calendar_order_events_unique unique (connection_id, order_id)
);

alter table public.calendar_order_events enable row level security;

create policy calendar_order_events_own_all on public.calendar_order_events
  for all
  using (
    exists (
      select 1 from public.calendar_connections cc
      where cc.id = calendar_order_events.connection_id
        and cc.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.calendar_connections cc
      where cc.id = calendar_order_events.connection_id
        and cc.user_id = auth.uid()
    )
  );

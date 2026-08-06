-- R2 — Fundación aditiva de locaciones canónicas.
--
-- `sites` continúa siendo la proyección legacy ligada a un proyecto. Esta
-- migración agrega una identidad permanente y asociaciones explícitas, pero no
-- borra columnas, no cambia lecturas existentes y no fuerza un cutover.

-- ---------------------------------------------------------------------------
-- 1. Claves tenant/cliente y normalización de la referencia confiable.
-- ---------------------------------------------------------------------------

create or replace function public.normalize_location_external_ref(p_value text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select nullif(
    regexp_replace(lower(btrim(p_value)), '[^a-z0-9]+', '', 'g'),
    ''
  )
$$;

revoke all on function public.normalize_location_external_ref(text) from public;
grant execute on function public.normalize_location_external_ref(text)
  to authenticated, service_role;

alter table public.clients
  add constraint clients_id_company_key unique (id, company_id);

alter table public.projects
  add constraint projects_id_company_client_key
  unique (id, company_id, client_id);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  client_id uuid not null,
  external_ref text,
  normalized_external_ref text generated always as (
    public.normalize_location_external_ref(external_ref)
  ) stored,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  address text not null default '',
  city text not null default '',
  state text not null default '',
  zone text not null default '',
  country text not null default 'AR' check (country in ('AR', 'BR')),
  lat numeric,
  lng numeric,
  contact_name text not null default '',
  contact_phone text not null default '',
  contact_email text not null default '',
  opening_hours text not null default '',
  access_notes text not null default '',
  parking_notes text not null default '',
  technical_notes text not null default '',
  risk_notes text not null default '',
  permanent_notes text not null default '',
  source text not null default 'manual'
    check (source in ('manual', 'backfill', 'import', 'opportunity')),
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint locations_client_company_fk
    foreign key (client_id, company_id)
    references public.clients (id, company_id),
  constraint locations_id_company_key unique (id, company_id),
  constraint locations_id_company_client_key
    unique (id, company_id, client_id),
  constraint locations_external_ref_not_blank
    check (external_ref is null or btrim(external_ref) <> ''),
  constraint locations_lat_check check (lat is null or lat between -90 and 90),
  constraint locations_lng_check check (lng is null or lng between -180 and 180)
);

create unique index locations_canonical_ref_idx
  on public.locations (company_id, client_id, normalized_external_ref)
  where normalized_external_ref is not null;
create index locations_company_client_name_idx
  on public.locations (company_id, client_id, name);
create index locations_company_geography_idx
  on public.locations (company_id, state, city);
create index locations_active_idx
  on public.locations (company_id, client_id, updated_at desc)
  where archived_at is null;

create table public.project_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  client_id uuid not null,
  project_id uuid not null,
  location_id uuid not null,
  scope text not null default '',
  unit_quantity integer not null default 1 check (unit_quantity > 0),
  status text not null default 'active'
    check (status in ('planned', 'active', 'paused', 'completed', 'cancelled', 'archived')),
  contract_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(contract_data) = 'object'),
  operational_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(operational_snapshot) = 'object'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_locations_project_tenant_client_fk
    foreign key (project_id, company_id, client_id)
    references public.projects (id, company_id, client_id)
    on delete cascade,
  constraint project_locations_location_tenant_client_fk
    foreign key (location_id, company_id, client_id)
    references public.locations (id, company_id, client_id),
  constraint project_locations_project_location_key
    unique (project_id, location_id)
);

create index project_locations_location_idx
  on public.project_locations (location_id, project_id);
create index project_locations_company_status_idx
  on public.project_locations (company_id, status, project_id);

create table public.location_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  client_id uuid not null,
  location_id uuid not null,
  storage_path text not null check (btrim(storage_path) <> ''),
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text not null check (
    mime_type like 'image/%' or mime_type = 'application/pdf'
  ),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  category text not null default 'general'
    check (category in ('general', 'permit', 'access', 'risk', 'plan', 'other')),
  description text not null default '',
  uploaded_by uuid references public.profiles (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint location_attachments_location_tenant_client_fk
    foreign key (location_id, company_id, client_id)
    references public.locations (id, company_id, client_id),
  constraint location_attachments_storage_key unique (company_id, storage_path),
  constraint location_attachments_document_scope_key
    unique (id, location_id, company_id, client_id)
);

create index location_attachments_location_idx
  on public.location_attachments (location_id, created_at desc);
create index location_attachments_active_category_idx
  on public.location_attachments (company_id, category, location_id)
  where archived_at is null;

create table public.location_requirements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  client_id uuid not null,
  location_id uuid not null,
  kind text not null check (kind in ('requirement', 'permit')),
  requirement_type text not null
    check (char_length(btrim(requirement_type)) between 1 and 120),
  status text not null default 'pending'
    check (status in ('pending', 'valid', 'expired', 'rejected', 'not_required')),
  valid_from date,
  expires_on date,
  responsible_user_id uuid references public.profiles (id) on delete set null,
  document_attachment_id uuid,
  notes text not null default '',
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint location_requirements_validity_check
    check (expires_on is null or valid_from is null or expires_on >= valid_from),
  constraint location_requirements_location_tenant_client_fk
    foreign key (location_id, company_id, client_id)
    references public.locations (id, company_id, client_id),
  constraint location_requirements_document_scope_fk
    foreign key (
      document_attachment_id, location_id, company_id, client_id
    ) references public.location_attachments (
      id, location_id, company_id, client_id
    )
);

create index location_requirements_location_status_idx
  on public.location_requirements (location_id, status, expires_on);
create index location_requirements_expiry_idx
  on public.location_requirements (company_id, expires_on)
  where expires_on is not null and status = 'valid';

create table public.location_change_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  client_id uuid not null,
  location_id uuid not null,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_context text not null
    check (actor_context in ('company_manager', 'coordinator', 'installer', 'system', 'migration')),
  event_type text not null check (char_length(btrim(event_type)) between 1 and 80),
  status text not null default 'applied'
    check (status in ('pending', 'applied', 'approved', 'rejected')),
  changed_fields text[] not null default '{}',
  before_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(before_data) = 'object'),
  after_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(after_data) = 'object'),
  note text not null default '',
  client_created_at timestamptz,
  created_at timestamptz not null default now(),
  constraint location_change_events_location_tenant_client_fk
    foreign key (location_id, company_id, client_id)
    references public.locations (id, company_id, client_id)
);

create index location_change_events_timeline_idx
  on public.location_change_events (location_id, created_at desc, id);
create index location_change_events_pending_idx
  on public.location_change_events (company_id, status, created_at)
  where status = 'pending';

-- Tabla durable de conciliación: ninguna fila incompleta se fusiona por nombre
-- o dirección. La resolución será explícita y auditable en un corte posterior.
create table public.location_backfill_issues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  source_site_id uuid references public.sites (id) on delete set null,
  resolved_location_id uuid,
  issue_code text not null check (
    issue_code in ('missing_client', 'missing_external_ref', 'conflicting_source_data')
  ),
  normalized_external_ref text,
  source_site_ids uuid[] not null default '{}',
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'resolved', 'ignored')),
  resolution_note text not null default '',
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint location_backfill_issues_resolution_fk
    foreign key (resolved_location_id, company_id)
    references public.locations (id, company_id),
  constraint location_backfill_issues_resolution_check check (
    (resolved_location_id is null or client_id is not null)
    and (
      (status = 'pending' and resolved_at is null and resolved_by is null)
      or (status in ('resolved', 'ignored') and resolved_at is not null)
    )
  ),
  constraint location_backfill_issues_source_code_key
    unique (source_site_id, issue_code)
);

create index location_backfill_issues_queue_idx
  on public.location_backfill_issues (company_id, status, issue_code, created_at);
create index location_backfill_issues_project_idx
  on public.location_backfill_issues (project_id, status)
  where project_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Compatibilidad con `sites` y defensas contra cruces de cliente.
-- ---------------------------------------------------------------------------

alter table public.sites
  add column location_id uuid,
  add constraint sites_location_fk
    foreign key (location_id)
    references public.locations (id)
    on delete set null;

create index sites_location_idx
  on public.sites (location_id, project_id)
  where location_id is not null;

create or replace function public.validate_site_canonical_location()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.location_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.locations l
    join public.projects p on p.id = new.project_id
    where l.id = new.location_id
      and l.company_id = new.company_id
      and p.company_id = new.company_id
      and p.client_id = l.client_id
  ) then
    raise exception 'La locación canónica no pertenece al tenant y cliente del proyecto';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_site_canonical_location() from public;

create trigger sites_validate_canonical_location
  before insert or update of project_id, company_id, location_id
  on public.sites
  for each row execute function public.validate_site_canonical_location();

create or replace function public.validate_project_canonical_client_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.sites s
    join public.locations l on l.id = s.location_id
    where s.project_id = old.id
      and (
        l.company_id is distinct from new.company_id
        or l.client_id is distinct from new.client_id
      )
  ) then
    raise exception 'El cambio dejaría locaciones vinculadas a otro tenant o cliente';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_project_canonical_client_change()
  from public;

create trigger projects_validate_canonical_client_change
  before update of company_id, client_id
  on public.projects
  for each row execute function public.validate_project_canonical_client_change();

create or replace function public.validate_location_canonical_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.sites s
    join public.projects p on p.id = s.project_id
    where s.location_id = old.id
      and (
        p.company_id is distinct from new.company_id
        or p.client_id is distinct from new.client_id
      )
  ) then
    raise exception 'El cambio dejaría proyecciones legacy en otro tenant o cliente';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_location_canonical_links() from public;

create trigger locations_validate_canonical_links
  before update of company_id, client_id
  on public.locations
  for each row execute function public.validate_location_canonical_links();

create or replace function public.validate_location_backfill_issue_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.client_id is not null and not exists (
    select 1
    from public.clients c
    where c.id = new.client_id
      and c.company_id = new.company_id
  ) then
    raise exception 'El cliente de revisión no pertenece al tenant';
  end if;

  if new.project_id is not null and not exists (
    select 1
    from public.projects p
    where p.id = new.project_id
      and p.company_id = new.company_id
      and (
        new.client_id is null
        or p.client_id = new.client_id
      )
  ) then
    raise exception 'El proyecto de revisión no pertenece al tenant y cliente';
  end if;

  if new.source_site_id is not null and not exists (
    select 1
    from public.sites s
    where s.id = new.source_site_id
      and s.company_id = new.company_id
      and (
        new.project_id is null
        or s.project_id = new.project_id
      )
  ) then
    raise exception 'El site de revisión no pertenece al tenant y proyecto';
  end if;

  if new.resolved_location_id is not null and not exists (
    select 1
    from public.locations l
    where l.id = new.resolved_location_id
      and l.company_id = new.company_id
      and (
        new.client_id is null
        or l.client_id = new.client_id
      )
  ) then
    raise exception 'La resolución apunta a una locación de otro alcance';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_location_backfill_issue_scope()
  from public;

create trigger location_backfill_issues_validate_scope
  before insert or update on public.location_backfill_issues
  for each row execute function public.validate_location_backfill_issue_scope();

create or replace function public.touch_canonical_location_record()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger locations_touch_updated_at
  before update on public.locations
  for each row execute function public.touch_canonical_location_record();
create trigger project_locations_touch_updated_at
  before update on public.project_locations
  for each row execute function public.touch_canonical_location_record();
create trigger location_attachments_touch_updated_at
  before update on public.location_attachments
  for each row execute function public.touch_canonical_location_record();
create trigger location_requirements_touch_updated_at
  before update on public.location_requirements
  for each row execute function public.touch_canonical_location_record();
create trigger location_backfill_issues_touch_updated_at
  before update on public.location_backfill_issues
  for each row execute function public.touch_canonical_location_record();

create or replace function public.audit_canonical_location_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_context text;
  v_changed_fields text[] := '{}';
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := to_jsonb(new) - 'updated_at';
begin
  if tg_op = 'UPDATE' then
    v_before := to_jsonb(old) - 'updated_at';
    select coalesce(array_agg(current_value.key order by current_value.key), '{}')
      into v_changed_fields
    from jsonb_each(v_after) current_value
    where v_before -> current_value.key is distinct from current_value.value;

    if cardinality(v_changed_fields) = 0 then
      return new;
    end if;
  else
    select coalesce(array_agg(key order by key), '{}')
      into v_changed_fields
    from jsonb_each(v_after);
  end if;

  v_actor_context := case
    when auth.uid() is null and new.source = 'backfill' then 'migration'
    when auth.uid() is null then 'system'
    when public.auth_role() = 'company_manager' then 'company_manager'
    when public.auth_has_company_role(new.company_id, 'coordinator') then 'coordinator'
    else 'system'
  end;

  insert into public.location_change_events (
    company_id,
    client_id,
    location_id,
    actor_id,
    actor_context,
    event_type,
    status,
    changed_fields,
    before_data,
    after_data
  ) values (
    new.company_id,
    new.client_id,
    new.id,
    auth.uid(),
    v_actor_context,
    case
      when tg_op = 'INSERT' and new.source = 'backfill' then 'backfilled'
      when tg_op = 'INSERT' then 'created'
      else 'updated'
    end,
    'applied',
    v_changed_fields,
    v_before,
    v_after
  );

  return new;
end;
$$;

revoke all on function public.audit_canonical_location_change() from public;

create trigger locations_audit_change
  after insert or update on public.locations
  for each row execute function public.audit_canonical_location_change();

-- ---------------------------------------------------------------------------
-- 3. Alcance por actor. Los datos permanentes sólo los administra el manager;
--    coordinación edita su asociación y propone cambios auditados.
-- ---------------------------------------------------------------------------

create or replace function public.can_read_location(p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.locations l
    where l.id = p_location_id
      and public.company_is_active(l.company_id)
      and (
        (
          public.auth_role() = 'company_manager'
          and l.company_id = public.auth_company()
        )
        or exists (
          select 1
          from public.project_locations pl
          where pl.location_id = l.id
            and pl.company_id = l.company_id
            and public.can_operate_project(pl.project_id)
        )
        or (
          public.auth_has_company_role(l.company_id, 'installer')
          and exists (
            select 1
            from public.sites s
            join public.work_orders w
              on w.site_id = s.id
             and w.company_id = s.company_id
            where s.location_id = l.id
              and s.company_id = l.company_id
              and w.assigned_installer_id = auth.uid()
          )
        )
      )
  )
$$;

revoke all on function public.can_read_location(uuid) from public;
grant execute on function public.can_read_location(uuid) to authenticated;

alter table public.locations enable row level security;
alter table public.project_locations enable row level security;
alter table public.location_attachments enable row level security;
alter table public.location_requirements enable row level security;
alter table public.location_change_events enable row level security;
alter table public.location_backfill_issues enable row level security;

create policy locations_actor_read on public.locations
  for select
  to authenticated
  using (public.can_read_location(id));

create policy locations_manager_insert on public.locations
  for insert
  to authenticated
  with check (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
    and created_by = auth.uid()
  );

create policy locations_manager_update on public.locations
  for update
  to authenticated
  using (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  )
  with check (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
    and updated_by = auth.uid()
  );

create policy project_locations_actor_read on public.project_locations
  for select
  to authenticated
  using (
    (
      public.auth_role() = 'company_manager'
      and company_id = public.auth_company()
    )
    or public.can_operate_project(project_id)
    or (
      public.auth_has_company_role(company_id, 'installer')
      and exists (
        select 1
        from public.sites s
        join public.work_orders w
          on w.site_id = s.id
         and w.company_id = s.company_id
        where s.project_id = project_locations.project_id
          and s.location_id = project_locations.location_id
          and w.assigned_installer_id = auth.uid()
      )
    )
  );

create policy project_locations_manager_insert on public.project_locations
  for insert
  to authenticated
  with check (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
    and created_by = auth.uid()
  );

create policy project_locations_manager_update on public.project_locations
  for update
  to authenticated
  using (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  )
  with check (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  );

create policy project_locations_coordinator_insert on public.project_locations
  for insert
  to authenticated
  with check (
    public.auth_has_company_role(company_id, 'coordinator')
    and public.can_operate_project(project_id)
    and public.can_read_location(location_id)
    and created_by = auth.uid()
  );

create policy project_locations_coordinator_update on public.project_locations
  for update
  to authenticated
  using (
    public.auth_has_company_role(company_id, 'coordinator')
    and public.can_operate_project(project_id)
  )
  with check (
    public.auth_has_company_role(company_id, 'coordinator')
    and public.can_operate_project(project_id)
    and public.can_read_location(location_id)
  );

create policy location_attachments_actor_read on public.location_attachments
  for select
  to authenticated
  using (public.can_read_location(location_id));

create policy location_attachments_manager_insert on public.location_attachments
  for insert
  to authenticated
  with check (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
    and uploaded_by = auth.uid()
  );

create policy location_attachments_manager_update on public.location_attachments
  for update
  to authenticated
  using (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  )
  with check (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  );

create policy location_requirements_actor_read on public.location_requirements
  for select
  to authenticated
  using (public.can_read_location(location_id));

create policy location_requirements_manager_insert on public.location_requirements
  for insert
  to authenticated
  with check (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
    and created_by = auth.uid()
  );

create policy location_requirements_manager_update on public.location_requirements
  for update
  to authenticated
  using (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  )
  with check (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  );

create policy location_change_events_actor_read on public.location_change_events
  for select
  to authenticated
  using (public.can_read_location(location_id));

create policy location_change_events_manager_insert on public.location_change_events
  for insert
  to authenticated
  with check (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
    and actor_id = auth.uid()
    and actor_context = 'company_manager'
  );

create policy location_change_events_field_proposal_insert
  on public.location_change_events
  for insert
  to authenticated
  with check (
    actor_id = auth.uid()
    and event_type = 'change_proposed'
    and status = 'pending'
    and (
      (
        actor_context = 'coordinator'
        and public.auth_has_company_role(company_id, 'coordinator')
        and exists (
          select 1
          from public.project_locations pl
          where pl.location_id = location_change_events.location_id
            and pl.company_id = location_change_events.company_id
            and public.can_operate_project(pl.project_id)
        )
      )
      or (
        actor_context = 'installer'
        and public.auth_has_company_role(company_id, 'installer')
        and exists (
          select 1
          from public.sites s
          join public.work_orders w
            on w.site_id = s.id
           and w.company_id = s.company_id
          where s.location_id = location_change_events.location_id
            and s.company_id = location_change_events.company_id
            and w.assigned_installer_id = auth.uid()
        )
      )
    )
  );

create policy location_backfill_issues_manager_read
  on public.location_backfill_issues
  for select
  to authenticated
  using (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  );

create policy location_backfill_issues_manager_update
  on public.location_backfill_issues
  for update
  to authenticated
  using (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  )
  with check (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
    and (
      status = 'pending'
      or resolved_by = auth.uid()
    )
  );

create policy location_backfill_issues_coordinator_read
  on public.location_backfill_issues
  for select
  to authenticated
  using (
    project_id is not null
    and public.auth_has_company_role(company_id, 'coordinator')
    and public.can_operate_project(project_id)
  );

revoke all on public.locations from anon;
revoke all on public.project_locations from anon;
revoke all on public.location_attachments from anon;
revoke all on public.location_requirements from anon;
revoke all on public.location_change_events from anon;
revoke all on public.location_backfill_issues from anon;

grant select, insert, update on public.locations to authenticated;
grant select, insert, update on public.project_locations to authenticated;
grant select, insert, update on public.location_attachments to authenticated;
grant select, insert, update on public.location_requirements to authenticated;
grant select, insert on public.location_change_events to authenticated;
grant select, update on public.location_backfill_issues to authenticated;

revoke delete on public.locations from authenticated;
revoke delete on public.project_locations from authenticated;
revoke delete on public.location_attachments from authenticated;
revoke delete on public.location_requirements from authenticated;
revoke update, delete on public.location_change_events from authenticated;
revoke insert, delete on public.location_backfill_issues from authenticated;

-- ---------------------------------------------------------------------------
-- 4. Backfill conservador y reanudable por clave confiable.
-- ---------------------------------------------------------------------------

-- Una sola identidad por (empresa, cliente, referencia normalizada). Elegimos
-- como snapshot inicial la proyección activa más recientemente actualizada.
-- Las diferencias entre copias no cambian el match: quedan en revisión abajo.
with source_rows as (
  select
    s.*,
    p.client_id,
    p.country,
    public.normalize_location_external_ref(s.external_ref) as normalized_ref,
    bool_or(s.archived_at is null) over (
      partition by
        s.company_id,
        p.client_id,
        public.normalize_location_external_ref(s.external_ref)
    ) as has_active_projection,
    min(s.created_at) over (
      partition by
        s.company_id,
        p.client_id,
        public.normalize_location_external_ref(s.external_ref)
    ) as first_seen_at,
    row_number() over (
      partition by
        s.company_id,
        p.client_id,
        public.normalize_location_external_ref(s.external_ref)
      order by
        (s.archived_at is null) desc,
        s.updated_at desc,
        s.created_at desc,
        s.id
    ) as source_rank
  from public.sites s
  join public.projects p
    on p.id = s.project_id
   and p.company_id = s.company_id
  where p.client_id is not null
    and public.normalize_location_external_ref(s.external_ref) is not null
)
insert into public.locations (
  company_id,
  client_id,
  external_ref,
  name,
  address,
  city,
  state,
  zone,
  country,
  lat,
  lng,
  contact_name,
  contact_phone,
  contact_email,
  opening_hours,
  access_notes,
  parking_notes,
  technical_notes,
  risk_notes,
  permanent_notes,
  source,
  archived_at,
  created_at,
  updated_at
)
select
  company_id,
  client_id,
  btrim(external_ref),
  name,
  address,
  city,
  state,
  zone,
  country,
  lat,
  lng,
  contact_name,
  contact_phone,
  contact_email,
  opening_hours,
  access_notes,
  parking_notes,
  technical_notes,
  risk_notes,
  permanent_notes,
  'backfill',
  case when has_active_projection then null else archived_at end,
  first_seen_at,
  updated_at
from source_rows
where source_rank = 1
on conflict (company_id, client_id, normalized_external_ref)
  where normalized_external_ref is not null
do nothing;

-- Sólo las filas con clave completa reciben location_id automáticamente.
update public.sites s
set location_id = l.id
from public.projects p,
     public.locations l
where p.id = s.project_id
  and p.company_id = s.company_id
  and p.client_id is not null
  and l.company_id = s.company_id
  and l.client_id = p.client_id
  and l.normalized_external_ref =
    public.normalize_location_external_ref(s.external_ref)
  and s.location_id is null;

insert into public.project_locations (
  company_id,
  client_id,
  project_id,
  location_id,
  unit_quantity,
  status,
  operational_snapshot,
  created_at,
  updated_at
)
select
  s.company_id,
  p.client_id,
  s.project_id,
  s.location_id,
  count(*)::integer,
  case
    when bool_and(s.archived_at is not null) then 'archived'
    else 'active'
  end,
  jsonb_build_object(
    'legacy_site_ids', jsonb_agg(s.id order by s.id)
  ),
  min(s.created_at),
  max(s.updated_at)
from public.sites s
join public.projects p
  on p.id = s.project_id
 and p.company_id = s.company_id
where s.location_id is not null
  and p.client_id is not null
group by s.company_id, p.client_id, s.project_id, s.location_id
on conflict (project_id, location_id) do nothing;

-- Sin cliente no existe una clave tenant+cliente válida: queda sin link.
insert into public.location_backfill_issues (
  company_id,
  client_id,
  project_id,
  source_site_id,
  issue_code,
  normalized_external_ref,
  source_site_ids,
  details
)
select
  s.company_id,
  null,
  s.project_id,
  s.id,
  'missing_client',
  public.normalize_location_external_ref(s.external_ref),
  array[s.id],
  jsonb_build_object(
    'name', s.name,
    'external_ref', s.external_ref,
    'address', s.address,
    'reason', 'project_without_client'
  )
from public.sites s
join public.projects p
  on p.id = s.project_id
 and p.company_id = s.company_id
where p.client_id is null
  and s.location_id is null
on conflict (source_site_id, issue_code) do nothing;

-- Con cliente pero sin referencia confiable tampoco se deduplica por nombre o
-- dirección. Esos campos se guardan sólo como contexto para revisión manual.
insert into public.location_backfill_issues (
  company_id,
  client_id,
  project_id,
  source_site_id,
  issue_code,
  source_site_ids,
  details
)
select
  s.company_id,
  p.client_id,
  s.project_id,
  s.id,
  'missing_external_ref',
  array[s.id],
  jsonb_build_object(
    'name', s.name,
    'address', s.address,
    'city', s.city,
    'state', s.state,
    'possible_source_site_ids', coalesce(
      (
        select jsonb_agg(candidate.id order by candidate.id)
        from public.sites candidate
        join public.projects candidate_project
          on candidate_project.id = candidate.project_id
         and candidate_project.company_id = candidate.company_id
        where candidate.id <> s.id
          and candidate.company_id = s.company_id
          and candidate_project.client_id = p.client_id
          and lower(btrim(candidate.name)) = lower(btrim(s.name))
          and lower(btrim(candidate.address)) = lower(btrim(s.address))
      ),
      '[]'::jsonb
    )
  )
from public.sites s
join public.projects p
  on p.id = s.project_id
 and p.company_id = s.company_id
where p.client_id is not null
  and public.normalize_location_external_ref(s.external_ref) is null
  and s.location_id is null
on conflict (source_site_id, issue_code) do nothing;

-- La referencia completa sí define el match. Si sus copias divergen, se
-- conserva el link seguro pero se registra qué identidad permanente reconciliar.
with keyed_sources as (
  select
    s.company_id,
    p.client_id,
    s.project_id,
    s.id as site_id,
    s.location_id,
    public.normalize_location_external_ref(s.external_ref) as normalized_ref,
    jsonb_build_object(
      'name', lower(btrim(s.name)),
      'address', lower(btrim(s.address)),
      'city', lower(btrim(s.city)),
      'state', lower(btrim(s.state)),
      'contact_name', lower(btrim(s.contact_name)),
      'contact_phone', btrim(s.contact_phone)
    ) as identity_snapshot
  from public.sites s
  join public.projects p
    on p.id = s.project_id
   and p.company_id = s.company_id
  where p.client_id is not null
    and s.location_id is not null
    and public.normalize_location_external_ref(s.external_ref) is not null
), conflict_groups as (
  select
    company_id,
    client_id,
    normalized_ref,
    (array_agg(site_id order by site_id))[1] as source_site_id,
    (array_agg(project_id order by site_id))[1] as project_id,
    (array_agg(location_id order by site_id))[1] as location_id,
    array_agg(site_id order by site_id) as source_site_ids,
    jsonb_agg(distinct identity_snapshot) as variants
  from keyed_sources
  group by company_id, client_id, normalized_ref
  having count(distinct identity_snapshot) > 1
)
insert into public.location_backfill_issues (
  company_id,
  client_id,
  project_id,
  source_site_id,
  resolved_location_id,
  issue_code,
  normalized_external_ref,
  source_site_ids,
  details
)
select
  company_id,
  client_id,
  project_id,
  source_site_id,
  location_id,
  'conflicting_source_data',
  normalized_ref,
  source_site_ids,
  jsonb_build_object(
    'matched_by', 'company_client_external_ref',
    'variants', variants
  )
from conflict_groups
on conflict (source_site_id, issue_code) do nothing;

create view public.location_backfill_report
with (security_invoker = true)
as
with site_counts as (
  select
    company_id,
    count(*)::bigint as total_sites,
    count(location_id)::bigint as linked_sites,
    count(*) filter (where location_id is null)::bigint as pending_sites
  from public.sites
  group by company_id
), issue_counts as (
  select
    company_id,
    count(*) filter (where status = 'pending')::bigint as pending_issues,
    count(*) filter (
      where status = 'pending' and issue_code = 'missing_client'
    )::bigint as missing_client,
    count(*) filter (
      where status = 'pending' and issue_code = 'missing_external_ref'
    )::bigint as missing_external_ref,
    count(*) filter (
      where status = 'pending' and issue_code = 'conflicting_source_data'
    )::bigint as conflicting_source_data
  from public.location_backfill_issues
  group by company_id
)
select
  sc.company_id,
  sc.total_sites,
  sc.linked_sites,
  sc.pending_sites,
  coalesce(ic.pending_issues, 0) as pending_issues,
  coalesce(ic.missing_client, 0) as missing_client,
  coalesce(ic.missing_external_ref, 0) as missing_external_ref,
  coalesce(ic.conflicting_source_data, 0) as conflicting_source_data
from site_counts sc
left join issue_counts ic on ic.company_id = sc.company_id;

revoke all on public.location_backfill_report from anon;
grant select on public.location_backfill_report to authenticated;

comment on table public.locations is
  'Identidad física permanente por tenant y cliente; no depende del ciclo de un proyecto.';
comment on table public.project_locations is
  'Asociación contractual/operativa entre un proyecto y una locación canónica.';
comment on column public.sites.location_id is
  'FK de compatibilidad hacia locations; sites sigue siendo la proyección legacy durante el dual-read.';
comment on table public.location_backfill_issues is
  'Cola durable de filas no deduplicables automáticamente y divergencias a reconciliar.';
comment on view public.location_backfill_report is
  'Conteos RLS-aware del backfill canónico y su cola de revisión.';

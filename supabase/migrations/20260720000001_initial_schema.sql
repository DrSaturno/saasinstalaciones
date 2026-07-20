-- =============================================================
-- Instala Pro — Migración inicial
-- Multi-tenant por RLS: toda tabla de dominio lleva company_id.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Tablas
-- -------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null check (country in ('AR', 'BR')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  logo_url text,
  order_prefix text not null default 'ORD',
  order_seq integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('platform_admin', 'company_manager', 'installer')),
  company_id uuid references public.companies (id) on delete set null,
  full_name text not null default '',
  phone text,
  locale text not null default 'es' check (locale in ('es', 'pt')),
  created_at timestamptz not null default now(),
  constraint manager_has_company check (role <> 'company_manager' or company_id is not null)
);

create table public.installers (
  id uuid primary key references public.profiles (id) on delete cascade,
  zones text[] not null default '{}',
  skills text[] not null default '{}',
  rating_avg numeric(3, 2) not null default 0,
  rating_count integer not null default 0,
  available boolean not null default true
);

create table public.company_installers (
  company_id uuid not null references public.companies (id) on delete cascade,
  installer_id uuid not null references public.installers (id) on delete cascade,
  status text not null default 'active' check (status in ('invited', 'active', 'removed')),
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  primary key (company_id, installer_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  email text not null,
  token uuid not null unique default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  client_name text not null default '',
  description text not null default '',
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'done')),
  starts_at date,
  ends_at date,
  created_at timestamptz not null default now()
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  address text not null default '',
  city text not null default '',
  state text not null default '',
  zone text not null default '',
  lat numeric,
  lng numeric,
  status text not null default 'sin_ordenes',
  external_ref text,
  created_at timestamptz not null default now()
);
create index sites_project_idx on public.sites (project_id);
create index sites_company_idx on public.sites (company_id);
create index sites_zone_idx on public.sites (zone);

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  site_id uuid not null references public.sites (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  description text not null default '',
  status text not null default 'pendiente' check (status in (
    'pendiente', 'relevamiento', 'planificada', 'en_proceso',
    'en_revision', 'finalizada', 'cancelada')),
  scheduled_date date,
  assigned_installer_id uuid references public.installers (id) on delete set null,
  source text not null default 'roster' check (source in ('roster', 'broadcast')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index work_orders_company_status_idx on public.work_orders (company_id, status);
create index work_orders_installer_idx on public.work_orders (assigned_installer_id);
create index work_orders_site_idx on public.work_orders (site_id);

create table public.order_updates (
  id uuid primary key, -- generado en el CLIENTE: idempotencia offline
  order_id uuid not null references public.work_orders (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  installer_id uuid references public.installers (id) on delete set null,
  type text not null check (type in ('checkin', 'progress', 'blocker', 'done', 'system')),
  note text not null default '',
  photos jsonb not null default '[]',
  client_created_at timestamptz,
  created_at timestamptz not null default now()
);
create index order_updates_order_idx on public.order_updates (order_id, created_at);

create table public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  zone text not null,
  title text not null,
  description text not null default '',
  slots integer not null default 1 check (slots > 0),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);
create index broadcasts_zone_idx on public.broadcasts (zone) where status = 'open';

create table public.broadcast_applications (
  broadcast_id uuid not null references public.broadcasts (id) on delete cascade,
  installer_id uuid not null references public.installers (id) on delete cascade,
  status text not null default 'applied' check (status in ('applied', 'accepted', 'rejected')),
  message text,
  created_at timestamptz not null default now(),
  primary key (broadcast_id, installer_id)
);

create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.work_orders (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  installer_id uuid not null references public.installers (id) on delete cascade,
  stars integer not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);
create index ratings_installer_idx on public.ratings (installer_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.push_subscriptions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null,
  keys jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, endpoint)
);

-- -------------------------------------------------------------
-- 2. Helpers de auth (SECURITY DEFINER para no recursar RLS)
--    Van después de las tablas: Postgres intenta inlinear/validar
--    funciones SQL simples en CREATE FUNCTION y falla si la tabla
--    referenciada todavía no existe.
-- -------------------------------------------------------------
create or replace function public.auth_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.auth_company()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid()
$$;

-- -------------------------------------------------------------
-- 3. Triggers de dominio
-- -------------------------------------------------------------

-- 3.1 Perfil automático al crear usuario en auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data ->> 'role', 'installer');
  v_company uuid := nullif(new.raw_user_meta_data ->> 'company_id', '')::uuid;
begin
  insert into public.profiles (id, role, company_id, full_name, locale)
  values (
    new.id,
    v_role,
    v_company,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'locale', 'es')
  );
  if v_role = 'installer' then
    insert into public.installers (id) values (new.id);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3.2 Bloquear escalación: nadie cambia su propio role/company via API
create or replace function public.prevent_privilege_change()
returns trigger
language plpgsql
as $$
begin
  if (new.role is distinct from old.role or new.company_id is distinct from old.company_id)
     and current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and auth.role() is distinct from 'service_role' then
    raise exception 'role/company_id solo modificables por el tablero maestro';
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_privilege_change
  before update on public.profiles
  for each row execute function public.prevent_privilege_change();

-- 3.3 Numeración correlativa de órdenes por empresa (ALL-00042)
create or replace function public.assign_order_number()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_seq integer;
begin
  if new.order_number is null or new.order_number = '' then
    update public.companies
      set order_seq = order_seq + 1
      where id = new.company_id
      returning order_prefix, order_seq into v_prefix, v_seq;
    new.order_number := v_prefix || '-' || lpad(v_seq::text, 5, '0');
  end if;
  return new;
end;
$$;

alter table public.work_orders alter column order_number drop not null;
alter table public.work_orders alter column order_number set default null;

create trigger work_orders_assign_number
  before insert on public.work_orders
  for each row execute function public.assign_order_number();

-- 3.4 Máquina de estados de órdenes: transiciones válidas únicamente
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
  new.updated_at := now();
  return new;
end;
$$;

create trigger work_orders_validate_transition
  before update of status on public.work_orders
  for each row execute function public.validate_order_transition();

-- 3.5 Cache de estado del site según sus órdenes
create or replace function public.refresh_site_status()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_site uuid := coalesce(new.site_id, old.site_id);
  v_status text;
begin
  select case
    when count(*) = 0 then 'sin_ordenes'
    when count(*) filter (where status not in ('finalizada', 'cancelada')) = 0 then 'finalizada'
    when count(*) filter (where status in ('en_proceso', 'en_revision')) > 0 then 'en_proceso'
    when count(*) filter (where status = 'planificada') > 0 then 'planificada'
    else 'pendiente'
  end into v_status
  from public.work_orders where site_id = v_site;

  update public.sites set status = v_status where id = v_site;
  return coalesce(new, old);
end;
$$;

create trigger work_orders_refresh_site_status
  after insert or update of status or delete on public.work_orders
  for each row execute function public.refresh_site_status();

-- 3.6 Promedio de calificaciones del instalador
create or replace function public.refresh_installer_rating()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_installer uuid := coalesce(new.installer_id, old.installer_id);
begin
  update public.installers i set
    rating_avg = coalesce((select round(avg(stars)::numeric, 2) from public.ratings where installer_id = v_installer), 0),
    rating_count = (select count(*) from public.ratings where installer_id = v_installer)
  where i.id = v_installer;
  return coalesce(new, old);
end;
$$;

create trigger ratings_refresh_installer
  after insert or update or delete on public.ratings
  for each row execute function public.refresh_installer_rating();

-- -------------------------------------------------------------
-- 4. Row Level Security
-- -------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.installers enable row level security;
alter table public.company_installers enable row level security;
alter table public.invitations enable row level security;
alter table public.projects enable row level security;
alter table public.sites enable row level security;
alter table public.work_orders enable row level security;
alter table public.order_updates enable row level security;
alter table public.broadcasts enable row level security;
alter table public.broadcast_applications enable row level security;
alter table public.ratings enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;

-- companies: los miembros ven su empresa (activa o no); nadie la modifica via API
create policy companies_member_read on public.companies
  for select using (id = public.auth_company());

-- profiles: cada uno ve y edita el suyo
create policy profiles_own_read on public.profiles
  for select using (id = auth.uid());
create policy profiles_own_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
-- managers ven perfiles de instaladores de su roster
create policy profiles_roster_read on public.profiles
  for select using (
    public.auth_role() = 'company_manager'
    and id in (select installer_id from public.company_installers
               where company_id = public.auth_company() and status = 'active')
  );

-- installers: reputación semi-pública (necesaria para roster y broadcasts)
create policy installers_read on public.installers
  for select using (auth.uid() is not null);
create policy installers_own_update on public.installers
  for update using (id = auth.uid()) with check (id = auth.uid());

-- company_installers
create policy company_installers_manager_all on public.company_installers
  for all using (public.auth_role() = 'company_manager' and company_id = public.auth_company())
  with check (company_id = public.auth_company());
create policy company_installers_own_read on public.company_installers
  for select using (installer_id = auth.uid());

-- invitations: solo el manager de la empresa (aceptación via función security definer)
create policy invitations_manager_all on public.invitations
  for all using (public.auth_role() = 'company_manager' and company_id = public.auth_company())
  with check (company_id = public.auth_company());

-- projects / sites: la empresa opera lo suyo
create policy projects_company_all on public.projects
  for all using (public.auth_role() = 'company_manager' and company_id = public.auth_company())
  with check (company_id = public.auth_company());
create policy sites_company_all on public.sites
  for all using (public.auth_role() = 'company_manager' and company_id = public.auth_company())
  with check (company_id = public.auth_company());
-- instalador ve sites donde tiene órdenes asignadas
create policy sites_installer_read on public.sites
  for select using (
    id in (select site_id from public.work_orders where assigned_installer_id = auth.uid())
  );

-- work_orders
create policy work_orders_company_all on public.work_orders
  for all using (public.auth_role() = 'company_manager' and company_id = public.auth_company())
  with check (company_id = public.auth_company());
create policy work_orders_installer_read on public.work_orders
  for select using (assigned_installer_id = auth.uid());
-- instalador solo puede pasar en_proceso→en_revision (done) — vía update de status;
-- el trigger valida la transición, la policy limita el alcance
create policy work_orders_installer_progress on public.work_orders
  for update using (assigned_installer_id = auth.uid())
  with check (assigned_installer_id = auth.uid());

-- order_updates
create policy order_updates_company_read on public.order_updates
  for select using (public.auth_role() = 'company_manager' and company_id = public.auth_company());
create policy order_updates_company_insert on public.order_updates
  for insert with check (public.auth_role() = 'company_manager' and company_id = public.auth_company());
create policy order_updates_installer_read on public.order_updates
  for select using (
    order_id in (select id from public.work_orders where assigned_installer_id = auth.uid())
  );
create policy order_updates_installer_insert on public.order_updates
  for insert with check (
    installer_id = auth.uid()
    and exists (select 1 from public.work_orders w
                where w.id = order_id and w.assigned_installer_id = auth.uid())
  );

-- broadcasts
create policy broadcasts_company_all on public.broadcasts
  for all using (public.auth_role() = 'company_manager' and company_id = public.auth_company())
  with check (company_id = public.auth_company());
create policy broadcasts_installer_read on public.broadcasts
  for select using (
    status = 'open'
    and zone = any (select unnest(zones) from public.installers where id = auth.uid())
  );

-- broadcast_applications
create policy broadcast_apps_installer_insert on public.broadcast_applications
  for insert with check (installer_id = auth.uid());
create policy broadcast_apps_installer_read on public.broadcast_applications
  for select using (installer_id = auth.uid());
create policy broadcast_apps_manager_read on public.broadcast_applications
  for select using (
    broadcast_id in (select id from public.broadcasts where company_id = public.auth_company())
  );
create policy broadcast_apps_manager_update on public.broadcast_applications
  for update using (
    broadcast_id in (select id from public.broadcasts where company_id = public.auth_company())
  );

-- ratings: reputación pública para autenticados; solo la empresa que finalizó puntúa
create policy ratings_read on public.ratings
  for select using (auth.uid() is not null);
create policy ratings_company_insert on public.ratings
  for insert with check (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
    and exists (select 1 from public.work_orders w
                where w.id = order_id and w.company_id = public.auth_company()
                  and w.status = 'finalizada')
  );

-- notifications / push: cada uno lo suyo
create policy notifications_own on public.notifications
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_subscriptions_own on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- -------------------------------------------------------------
-- 5. Aceptación de invitaciones (SECURITY DEFINER: el invitado
--    aún no es miembro, RLS no le permitiría tocar estas tablas)
-- -------------------------------------------------------------
create or replace function public.accept_invitation(p_token uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_inv public.invitations;
begin
  select * into v_inv from public.invitations
    where token = p_token and status = 'pending' and expires_at > now();
  if not found then
    raise exception 'invitación inválida o vencida';
  end if;
  if public.auth_role() is distinct from 'installer' then
    raise exception 'solo un instalador puede aceptar esta invitación';
  end if;

  insert into public.company_installers (company_id, installer_id, status, joined_at)
    values (v_inv.company_id, auth.uid(), 'active', now())
    on conflict (company_id, installer_id)
    do update set status = 'active', joined_at = now();

  update public.invitations set status = 'accepted' where id = v_inv.id;
end;
$$;

-- -------------------------------------------------------------
-- 6. Storage: bucket de evidencia (paths: company_id/order_id/archivo)
-- -------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('evidence', 'evidence', false)
  on conflict (id) do nothing;

create policy evidence_upload on storage.objects
  for insert with check (
    bucket_id = 'evidence'
    and auth.uid() is not null
    and (
      (storage.foldername(name))[1] = public.auth_company()::text
      or exists (select 1 from public.work_orders w
                 where w.id = ((storage.foldername(name))[2])::uuid
                   and w.assigned_installer_id = auth.uid())
    )
  );

create policy evidence_read on storage.objects
  for select using (
    bucket_id = 'evidence'
    and (
      (storage.foldername(name))[1] = public.auth_company()::text
      or owner = auth.uid()
      or exists (select 1 from public.work_orders w
                 where w.id = ((storage.foldername(name))[2])::uuid
                   and w.assigned_installer_id = auth.uid())
    )
  );

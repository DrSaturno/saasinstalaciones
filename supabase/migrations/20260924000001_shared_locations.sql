-- Locaciones reutilizables entre clientes — LOCSHARE-* (docs/specs/2026-09-24-locaciones-compartidas).
--
-- Antes: `locations.client_id` era el único dueño, y cuatro tablas hijas apuntaban con una
-- clave compuesta `(location_id, company_id, client_id)` a `locations`. Una locación no se podía
-- vincular a un proyecto de otro cliente.
--
-- Ahora: la identidad de la locación (dirección, nombre, ubicación, contacto, notas físicas) es
-- de la EMPRESA y se comparte; qué clientes la usan, y con qué código propio, vive en
-- `client_locations`. Documentos y requisitos siguen siendo por cliente y se leen por cliente.
--
-- Aditiva salvo el cambio de las claves foráneas, que se hace recién con el vínculo de origen
-- ya creado y verificado para TODA locación. No se borra ni renombra nada:
-- `locations.client_id` pasa a ser el cliente de ORIGEN y `locations.external_ref` el código del
-- cliente de origen, y el código anterior sigue funcionando.

-- ---------------------------------------------------------------------------
-- 1. Vínculo cliente ↔ locación
-- ---------------------------------------------------------------------------

create table if not exists public.client_locations (
  location_id uuid not null,
  company_id uuid not null references public.companies (id) on delete cascade,
  client_id uuid not null,
  -- El código de la locación PARA ESTE cliente. Puede diferir entre clientes o no existir.
  external_ref text,
  normalized_external_ref text
    generated always as (public.normalize_location_external_ref(external_ref)) stored,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  primary key (location_id, client_id),
  constraint client_locations_location_company_client_key
    unique (location_id, company_id, client_id),
  constraint client_locations_external_ref_not_blank
    check (external_ref is null or btrim(external_ref) <> ''),
  -- Diferida: el trigger de vínculo de origen la inserta desde un BEFORE INSERT de la locación,
  -- cuando la fila de `locations` todavía no existe.
  constraint client_locations_location_fk
    foreign key (location_id, company_id)
    references public.locations (id, company_id) on delete cascade
    deferrable initially deferred,
  constraint client_locations_client_fk
    foreign key (client_id, company_id)
    references public.clients (id, company_id)
);

comment on table public.client_locations is
  'Qué clientes usan una locación y con qué código propio. La locación (identidad) es de la empresa; un vínculo por cliente. El vínculo de origen se crea solo al crear la locación.';

-- La regla «el código es único por cliente» pasa a vivir acá.
create unique index if not exists client_locations_ref_idx
  on public.client_locations (company_id, client_id, normalized_external_ref)
  where normalized_external_ref is not null;
create index if not exists client_locations_client_idx
  on public.client_locations (company_id, client_id);

-- ---------------------------------------------------------------------------
-- 2. Vínculo de origen: para lo existente y para lo que se cree
-- ---------------------------------------------------------------------------

insert into public.client_locations (location_id, company_id, client_id, external_ref, created_by)
select id, company_id, client_id, external_ref, created_by
from public.locations
on conflict (location_id, client_id) do nothing;

-- Verificación antes de tocar nada más: un vínculo de origen por locación, con el mismo código.
-- Si no coincide, la migración entera se aborta.
do $$
declare
  v_locations bigint;
  v_linked bigint;
  v_ref_mismatch bigint;
begin
  select count(*) into v_locations from public.locations;
  select count(*) into v_linked
    from public.locations l
    join public.client_locations cl
      on cl.location_id = l.id and cl.client_id = l.client_id and cl.company_id = l.company_id;
  select count(*) into v_ref_mismatch
    from public.locations l
    join public.client_locations cl
      on cl.location_id = l.id and cl.client_id = l.client_id
    where cl.external_ref is distinct from l.external_ref;
  if v_locations <> v_linked or v_ref_mismatch <> 0 then
    raise exception
      'Vínculo de origen inconsistente: locaciones %, con vínculo %, códigos distintos %',
      v_locations, v_linked, v_ref_mismatch;
  end if;
end $$;

-- La clave a `locations` es diferida (ver arriba): el relleno dejó eventos pendientes y Postgres no
-- deja hacer ALTER TABLE sobre una tabla con eventos de trigger pendientes. Se fuerza su
-- comprobación ahora, dentro de esta misma transacción.
set constraints all immediate;

-- Compatibilidad: quien inserte una locación (incluido el código anterior a este cambio) obtiene su
-- vínculo de origen solo. BEFORE INSERT a propósito: la auditoría de la locación (AFTER INSERT)
-- escribe un evento cuya clave apunta a este vínculo, así que tiene que existir antes.
create or replace function public.create_origin_client_location()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.client_locations (location_id, company_id, client_id, external_ref, created_by)
  values (new.id, new.company_id, new.client_id, new.external_ref, new.created_by)
  on conflict (location_id, client_id) do nothing;
  return new;
end;
$$;

revoke all on function public.create_origin_client_location() from public;
revoke all on function public.create_origin_client_location() from anon;
revoke all on function public.create_origin_client_location() from authenticated;

drop trigger if exists locations_00_origin_link on public.locations;
create trigger locations_00_origin_link
  before insert on public.locations
  for each row execute function public.create_origin_client_location();

-- Si cambia el código del cliente de origen en la ficha, el vínculo lo sigue (compatibilidad con el
-- código que todavía lo escribe en `locations.external_ref`).
create or replace function public.sync_origin_client_location_ref()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.client_locations
     set external_ref = new.external_ref
   where location_id = new.id
     and client_id = new.client_id
     and external_ref is distinct from new.external_ref;
  return null;
end;
$$;

revoke all on function public.sync_origin_client_location_ref() from public;
revoke all on function public.sync_origin_client_location_ref() from anon;
revoke all on function public.sync_origin_client_location_ref() from authenticated;

drop trigger if exists locations_sync_origin_ref on public.locations;
create trigger locations_sync_origin_ref
  after update of external_ref on public.locations
  for each row
  when (old.external_ref is distinct from new.external_ref)
  execute function public.sync_origin_client_location_ref();

-- ---------------------------------------------------------------------------
-- 3. Las tablas hijas apuntan al vínculo, no a la locación
-- ---------------------------------------------------------------------------

alter table public.project_locations
  drop constraint project_locations_location_tenant_client_fk,
  add constraint project_locations_location_tenant_client_fk
    foreign key (location_id, company_id, client_id)
    references public.client_locations (location_id, company_id, client_id);

alter table public.location_attachments
  drop constraint location_attachments_location_tenant_client_fk,
  add constraint location_attachments_location_tenant_client_fk
    foreign key (location_id, company_id, client_id)
    references public.client_locations (location_id, company_id, client_id);

alter table public.location_requirements
  drop constraint location_requirements_location_tenant_client_fk,
  add constraint location_requirements_location_tenant_client_fk
    foreign key (location_id, company_id, client_id)
    references public.client_locations (location_id, company_id, client_id);

alter table public.location_change_events
  drop constraint location_change_events_location_tenant_client_fk,
  add constraint location_change_events_location_tenant_client_fk
    foreign key (location_id, company_id, client_id)
    references public.client_locations (location_id, company_id, client_id);

-- ---------------------------------------------------------------------------
-- 4. Lectura por cliente
-- ---------------------------------------------------------------------------

-- Igual que `can_read_location`, pero acotada a UN cliente: quien opera un proyecto del cliente A
-- no lee lo que el cliente B guardó sobre la misma locación (documentos, requisitos, historial).
-- El gerente de la empresa los ve todos. La lectura de la FICHA (`can_read_location`) no cambia:
-- la identidad es compartida.
create or replace function public.can_read_location_client(p_location_id uuid, p_client_id uuid)
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
            and pl.client_id = p_client_id
            and public.can_operate_project(pl.project_id)
        )
        or (
          public.auth_has_company_role(l.company_id, 'installer')
          and exists (
            select 1
            from public.sites s
            join public.projects pr on pr.id = s.project_id
            join public.work_orders w
              on w.site_id = s.id
             and w.company_id = s.company_id
            where s.location_id = l.id
              and s.company_id = l.company_id
              and pr.client_id = p_client_id
              and w.assigned_installer_id = auth.uid()
          )
        )
      )
  )
$$;

revoke all on function public.can_read_location_client(uuid, uuid) from public;
revoke all on function public.can_read_location_client(uuid, uuid) from anon;
grant execute on function public.can_read_location_client(uuid, uuid) to authenticated;

drop policy if exists location_attachments_actor_read on public.location_attachments;
create policy location_attachments_actor_read on public.location_attachments
  for select to authenticated
  using (public.can_read_location_client(location_id, client_id));

drop policy if exists location_requirements_actor_read on public.location_requirements;
create policy location_requirements_actor_read on public.location_requirements
  for select to authenticated
  using (public.can_read_location_client(location_id, client_id));

drop policy if exists location_change_events_actor_read on public.location_change_events;
create policy location_change_events_actor_read on public.location_change_events
  for select to authenticated
  using (public.can_read_location_client(location_id, client_id));

-- ---------------------------------------------------------------------------
-- 5. RLS de `client_locations`
-- ---------------------------------------------------------------------------

alter table public.client_locations enable row level security;

revoke all on public.client_locations from anon, authenticated;
grant select, insert, update on public.client_locations to authenticated;

-- Quien opera un proyecto del cliente ve el vínculo de SU cliente (su propio código), no el de otros.
drop policy if exists client_locations_actor_read on public.client_locations;
create policy client_locations_actor_read on public.client_locations
  for select to authenticated
  using (
    (
      (select public.auth_role()) = 'company_manager'
      and company_id = (select public.auth_company())
      and public.company_is_active(company_id)
    )
    or public.can_read_location_client(location_id, client_id)
  );

drop policy if exists client_locations_manager_insert on public.client_locations;
create policy client_locations_manager_insert on public.client_locations
  for insert to authenticated
  with check (
    (select public.auth_role()) = 'company_manager'
    and company_id = (select public.auth_company())
    and created_by = (select auth.uid())
  );

drop policy if exists client_locations_manager_update on public.client_locations;
create policy client_locations_manager_update on public.client_locations
  for update to authenticated
  using (
    (select public.auth_role()) = 'company_manager'
    and company_id = (select public.auth_company())
  )
  with check (
    (select public.auth_role()) = 'company_manager'
    and company_id = (select public.auth_company())
  );

-- ---------------------------------------------------------------------------
-- 6. Validaciones: pertenecer = estar vinculada
-- ---------------------------------------------------------------------------

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
    join public.client_locations cl
      on cl.location_id = l.id
     and cl.company_id = l.company_id
     and cl.client_id = p.client_id
    where l.id = new.location_id
      and l.company_id = new.company_id
      and p.company_id = new.company_id
  ) then
    raise exception 'La locación canónica no está vinculada al cliente del proyecto';
  end if;

  return new;
end;
$$;

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
        or not exists (
          select 1
          from public.client_locations cl
          where cl.location_id = l.id
            and cl.company_id = l.company_id
            and cl.client_id = new.client_id
        )
      )
  ) then
    raise exception 'El cambio dejaría locaciones vinculadas a otro tenant o cliente';
  end if;

  return new;
end;
$$;

-- El cliente de una locación ya no es «su dueño»: sólo se protege el tenant.
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
      and p.company_id is distinct from new.company_id
  ) then
    raise exception 'El cambio dejaría proyecciones legacy en otro tenant';
  end if;

  return new;
end;
$$;

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
        or exists (
          select 1
          from public.client_locations cl
          where cl.location_id = l.id
            and cl.company_id = l.company_id
            and cl.client_id = new.client_id
        )
      )
  ) then
    raise exception 'La resolución apunta a una locación de otro alcance';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. El código del local llega a los `sites` por el vínculo del cliente del proyecto
-- ---------------------------------------------------------------------------

create or replace function public.sync_site_identity_from_location()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  canonical public.locations%rowtype;
  v_link_found boolean;
  v_ref text;
begin
  if new.location_id is null then
    return new;
  end if;

  select * into canonical from public.locations where id = new.location_id;
  if not found then
    return new;
  end if;

  -- El código es del CLIENTE del proyecto, no de la locación: dos clientes que comparten una
  -- locación ven cada uno el suyo.
  select true, cl.external_ref
    into v_link_found, v_ref
    from public.client_locations cl
    join public.projects p on p.client_id = cl.client_id and p.company_id = cl.company_id
   where p.id = new.project_id
     and cl.location_id = new.location_id;

  new.name             := canonical.name;
  new.external_ref     := case when coalesce(v_link_found, false) then v_ref else canonical.external_ref end;
  new.address          := canonical.address;
  new.city             := canonical.city;
  new.state            := canonical.state;
  new.zone             := canonical.zone;
  new.lat              := canonical.lat;
  new.lng              := canonical.lng;
  new.contact_name     := canonical.contact_name;
  new.contact_phone    := canonical.contact_phone;
  new.contact_email    := canonical.contact_email;
  new.opening_hours    := canonical.opening_hours;
  new.access_notes     := canonical.access_notes;
  new.parking_notes    := canonical.parking_notes;
  new.technical_notes  := canonical.technical_notes;
  new.risk_notes       := canonical.risk_notes;
  new.permanent_notes  := canonical.permanent_notes;

  return new;
end;
$$;

-- Editar la ficha propaga la identidad COMPARTIDA a todas sus proyecciones. El código no: ese es
-- por cliente y lo propaga el vínculo (más abajo).
create or replace function public.propagate_location_identity_to_sites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sites s
  set name            = new.name,
      address         = new.address,
      city            = new.city,
      state           = new.state,
      zone            = new.zone,
      lat             = new.lat,
      lng             = new.lng,
      contact_name    = new.contact_name,
      contact_phone   = new.contact_phone,
      contact_email   = new.contact_email,
      opening_hours   = new.opening_hours,
      access_notes    = new.access_notes,
      parking_notes   = new.parking_notes,
      technical_notes = new.technical_notes,
      risk_notes      = new.risk_notes,
      permanent_notes = new.permanent_notes
  where s.location_id = new.id
    and s.company_id = new.company_id;

  return null;
end;
$$;

drop trigger if exists locations_propagate_identity_to_sites on public.locations;
create trigger locations_propagate_identity_to_sites
  after update on public.locations
  for each row
  when (
    old.name            is distinct from new.name
    or old.address         is distinct from new.address
    or old.city            is distinct from new.city
    or old.state           is distinct from new.state
    or old.zone            is distinct from new.zone
    or old.lat             is distinct from new.lat
    or old.lng             is distinct from new.lng
    or old.contact_name    is distinct from new.contact_name
    or old.contact_phone   is distinct from new.contact_phone
    or old.contact_email   is distinct from new.contact_email
    or old.opening_hours   is distinct from new.opening_hours
    or old.access_notes    is distinct from new.access_notes
    or old.parking_notes   is distinct from new.parking_notes
    or old.technical_notes is distinct from new.technical_notes
    or old.risk_notes      is distinct from new.risk_notes
    or old.permanent_notes is distinct from new.permanent_notes
  )
  execute function public.propagate_location_identity_to_sites();

-- Un cambio de código en el vínculo llega a los `sites` de los proyectos de ESE cliente.
create or replace function public.propagate_client_location_ref_to_sites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sites s
     set external_ref = new.external_ref
    from public.projects p
   where s.location_id = new.location_id
     and s.company_id = new.company_id
     and p.id = s.project_id
     and p.client_id = new.client_id
     and s.external_ref is distinct from new.external_ref;
  return null;
end;
$$;

revoke all on function public.propagate_client_location_ref_to_sites() from public;
revoke all on function public.propagate_client_location_ref_to_sites() from anon;
revoke all on function public.propagate_client_location_ref_to_sites() from authenticated;

drop trigger if exists client_locations_propagate_ref on public.client_locations;
create trigger client_locations_propagate_ref
  after update of external_ref on public.client_locations
  for each row
  when (old.external_ref is distinct from new.external_ref)
  execute function public.propagate_client_location_ref_to_sites();

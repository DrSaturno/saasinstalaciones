-- Subcuentas y permisos del gerente — SUBCTA-* (docs/specs/2026-09-24-subcuentas-permisos).
--
-- Una subcuenta ES un `company_manager` más, distinguido por `profiles.is_owner`. Las ~30
-- políticas y acciones que hoy conceden acceso operativo a «cualquier company_manager de la
-- empresa» siguen intactas y siguen sirviendo a las subcuentas: es la decisión central de este
-- bloque (ver DEC-01). Sólo se acotan tres cosas que el pedido reserva al dueño: ver importes
-- comerciales (bloque 8), cambiar la configuración de la empresa, y gestionar otras subcuentas.

-- ---------------------------------------------------------------------------
-- 1. Quién es el dueño
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists is_owner boolean not null default true;

comment on column public.profiles.is_owner is
  'Sólo tiene sentido para company_manager. true = dueño de la empresa (como hoy); false = subcuenta creada por el dueño, con acceso operativo igual pero sin finanzas/configuración/gestión de subcuentas salvo permiso explícito.';

-- El trigger que crea el perfil (endurecido por SEC-16: sólo lee metadata que
-- controla el servidor) suma is_owner. Default true cuando no viene, que es lo
-- correcto para el alta de empresa del tablero maestro, que nunca la manda.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested_role text := new.raw_app_meta_data ->> 'role';
  v_role text := 'installer';
  v_company uuid;
  v_is_owner boolean := true;
begin
  if v_requested_role in ('platform_admin', 'company_manager') then
    v_role := v_requested_role;
  end if;
  if v_role = 'company_manager' then
    v_company := nullif(new.raw_app_meta_data ->> 'company_id', '')::uuid;
    if v_company is null then
      raise exception 'manager_company_required' using errcode = '23514';
    end if;
    v_is_owner := coalesce((new.raw_app_meta_data ->> 'is_owner')::boolean, true);
  end if;

  insert into public.profiles (id, role, company_id, full_name, locale, is_owner)
  values (
    new.id, v_role, v_company,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_app_meta_data ->> 'full_name', ''),
    case when coalesce(new.raw_user_meta_data ->> 'locale', new.raw_app_meta_data ->> 'locale') = 'pt' then 'pt' else 'es' end,
    v_is_owner
  );
  if v_role = 'installer' then
    insert into public.installers (id) values (new.id) on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Único lugar que decide «dueño o no». Usado por las políticas de permisos, por
-- la parte de `invitations` que distingue invitar-subcuenta de invitar-instalador,
-- por la configuración de empresa y por `auth_can_see_commercials` (bloque 8).
create or replace function public.auth_is_company_owner(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.auth_is_company_manager(p_company_id)
     and coalesce(
       (select is_owner from public.profiles where id = auth.uid()),
       false
     )
$$;

revoke all on function public.auth_is_company_owner(uuid) from public;
revoke all on function public.auth_is_company_owner(uuid) from anon;
grant execute on function public.auth_is_company_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Los permisos de una subcuenta
-- ---------------------------------------------------------------------------

create table if not exists public.company_staff_permissions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  can_manage_finance boolean not null default false,
  can_manage_settings boolean not null default false,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.company_staff_permissions is
  'Permisos de una subcuenta (company_manager con is_owner=false). El dueño no tiene fila acá: su permiso es implícito y total.';

create index if not exists company_staff_permissions_company_idx
  on public.company_staff_permissions (company_id);

-- Sólo puede existir una fila para un company_manager que NO sea dueño, de la
-- MISMA empresa que se declara. Evita «dar permiso de finanzas» a un instalador
-- o a un dueño por error de quien escribe.
create or replace function public.validate_company_staff_permissions_target()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = new.user_id
      and p.role = 'company_manager'
      and p.is_owner = false
      and p.company_id = new.company_id
  ) then
    raise exception 'Sólo se puede dar este permiso a una subcuenta de la misma empresa'
      using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.validate_company_staff_permissions_target() from public;
revoke all on function public.validate_company_staff_permissions_target() from anon;
revoke all on function public.validate_company_staff_permissions_target() from authenticated;

drop trigger if exists company_staff_permissions_validate_target on public.company_staff_permissions;
create trigger company_staff_permissions_validate_target
  before insert or update on public.company_staff_permissions
  for each row execute function public.validate_company_staff_permissions_target();

alter table public.company_staff_permissions enable row level security;

revoke all on public.company_staff_permissions from anon, authenticated;
grant select, insert, update on public.company_staff_permissions to authenticated;

-- El dueño ve y administra las de su empresa; la subcuenta ve la propia (para
-- saber qué puede hacer), nunca la de otra (SUBCTA-R2.4 / AC-SUBCTA-D).
drop policy if exists company_staff_permissions_owner_all on public.company_staff_permissions;
create policy company_staff_permissions_owner_all on public.company_staff_permissions
  for all to authenticated
  using (public.auth_is_company_owner(company_id))
  with check (public.auth_is_company_owner(company_id));

drop policy if exists company_staff_permissions_self_read on public.company_staff_permissions;
create policy company_staff_permissions_self_read on public.company_staff_permissions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. auth_can_see_commercials (bloque 8): el punto de extensión que dejó escrito
-- ---------------------------------------------------------------------------

create or replace function public.auth_can_see_commercials(p_company_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select
    public.auth_is_company_owner(p_company_id)
    or exists (
      select 1 from public.company_staff_permissions csp
      where csp.user_id = auth.uid()
        and csp.company_id = p_company_id
        and csp.can_manage_finance
    )
$$;

comment on function public.auth_can_see_commercials(uuid) is
  'Quién puede ver y escribir importes comerciales: el dueño siempre; una subcuenta sólo con can_manage_finance. El coordinador nunca (decisión de Nicolás, bloque 8).';

-- ---------------------------------------------------------------------------
-- 4. Configuración de empresa: mismo criterio
-- ---------------------------------------------------------------------------

create or replace function public.set_company_min_completion_photos(p_value smallint)
returns smallint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.auth_company();
begin
  if v_company is null or not (
    public.auth_is_company_owner(v_company)
    or exists (
      select 1 from public.company_staff_permissions csp
      where csp.user_id = auth.uid()
        and csp.company_id = v_company
        and csp.can_manage_settings
    )
  ) then
    raise exception 'Acceso denegado';
  end if;
  if p_value is null or p_value < 0 or p_value > 20 then
    raise exception 'El mínimo de fotos tiene que estar entre 0 y 20';
  end if;

  update public.companies set min_completion_photos = p_value where id = v_company;
  return p_value;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Invitar una subcuenta: se reutiliza `invitations`, no se crea una tabla nueva
-- ---------------------------------------------------------------------------

alter table public.invitations
  drop constraint if exists invitations_role_check,
  add constraint invitations_role_check
    check (role = any (array['installer', 'coordinator', 'company_staff']));

alter table public.invitations
  add column if not exists staff_can_manage_finance boolean not null default false,
  add column if not exists staff_can_manage_settings boolean not null default false;

comment on column public.invitations.staff_can_manage_finance is
  'Sólo se usa cuando role = company_staff: permiso a otorgar apenas se acepte la invitación.';
comment on column public.invitations.staff_can_manage_settings is
  'Sólo se usa cuando role = company_staff: permiso a otorgar apenas se acepte la invitación.';

-- Se reemplaza por dos policies: la de equipo (instalador/coordinador, como
-- siempre, abierta a cualquier company_manager) y la de subcuentas (sólo el
-- dueño). Antes era una sola `for all`; separarla evita repetir la condición de
-- rol en cada comando.
drop policy if exists invitations_manager_all on public.invitations;

create policy invitations_team_all on public.invitations
  for all to authenticated
  using (
    (select public.auth_role()) = 'company_manager'
    and company_id = (select public.auth_company())
    and role in ('installer', 'coordinator')
  )
  with check (
    company_id = (select public.auth_company())
    and role in ('installer', 'coordinator')
  );

create policy invitations_staff_owner_all on public.invitations
  for all to authenticated
  using (
    role = 'company_staff'
    and public.auth_is_company_owner(company_id)
  )
  with check (
    role = 'company_staff'
    and public.auth_is_company_owner(company_id)
  );

-- El coordinador no tiene por qué enterarse de que se está invitando personal
-- administrativo.
drop policy if exists invitations_coordinator_read on public.invitations;
create policy invitations_coordinator_read on public.invitations
  for select to authenticated
  using (
    role in ('installer', 'coordinator')
    and company_id in (select public.auth_companies('coordinator'))
  );

-- ---------------------------------------------------------------------------
-- 6. Aceptar la invitación de subcuenta: RPC paralela, no se toca accept_invitation
-- ---------------------------------------------------------------------------

-- `accept_invitation` exige auth_role() in ('installer','coordinator') y hace
-- inserts de instalador (company_installers, chat_threads) que no aplican acá.
-- Esta función corre DESPUÉS de que `handle_new_user` ya creó el perfil
-- company_manager/is_owner=false (el alta de la cuenta pasa por
-- lib/actions/invite-signup.ts, el único lugar además de app/api/master/**
-- con permiso de usar service_role): sólo queda cerrar la invitación y dar de
-- alta el permiso pedido.
create or replace function public.accept_company_staff_invitation(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.invitations;
begin
  if auth.uid() is null or public.auth_role() <> 'company_manager' then
    raise exception 'Acceso denegado';
  end if;

  select i.*
    into v_inv
    from public.invitations i
    join public.companies c on c.id = i.company_id and c.status = 'active'
   where i.token = p_token
     and i.status = 'pending'
     and i.expires_at > now()
     and i.role = 'company_staff'
   for update of i;

  if not found then
    raise exception 'Invitación inválida o vencida';
  end if;

  if lower(coalesce(auth.jwt() ->> 'email', '')) <> lower(v_inv.email) then
    raise exception 'La invitación pertenece a otro email';
  end if;

  -- El propio perfil de quien llama tiene que ser la subcuenta recién creada
  -- para esta invitación: mismo email de la invitación, misma empresa, no dueño.
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.company_id = v_inv.company_id
      and p.is_owner = false
  ) then
    raise exception 'La cuenta no corresponde a esta invitación';
  end if;

  insert into public.company_staff_permissions (
    user_id, company_id, can_manage_finance, can_manage_settings, granted_by
  )
  values (
    auth.uid(), v_inv.company_id,
    v_inv.staff_can_manage_finance, v_inv.staff_can_manage_settings,
    -- Quien invitó: el único dueño de esa empresa. `granted_by` es informativo.
    (select id from public.profiles where company_id = v_inv.company_id and is_owner = true limit 1)
  )
  on conflict (user_id) do update
    set can_manage_finance = excluded.can_manage_finance,
        can_manage_settings = excluded.can_manage_settings,
        granted_by = excluded.granted_by,
        updated_at = now();

  update public.invitations
     set status = 'accepted'
   where id = v_inv.id;
end;
$$;

revoke all on function public.accept_company_staff_invitation(uuid) from public;
revoke all on function public.accept_company_staff_invitation(uuid) from anon;
grant execute on function public.accept_company_staff_invitation(uuid) to authenticated;

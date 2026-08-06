-- R1 — Roles múltiples dentro de una misma empresa.
--
-- `company_installers` se conserva como membresía base y contrato legacy. Los
-- roles efectivos pasan a esta tabla N:N. El cambio es aditivo: las policies
-- existentes siguen invocando los mismos helpers, que ahora leen la tabla
-- normalizada. La columna legacy `company_installers.role` queda como proyección
-- preferente (coordinator si existe, installer en caso contrario) hasta un
-- cutover posterior.

create table if not exists public.company_membership_roles (
  company_id uuid not null,
  user_id uuid not null,
  role text not null check (role in ('installer', 'coordinator')),
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (company_id, user_id, role),
  foreign key (company_id, user_id)
    references public.company_installers (company_id, installer_id)
    on delete cascade
);

create index if not exists company_membership_roles_user_idx
  on public.company_membership_roles (user_id, role, company_id);

insert into public.company_membership_roles (company_id, user_id, role)
select ci.company_id, ci.installer_id, ci.role
from public.company_installers ci
on conflict (company_id, user_id, role) do nothing;

-- Adaptador de escritura para despliegues mixtos, seeds y scripts legacy. Una
-- escritura de la columna escalar agrega esa capacidad, pero nunca elimina las
-- otras. Si la persona es dual, `coordinator` queda como proyección preferente
-- para que triggers legacy de avisos sigan encontrándola.
create or replace function public.sync_legacy_company_membership_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 or new.status <> 'active' then
    return new;
  end if;

  insert into public.company_membership_roles (
    company_id, user_id, role, granted_by
  )
  values (new.company_id, new.installer_id, new.role, auth.uid())
  on conflict (company_id, user_id, role) do nothing;

  if new.role <> 'coordinator' and exists (
    select 1
    from public.company_membership_roles cmr
    where cmr.company_id = new.company_id
      and cmr.user_id = new.installer_id
      and cmr.role = 'coordinator'
  ) then
    update public.company_installers
    set role = 'coordinator'
    where company_id = new.company_id
      and installer_id = new.installer_id;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_legacy_company_membership_role
  on public.company_installers;
create trigger sync_legacy_company_membership_role
after insert or update of role, status on public.company_installers
for each row execute function public.sync_legacy_company_membership_role();

alter table public.company_membership_roles enable row level security;

drop policy if exists company_membership_roles_own_read
  on public.company_membership_roles;
create policy company_membership_roles_own_read
  on public.company_membership_roles
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.company_installers ci
      join public.companies c on c.id = ci.company_id
      where ci.company_id = company_membership_roles.company_id
        and ci.installer_id = auth.uid()
        and ci.status = 'active'
        and c.status = 'active'
    )
  );

drop policy if exists company_membership_roles_manager_read
  on public.company_membership_roles;
create policy company_membership_roles_manager_read
  on public.company_membership_roles
  for select
  to authenticated
  using (company_id = public.auth_company());

-- Un coordinador necesita validar capacidades del equipo al asignar una OT de
-- sus proyectos. La policy no cruza empresas y no expone datos personales:
-- esta tabla contiene únicamente la capacidad operativa.
drop policy if exists company_membership_roles_coordinator_read
  on public.company_membership_roles;
create policy company_membership_roles_coordinator_read
  on public.company_membership_roles
  for select
  to authenticated
  using (public.auth_has_company_role(company_id, 'coordinator'));

revoke insert, update, delete on public.company_membership_roles
  from authenticated;
grant select on public.company_membership_roles to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers usados por RLS y servidor. Conservan las firmas existentes.
-- Una empresa suspendida no produce capacidades activas.
-- ---------------------------------------------------------------------------

create or replace function public.auth_companies(p_role text default null)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct cmr.company_id
  from public.company_membership_roles cmr
  join public.company_installers ci
    on ci.company_id = cmr.company_id
   and ci.installer_id = cmr.user_id
  join public.companies c on c.id = cmr.company_id
  where cmr.user_id = auth.uid()
    and ci.status = 'active'
    and c.status = 'active'
    and (p_role is null or cmr.role = p_role)
$$;

create or replace function public.auth_has_company_role(
  p_company_id uuid,
  p_role text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_membership_roles cmr
    join public.company_installers ci
      on ci.company_id = cmr.company_id
     and ci.installer_id = cmr.user_id
    join public.companies c on c.id = cmr.company_id
    where cmr.company_id = p_company_id
      and cmr.user_id = auth.uid()
      and cmr.role = p_role
      and ci.status = 'active'
      and c.status = 'active'
  )
$$;

create or replace function public.auth_coordinates_anywhere()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_membership_roles cmr
    join public.company_installers ci
      on ci.company_id = cmr.company_id
     and ci.installer_id = cmr.user_id
    join public.companies c on c.id = cmr.company_id
    where cmr.user_id = auth.uid()
      and cmr.role = 'coordinator'
      and ci.status = 'active'
      and c.status = 'active'
  )
$$;

revoke all on function public.auth_companies(text) from public;
revoke all on function public.auth_has_company_role(uuid, text) from public;
revoke all on function public.auth_coordinates_anywhere() from public;
grant execute on function public.auth_companies(text) to authenticated;
grant execute on function public.auth_has_company_role(uuid, text) to authenticated;
grant execute on function public.auth_coordinates_anywhere() to authenticated;

-- ---------------------------------------------------------------------------
-- Proyectos: un coordinador puede además ser instalador. La validación mira la
-- capacidad, no la proyección escalar legacy.
-- ---------------------------------------------------------------------------

create or replace function public.validate_project_relations()
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
    raise exception 'El cliente no pertenece a la empresa';
  end if;

  if new.coordinator_id is not null and not exists (
    select 1
    from public.company_installers ci
    join public.company_membership_roles cmr
      on cmr.company_id = ci.company_id
     and cmr.user_id = ci.installer_id
     and cmr.role = 'coordinator'
    where ci.company_id = new.company_id
      and ci.installer_id = new.coordinator_id
      and ci.status = 'active'
  ) then
    raise exception 'El coordinador no pertenece a la empresa';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Gestión de capacidades. Sólo el manager activo de la empresa puede llamar.
-- Los comandos son idempotentes y no modifican el rol global del perfil.
-- ---------------------------------------------------------------------------

create or replace function public.grant_company_member_role(
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.auth_company();
  v_company_name text;
  v_locale text := 'es';
  v_inserted integer := 0;
begin
  if public.auth_role() is distinct from 'company_manager' or v_company is null then
    raise exception 'Acceso denegado';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'No podés cambiar tus propios permisos';
  end if;
  if p_role not in ('installer', 'coordinator') then
    raise exception 'Rol inválido';
  end if;

  perform 1
  from public.company_installers ci
  where ci.company_id = v_company
    and ci.installer_id = p_user_id
    and ci.status = 'active'
  for update;
  if not found then
    raise exception 'La persona no pertenece al equipo activo';
  end if;

  if p_role = 'installer' then
    insert into public.installers (id)
    values (p_user_id)
    on conflict (id) do nothing;

    insert into public.chat_threads (company_id, installer_id)
    values (v_company, p_user_id)
    on conflict (company_id, installer_id) do nothing;
  end if;

  insert into public.company_membership_roles (
    company_id, user_id, role, granted_by
  )
  values (v_company, p_user_id, p_role, auth.uid())
  on conflict (company_id, user_id, role) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return;
  end if;

  update public.company_installers
  set role = case
    when p_role = 'coordinator' then 'coordinator'
    else role
  end
  where company_id = v_company
    and installer_id = p_user_id;

  select c.name, p.locale
  into v_company_name, v_locale
  from public.companies c
  join public.profiles p on p.id = p_user_id
  where c.id = v_company;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    p_user_id,
    'role_granted',
    case
      when v_locale = 'pt' and p_role = 'coordinator' then 'Acesso de coordenação habilitado'
      when v_locale = 'pt' then 'Acesso de instalação habilitado'
      when p_role = 'coordinator' then 'Acceso de coordinación habilitado'
      else 'Acceso de instalación habilitado'
    end,
    case
      when v_locale = 'pt' then coalesce(v_company_name, 'A empresa') || ' adicionou uma nova função ao seu perfil.'
      else coalesce(v_company_name, 'La empresa') || ' agregó una nueva función a tu perfil.'
    end,
    jsonb_build_object(
      'url', case when p_role = 'coordinator' then '/coordination' else '/home' end,
      'company_id', v_company,
      'membership_role', p_role,
      'locale', v_locale
    )
  );
end;
$$;

create or replace function public.revoke_company_member_role(
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.auth_company();
  v_remaining integer;
  v_company_name text;
  v_locale text := 'es';
begin
  if public.auth_role() is distinct from 'company_manager' or v_company is null then
    raise exception 'Acceso denegado';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'No podés cambiar tus propios permisos';
  end if;
  if p_role not in ('installer', 'coordinator') then
    raise exception 'Rol inválido';
  end if;

  perform 1
  from public.company_installers ci
  where ci.company_id = v_company
    and ci.installer_id = p_user_id
    and ci.status = 'active'
  for update;
  if not found then
    raise exception 'La persona no pertenece al equipo activo';
  end if;

  if not exists (
    select 1
    from public.company_membership_roles cmr
    where cmr.company_id = v_company
      and cmr.user_id = p_user_id
      and cmr.role = p_role
  ) then
    return;
  end if;

  select count(*) into v_remaining
  from public.company_membership_roles cmr
  where cmr.company_id = v_company
    and cmr.user_id = p_user_id
    and cmr.role <> p_role;
  if v_remaining = 0 then
    raise exception 'La membresía debe conservar al menos una función';
  end if;

  if p_role = 'installer' and exists (
    select 1
    from public.work_orders w
    where w.company_id = v_company
      and w.assigned_installer_id = p_user_id
      and w.status not in ('finalizada', 'cancelada')
  ) then
    raise exception 'No se puede quitar instalación: hay órdenes abiertas';
  end if;

  if p_role = 'coordinator' and exists (
    select 1
    from public.projects p
    where p.company_id = v_company
      and p.coordinator_id = p_user_id
      and p.status <> 'done'
  ) then
    raise exception 'No se puede quitar coordinación: hay proyectos activos';
  end if;

  delete from public.company_membership_roles
  where company_id = v_company
    and user_id = p_user_id
    and role = p_role;

  update public.company_installers ci
  set role = case
    when exists (
      select 1
      from public.company_membership_roles cmr
      where cmr.company_id = v_company
        and cmr.user_id = p_user_id
        and cmr.role = 'coordinator'
    ) then 'coordinator'
    else 'installer'
  end
  where ci.company_id = v_company
    and ci.installer_id = p_user_id;

  select c.name, p.locale
  into v_company_name, v_locale
  from public.companies c
  join public.profiles p on p.id = p_user_id
  where c.id = v_company;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    p_user_id,
    'role_revoked',
    case when v_locale = 'pt' then 'Função atualizada' else 'Función actualizada' end,
    case
      when v_locale = 'pt' then coalesce(v_company_name, 'A empresa') || ' removeu uma função do seu perfil.'
      else coalesce(v_company_name, 'La empresa') || ' quitó una función de tu perfil.'
    end,
    jsonb_build_object(
      'url', '/home',
      'company_id', v_company,
      'membership_role', p_role,
      'locale', v_locale
    )
  );
end;
$$;

revoke all on function public.grant_company_member_role(uuid, text) from public;
revoke all on function public.revoke_company_member_role(uuid, text) from public;
grant execute on function public.grant_company_member_role(uuid, text) to authenticated;
grant execute on function public.revoke_company_member_role(uuid, text) to authenticated;

-- Firmas legacy: la UI vieja sigue funcionando durante el despliegue mixto.
create or replace function public.promote_installer_to_coordinator(
  p_installer_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.grant_company_member_role(p_installer_id, 'coordinator');
end;
$$;

create or replace function public.demote_coordinator_to_installer(
  p_coordinator_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.grant_company_member_role(p_coordinator_id, 'installer');
  perform public.revoke_company_member_role(p_coordinator_id, 'coordinator');
end;
$$;

revoke all on function public.promote_installer_to_coordinator(uuid) from public;
revoke all on function public.demote_coordinator_to_installer(uuid) from public;
grant execute on function public.promote_installer_to_coordinator(uuid) to authenticated;
grant execute on function public.demote_coordinator_to_installer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Invitaciones: aceptar otra función en una empresa existente es aditivo.
-- ---------------------------------------------------------------------------

create or replace function public.accept_invitation(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.invitations;
begin
  if auth.uid() is null or public.auth_role() not in ('installer', 'coordinator') then
    raise exception 'Acceso denegado';
  end if;

  select i.*
  into v_inv
  from public.invitations i
  join public.companies c on c.id = i.company_id and c.status = 'active'
  where i.token = p_token
    and i.status = 'pending'
    and i.expires_at > now()
  for update of i;

  if not found then
    raise exception 'Invitación inválida o vencida';
  end if;

  if lower(coalesce(auth.jwt() ->> 'email', '')) <> lower(v_inv.email) then
    raise exception 'La invitación pertenece a otro email';
  end if;

  if v_inv.role = 'installer' then
    insert into public.installers (id)
    values (auth.uid())
    on conflict (id) do nothing;
  end if;

  insert into public.company_installers (
    company_id, installer_id, role, status, joined_at
  )
  values (
    v_inv.company_id, auth.uid(), v_inv.role, 'active', now()
  )
  on conflict (company_id, installer_id)
  do update set
    role = case
      when company_installers.role = 'coordinator'
        or excluded.role = 'coordinator' then 'coordinator'
      else 'installer'
    end,
    status = 'active',
    joined_at = coalesce(company_installers.joined_at, now());

  insert into public.company_membership_roles (
    company_id, user_id, role, granted_by
  )
  values (v_inv.company_id, auth.uid(), v_inv.role, auth.uid())
  on conflict (company_id, user_id, role) do nothing;

  if v_inv.role = 'installer' then
    insert into public.chat_threads (company_id, installer_id)
    values (v_inv.company_id, auth.uid())
    on conflict (company_id, installer_id) do nothing;
  end if;

  update public.invitations
  set status = 'accepted'
  where id = v_inv.id;
end;
$$;

revoke all on function public.accept_invitation(uuid) from public;
grant execute on function public.accept_invitation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Bolsa existente: aceptar una postulación agrega la capacidad de instalar;
-- nunca elimina coordinación. Se conserva la semántica de staffing actual.
-- ---------------------------------------------------------------------------

create or replace function public.accept_broadcast_application(
  p_broadcast_id uuid,
  p_installer_id uuid,
  p_order_ids uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_broadcast public.broadcasts%rowtype;
  v_application_status text;
  v_accepted integer;
  v_requested integer := coalesce(cardinality(p_order_ids), 0);
  v_updated integer;
  v_installer_locale text := 'es';
begin
  select *
  into v_broadcast
  from public.broadcasts b
  where b.id = p_broadcast_id
    and (
      (public.auth_role() = 'company_manager' and b.company_id = public.auth_company())
      or (
        b.project_id is not null
        and public.auth_has_company_role(b.company_id, 'coordinator')
        and public.can_operate_project(b.project_id)
      )
    )
  for update;

  if not found then raise exception 'Búsqueda no encontrada'; end if;
  if v_broadcast.status <> 'open' then raise exception 'La búsqueda está cerrada'; end if;

  select ba.status
  into v_application_status
  from public.broadcast_applications ba
  where ba.broadcast_id = p_broadcast_id
    and ba.installer_id = p_installer_id
  for update;

  if not found then raise exception 'Postulación no encontrada'; end if;
  if v_application_status = 'accepted' then return; end if;
  if v_application_status <> 'applied' then
    raise exception 'La postulación ya fue resuelta';
  end if;

  select count(*) into v_accepted
  from public.broadcast_applications ba
  where ba.broadcast_id = p_broadcast_id
    and ba.status = 'accepted';
  if v_accepted >= v_broadcast.slots then raise exception 'No quedan cupos'; end if;

  if v_requested > 0 then
    if v_broadcast.project_id is null then
      raise exception 'La búsqueda no está asociada a un proyecto';
    end if;

    update public.work_orders w
    set assigned_installer_id = p_installer_id,
        source = 'broadcast'
    where w.id = any(p_order_ids)
      and w.company_id = v_broadcast.company_id
      and w.project_id = v_broadcast.project_id
      and w.assigned_installer_id is null
      and w.status not in ('finalizada', 'cancelada');

    get diagnostics v_updated = row_count;
    if v_updated <> v_requested then
      raise exception 'Una o más órdenes no están disponibles';
    end if;
  end if;

  insert into public.installers (id)
  values (p_installer_id)
  on conflict (id) do nothing;

  insert into public.company_installers (
    company_id, installer_id, role, status, joined_at
  )
  values (v_broadcast.company_id, p_installer_id, 'installer', 'active', now())
  on conflict (company_id, installer_id)
  do update set
    status = 'active',
    joined_at = coalesce(company_installers.joined_at, now());

  insert into public.company_membership_roles (
    company_id, user_id, role, granted_by
  )
  values (v_broadcast.company_id, p_installer_id, 'installer', auth.uid())
  on conflict (company_id, user_id, role) do nothing;

  insert into public.chat_threads (company_id, installer_id)
  values (v_broadcast.company_id, p_installer_id)
  on conflict (company_id, installer_id) do nothing;

  update public.broadcast_applications
  set status = 'accepted'
  where broadcast_id = p_broadcast_id
    and installer_id = p_installer_id;

  select p.locale into v_installer_locale
  from public.profiles p
  where p.id = p_installer_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    p_installer_id,
    'application_accepted',
    case when v_installer_locale = 'pt' then 'Candidatura aceita'
         else 'Postulación aceptada' end,
    case when v_installer_locale = 'pt'
         then 'Você entrou para a equipe de ' || v_broadcast.title
         else 'Te sumaron al equipo para ' || v_broadcast.title end,
    jsonb_build_object(
      'url', '/jobs',
      'broadcast_id', p_broadcast_id,
      'installer_id', p_installer_id,
      'company_id', v_broadcast.company_id,
      'locale', v_installer_locale
    )
  );

  if v_accepted + 1 >= v_broadcast.slots then
    insert into public.notifications (user_id, type, title, body, data)
    select
      ba.installer_id,
      'application_rejected',
      case when p.locale = 'pt' then 'Candidatura não selecionada'
           else 'Postulación no seleccionada' end,
      case when p.locale = 'pt'
           then 'As vagas de ' || v_broadcast.title || ' foram preenchidas'
           else 'Se completaron los cupos para ' || v_broadcast.title end,
      jsonb_build_object(
        'url', '/jobs',
        'broadcast_id', p_broadcast_id,
        'company_id', v_broadcast.company_id,
        'locale', p.locale
      )
    from public.broadcast_applications ba
    join public.profiles p on p.id = ba.installer_id
    where ba.broadcast_id = p_broadcast_id
      and ba.status = 'applied';

    update public.broadcasts
    set status = 'closed'
    where id = p_broadcast_id;

    update public.broadcast_applications
    set status = 'rejected'
    where broadcast_id = p_broadcast_id
      and status = 'applied';
  end if;
end;
$$;

revoke all on function public.accept_broadcast_application(uuid, uuid, uuid[])
  from public;
grant execute on function public.accept_broadcast_application(uuid, uuid, uuid[])
  to authenticated;

comment on table public.company_membership_roles is
  'Capacidades aditivas de una membresía empresa-persona. Fuente de verdad desde R1.';
comment on column public.company_installers.role is
  'Proyección legacy preferente; usar company_membership_roles para autorización.';

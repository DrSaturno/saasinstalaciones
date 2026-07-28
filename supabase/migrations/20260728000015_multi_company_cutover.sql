-- Fase 6a: corte definitivo del rol global de coordinador.
--
-- PRECONDICIÓN OPERATIVA: desplegar primero la aplicación que lee
-- company_installers.role. Esta migración elimina la representación legacy de
-- profiles y las ramas duales de RLS; la información de rol por empresa no se
-- pierde porque ya vive en company_installers.

-- ---------------------------------------------------------------------------
-- 1. Las policies de coordinación dejan de consultar profiles.role/company_id.
-- ---------------------------------------------------------------------------

drop policy if exists company_installers_coordinator_read on public.company_installers;
create policy company_installers_coordinator_read on public.company_installers
  for select using (
    company_id in (select public.auth_companies('coordinator'))
  );

drop policy if exists invitations_coordinator_read on public.invitations;
create policy invitations_coordinator_read on public.invitations
  for select using (
    company_id in (select public.auth_companies('coordinator'))
  );

drop policy if exists installer_weekly_coordinator_read on public.installer_weekly_availability;
create policy installer_weekly_coordinator_read on public.installer_weekly_availability
  for select using (
    company_id in (select public.auth_companies('coordinator'))
  );

drop policy if exists installer_unavailability_coordinator_read on public.installer_unavailability;
create policy installer_unavailability_coordinator_read on public.installer_unavailability
  for select using (
    company_id in (select public.auth_companies('coordinator'))
  );

drop policy if exists projects_coordinator_all on public.projects;
create policy projects_coordinator_all on public.projects
  for all using (
    coordinator_id = auth.uid()
    and company_id in (select public.auth_companies('coordinator'))
  )
  with check (
    coordinator_id = auth.uid()
    and company_id in (select public.auth_companies('coordinator'))
  );

drop policy if exists sites_coordinator_all on public.sites;
create policy sites_coordinator_all on public.sites
  for all using (
    company_id in (select public.auth_companies('coordinator'))
    and public.can_operate_project(project_id)
  )
  with check (
    company_id in (select public.auth_companies('coordinator'))
    and public.can_operate_project(project_id)
  );

drop policy if exists work_orders_coordinator_all on public.work_orders;
create policy work_orders_coordinator_all on public.work_orders
  for all using (
    company_id in (select public.auth_companies('coordinator'))
    and public.can_operate_project(project_id)
  )
  with check (
    company_id in (select public.auth_companies('coordinator'))
    and public.can_operate_project(project_id)
  );

drop policy if exists order_updates_coordinator_all on public.order_updates;
create policy order_updates_coordinator_all on public.order_updates
  for all using (
    company_id in (select public.auth_companies('coordinator'))
    and exists (
      select 1
      from public.work_orders w
      where w.id = order_id
        and public.can_operate_project(w.project_id)
    )
  )
  with check (
    company_id in (select public.auth_companies('coordinator'))
    and exists (
      select 1
      from public.work_orders w
      where w.id = order_id
        and public.can_operate_project(w.project_id)
    )
  );

drop policy if exists broadcasts_coordinator_all on public.broadcasts;
create policy broadcasts_coordinator_all on public.broadcasts
  for all using (
    company_id in (select public.auth_companies('coordinator'))
    and project_id is not null
    and public.can_operate_project(project_id)
  )
  with check (
    company_id in (select public.auth_companies('coordinator'))
    and project_id is not null
    and public.can_operate_project(project_id)
  );

drop policy if exists site_attachments_coordinator_all on public.site_attachments;
create policy site_attachments_coordinator_all on public.site_attachments
  for all using (
    company_id in (select public.auth_companies('coordinator'))
    and exists (
      select 1
      from public.sites s
      where s.id = site_id
        and public.can_operate_project(s.project_id)
    )
  )
  with check (
    company_id in (select public.auth_companies('coordinator'))
    and exists (
      select 1
      from public.sites s
      where s.id = site_id
        and public.can_operate_project(s.project_id)
    )
  );

drop policy if exists order_attachments_coordinator_all on public.order_attachments;
create policy order_attachments_coordinator_all on public.order_attachments
  for all using (
    company_id in (select public.auth_companies('coordinator'))
    and exists (
      select 1
      from public.work_orders w
      where w.id = order_id
        and public.can_operate_project(w.project_id)
    )
  )
  with check (
    company_id in (select public.auth_companies('coordinator'))
    and exists (
      select 1
      from public.work_orders w
      where w.id = order_id
        and public.can_operate_project(w.project_id)
    )
  );

drop policy if exists order_incidents_coordinator_all on public.order_incidents;
create policy order_incidents_coordinator_all on public.order_incidents
  for all using (
    company_id in (select public.auth_companies('coordinator'))
    and exists (
      select 1
      from public.work_orders w
      where w.id = order_id
        and public.can_operate_project(w.project_id)
    )
  )
  with check (
    company_id in (select public.auth_companies('coordinator'))
    and exists (
      select 1
      from public.work_orders w
      where w.id = order_id
        and public.can_operate_project(w.project_id)
    )
  );

drop policy if exists ratings_coordinator_insert on public.ratings;
create policy ratings_coordinator_insert on public.ratings
  for insert with check (
    company_id in (select public.auth_companies('coordinator'))
    and exists (
      select 1
      from public.work_orders w
      where w.id = order_id
        and w.status = 'finalizada'
        and public.can_operate_project(w.project_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 2. El perfil pasa a describir el tipo de cuenta, no el rol por empresa.
-- ---------------------------------------------------------------------------

alter table public.profiles
  disable trigger profiles_prevent_privilege_change;

update public.profiles
set role = 'installer',
    company_id = null
where role = 'coordinator';

alter table public.profiles
  enable trigger profiles_prevent_privilege_change;

alter table public.profiles
  drop constraint if exists company_roles_have_company;
alter table public.profiles
  drop constraint if exists manager_has_company;
alter table public.profiles
  add constraint manager_has_company
  check (role <> 'company_manager' or company_id is not null);

alter table public.profiles
  drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('platform_admin', 'company_manager', 'installer'));

-- Las altas por invitación siempre crean una cuenta de campo. Aunque un
-- cliente viejo mande metadata role=coordinator, el rol puntual se aplicará
-- después en company_installers mediante accept_invitation().
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested_role text := coalesce(new.raw_user_meta_data ->> 'role', 'installer');
  v_role text;
  v_company uuid;
begin
  v_role := case
    when v_requested_role = 'platform_admin' then 'platform_admin'
    when v_requested_role = 'company_manager' then 'company_manager'
    else 'installer'
  end;
  v_company := case
    when v_role = 'company_manager'
      then nullif(new.raw_user_meta_data ->> 'company_id', '')::uuid
    else null
  end;

  insert into public.profiles (id, role, company_id, full_name, locale)
  values (
    new.id,
    v_role,
    v_company,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'locale', 'es')
  );

  if v_role = 'installer' then
    insert into public.installers (id)
    values (new.id)
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;

-- Ya no existe una RPC que necesite modificar role/company_id de un perfil.
create or replace function public.prevent_privilege_change()
returns trigger
language plpgsql
as $$
begin
  if (
    new.role is distinct from old.role
    or new.company_id is distinct from old.company_id
  )
  and current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
  and auth.role() is distinct from 'service_role' then
    raise exception 'role/company_id solo modificables por el tablero maestro';
  end if;
  return new;
end;
$$;

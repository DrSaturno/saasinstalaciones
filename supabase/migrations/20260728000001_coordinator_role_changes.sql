-- Cambios de rol entre instalador y coordinador.
--
-- Tres cosas:
--   1. Ascender ya NO saca del equipo. El coordinador sigue activo en el roster
--      y conserva sus órdenes: coordina y además puede instalar.
--   2. Se puede volver atrás: nueva RPC para bajar de coordinador a instalador.
--   3. Ambos cambios avisan a la persona con una notificación (que es lo que
--      dispara el push).
--
-- Idempotente: se puede re-ejecutar sin daño.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Trigger anti-escalación: la excepción ahora cubre los dos sentidos.
-- ─────────────────────────────────────────────────────────────────────────────
-- Sigue valiendo el modelo de seguridad original: la excepción solo se abre con
-- el flag local que pone la RPC, solo entre installer y coordinator, y JAMÁS
-- sobre uno mismo. RLS impide además tocar filas ajenas por la vía directa.

create or replace function public.prevent_privilege_change()
returns trigger
language plpgsql
as $$
begin
  if (new.role is distinct from old.role or new.company_id is distinct from old.company_id)
     and current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and auth.role() is distinct from 'service_role'
     -- Excepción vetada: cambio installer <-> coordinator hecho por una RPC,
     -- sobre otra persona (nunca sobre uno mismo).
     and not (
       coalesce(current_setting('app.role_change_by_rpc', true), '') = 'on'
       and (
         (old.role = 'installer'   and new.role = 'coordinator') or
         (old.role = 'coordinator' and new.role = 'installer')
       )
       and new.id is distinct from auth.uid()
     )
     -- Compatibilidad con el flag anterior, por si quedara alguna transacción
     -- en vuelo con la versión vieja de la RPC.
     and not (
       coalesce(current_setting('app.promote_to_coordinator', true), '') = 'on'
       and old.role = 'installer'
       and new.role = 'coordinator'
       and new.id is distinct from auth.uid()
     ) then
    raise exception 'role/company_id solo modificables por el tablero maestro';
  end if;
  return new;
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Ascender a coordinador — sin sacarlo del equipo, y avisando.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.promote_installer_to_coordinator(p_installer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.auth_company();
  v_company_name text;
  v_target public.profiles;
begin
  if public.auth_role() is distinct from 'company_manager' or v_company is null then
    raise exception 'Acceso denegado';
  end if;
  if p_installer_id = auth.uid() then
    raise exception 'No podés cambiar tu propio rol';
  end if;

  select * into v_target from public.profiles where id = p_installer_id;
  if not found or v_target.role is distinct from 'installer' then
    raise exception 'La persona no es un instalador';
  end if;

  if not exists (
    select 1 from public.company_installers ci
    where ci.company_id = v_company
      and ci.installer_id = p_installer_id
      and ci.status = 'active'
  ) then
    raise exception 'El instalador no pertenece al equipo activo';
  end if;

  perform set_config('app.role_change_by_rpc', 'on', true);

  update public.profiles
    set role = 'coordinator', company_id = v_company
    where id = p_installer_id;

  -- A diferencia de la versión anterior, NO se lo saca del roster ni se le
  -- liberan las órdenes: sigue activo en el equipo y puede seguir instalando.

  select name into v_company_name from public.companies where id = v_company;

  insert into public.notifications (user_id, type, title, body, data)
  select
    p.id,
    'role_promoted',
    case when p.locale = 'pt' then 'Você agora é coordenador'
         else 'Ahora sos coordinador' end,
    case when p.locale = 'pt'
         then coalesce(v_company_name, 'A empresa') || ' promoveu você a coordenador.'
         else coalesce(v_company_name, 'La empresa') || ' te ascendió a coordinador.' end,
    jsonb_build_object(
      'url', '/dashboard',
      'company_id', v_company,
      'locale', p.locale
    )
  from public.profiles p
  where p.id = p_installer_id;

  perform set_config('app.role_change_by_rpc', 'off', true);
end;
$$;

revoke all on function public.promote_installer_to_coordinator(uuid) from public;
grant execute on function public.promote_installer_to_coordinator(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Bajar de coordinador a instalador.
-- ─────────────────────────────────────────────────────────────────────────────
-- Mismas validaciones que ascender: solo el gerente de la misma empresa, nunca
-- sobre uno mismo. Deja a la persona activa en el roster de instaladores.

create or replace function public.demote_coordinator_to_installer(p_coordinator_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.auth_company();
  v_company_name text;
  v_target public.profiles;
begin
  if public.auth_role() is distinct from 'company_manager' or v_company is null then
    raise exception 'Acceso denegado';
  end if;
  if p_coordinator_id = auth.uid() then
    raise exception 'No podés cambiar tu propio rol';
  end if;

  select * into v_target from public.profiles where id = p_coordinator_id;
  if not found or v_target.role is distinct from 'coordinator' then
    raise exception 'La persona no es un coordinador';
  end if;
  if v_target.company_id is distinct from v_company then
    raise exception 'Acceso denegado';
  end if;

  perform set_config('app.role_change_by_rpc', 'on', true);

  update public.profiles
    set role = 'installer', company_id = v_company
    where id = p_coordinator_id;

  -- Los proyectos que coordinaba quedan sin responsable para reasignar.
  update public.projects
    set coordinator_id = null
    where company_id = v_company
      and coordinator_id = p_coordinator_id;

  -- Ficha de instalador: la conserva de antes o se crea si nunca la tuvo.
  insert into public.installers (id)
  values (p_coordinator_id)
  on conflict (id) do nothing;

  -- Vuelve al roster activo de la empresa.
  insert into public.company_installers (company_id, installer_id, status)
  values (v_company, p_coordinator_id, 'active')
  on conflict (company_id, installer_id) do update set status = 'active';

  select name into v_company_name from public.companies where id = v_company;

  insert into public.notifications (user_id, type, title, body, data)
  select
    p.id,
    'role_demoted',
    case when p.locale = 'pt' then 'Seu perfil voltou a instalador'
         else 'Tu perfil volvió a instalador' end,
    case when p.locale = 'pt'
         then coalesce(v_company_name, 'A empresa') || ' alterou seu perfil para instalador.'
         else coalesce(v_company_name, 'La empresa') || ' cambió tu perfil a instalador.' end,
    jsonb_build_object(
      'url', '/home',
      'company_id', v_company,
      'locale', p.locale
    )
  from public.profiles p
  where p.id = p_coordinator_id;

  perform set_config('app.role_change_by_rpc', 'off', true);
end;
$$;

revoke all on function public.demote_coordinator_to_installer(uuid) from public;
grant execute on function public.demote_coordinator_to_installer(uuid) to authenticated;

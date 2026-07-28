-- El coordinador vive en el área instalador.
--
-- Cambio de modelo (2026-07-28): el coordinador ES un instalador con un único
-- privilegio extra — gestionar las órdenes de trabajo de sus proyectos desde
-- /coordination. Ya no es un usuario del área de empresa.
--
-- Esta migración sólo ajusta la notificación de ascenso para que lleve a su
-- nueva pantalla (/coordination en vez de /dashboard). Las políticas RLS de
-- coordinador sobre órdenes quedan como están: son la base de /coordination.
--
-- Idempotente: se puede re-ejecutar sin daño.

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

  -- company_id habilita auth_company() en las políticas RLS de coordinación.
  update public.profiles
    set role = 'coordinator', company_id = v_company
    where id = p_installer_id;

  -- Sigue activo en el roster y conserva sus órdenes: coordina Y ejecuta.

  select name into v_company_name from public.companies where id = v_company;

  insert into public.notifications (user_id, type, title, body, data)
  select
    p.id,
    'role_promoted',
    case when p.locale = 'pt' then 'Você agora é coordenador'
         else 'Ahora sos coordinador' end,
    case when p.locale = 'pt'
         then coalesce(v_company_name, 'A empresa') || ' promoveu você a coordenador. As ordens da sua equipe estão em Coordenação.'
         else coalesce(v_company_name, 'La empresa') || ' te ascendió a coordinador. Las órdenes de tu equipo están en Coordinación.' end,
    jsonb_build_object(
      'url', '/coordination',
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

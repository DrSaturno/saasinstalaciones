-- Ascender un instalador del roster a coordinador de la empresa.
-- Idempotente: se puede re-ejecutar sin daño.
--
-- Modelo de seguridad (defensa en profundidad):
--   1. RLS: `profiles_own_update` sólo deja tocar la PROPIA fila, así que nadie
--      puede modificar el perfil de otro por la vía directa.
--   2. Trigger `prevent_privilege_change`: bloquea todo cambio de role/company_id
--      que no venga de service_role.
--   3. Esta migración abre UNA excepción quirúrgica al trigger: sólo la
--      transición installer -> coordinator, sólo con el flag local puesto por la
--      RPC, y **nunca sobre uno mismo** (auth.uid() <> profiles.id). Aun si
--      alguien lograra poner el flag, no podría auto-ascenderse, y RLS le impide
--      tocar filas ajenas.
--   4. La RPC valida que el caller sea company_manager de la misma empresa y que
--      el target sea un installer del roster activo.

create or replace function public.prevent_privilege_change()
returns trigger
language plpgsql
as $$
begin
  if (new.role is distinct from old.role or new.company_id is distinct from old.company_id)
     and current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and auth.role() is distinct from 'service_role'
     -- Excepción vetada: ascenso a coordinador hecho por la RPC, sobre otra
     -- persona (jamás sobre uno mismo).
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

create or replace function public.promote_installer_to_coordinator(p_installer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.auth_company();
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

  -- Flag LOCAL a la transacción: sólo habilita la excepción del trigger acá.
  perform set_config('app.promote_to_coordinator', 'on', true);

  update public.profiles
    set role = 'coordinator', company_id = v_company
    where id = p_installer_id;

  -- Sale del roster de instaladores: ahora coordina, no ejecuta.
  update public.company_installers
    set status = 'removed'
    where company_id = v_company and installer_id = p_installer_id;

  -- Libera sus órdenes sin terminar para que se puedan reasignar.
  update public.work_orders
    set assigned_installer_id = null
    where company_id = v_company
      and assigned_installer_id = p_installer_id
      and status not in ('finalizada', 'cancelada');

  perform set_config('app.promote_to_coordinator', 'off', true);
end;
$$;

revoke all on function public.promote_installer_to_coordinator(uuid) from public;
grant execute on function public.promote_installer_to_coordinator(uuid) to authenticated;

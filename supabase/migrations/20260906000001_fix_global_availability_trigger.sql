-- Arregla un trigger que hacía imposible cargar una ausencia global.
--
-- `validate_global_availability_owner` es el mismo trigger para las dos tablas
-- globales, y validaba el huso así:
--
--     if tg_table_name = 'installer_global_weekly_availability'
--        and not exists (select 1 from pg_timezone_names where name = new.timezone)
--
-- La intención se lee bien, pero PL/pgSQL evalúa la expresión completa como una
-- sola sentencia SQL: no hay cortocircuito que salve a `new.timezone`, y
-- `installer_global_unavailability` no tiene esa columna. Resultado: **todo
-- insert en la tabla de ausencias globales fallaba** con
-- `record "new" has no field "timezone"`.
--
-- Estuvo así desde el 12-08-2026 y no lo notó nadie porque ninguna pantalla
-- usaba la tabla. Apareció al conectarla, que es exactamente para lo que sirve
-- conectar una fundación que estaba colada y sin usar.
--
-- El arreglo es anidar el `if`, de modo que `new.timezone` sólo se evalúe
-- cuando la fila efectivamente tiene esa columna.

create or replace function public.validate_global_availability_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if tg_table_name = 'installer_global_weekly_availability' then
    if not exists (
      select 1 from pg_catalog.pg_timezone_names tz where tz.name = new.timezone
    ) then
      raise exception 'INVALID_TIMEZONE';
    end if;
  end if;

  if auth.uid() is not null then
    if new.installer_id is distinct from auth.uid()
       or not public.auth_has_company_role(new.company_id, 'installer') then
      raise exception 'GLOBAL_AVAILABILITY_OWNER_MISMATCH';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$fn$;

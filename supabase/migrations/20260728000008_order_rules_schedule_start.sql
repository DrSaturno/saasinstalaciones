-- Dos reglas más sobre la orden de trabajo:
--
--   5. No se planifica sin fecha programada. Y sin planificar tampoco se
--      inicia, porque iniciar exige venir de 'planificada'.
--   6. Iniciar el trabajo es potestad EXCLUSIVA del instalador asignado. Ni el
--      coordinador ni la empresa arrancan un trabajo por él: sólo la persona
--      que está en el punto sabe que empezó.
--
-- Se reescribe la función completa (incluye las reglas 1-4 de la migración
-- 20260728000006) porque `create or replace` reemplaza el cuerpo entero.
--
-- Idempotente: se puede re-ejecutar sin daño.

create or replace function public.validate_order_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.auth_role();
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

  -- Regla 1: salir de 'pendiente' exige instalador asignado (cancelar exento).
  if old.status = 'pendiente'
     and new.status <> 'cancelada'
     and new.assigned_installer_id is null then
    raise exception 'La orden necesita un instalador asignado antes de avanzar';
  end if;

  -- Regla 5: no se planifica sin fecha programada.
  if new.status = 'planificada' and new.scheduled_date is null then
    raise exception 'La orden necesita una fecha programada para planificarse';
  end if;

  -- Regla 4: si hubo relevamiento, tiene que quedar asentado qué se relevó.
  if old.status = 'relevamiento' and new.status = 'planificada' then
    if not exists (
      select 1 from public.order_updates u
      where u.order_id = new.id and u.type = 'survey'
    ) then
      raise exception 'Falta registrar el relevamiento antes de planificar';
    end if;
  end if;

  if new.status = 'en_proceso' and old.status = 'planificada' then
    -- Regla 2: no se arranca el trabajo sin haberlo aceptado.
    if new.installer_accepted_at is null then
      raise exception 'El instalador tiene que aceptar la orden antes de iniciarla';
    end if;

    -- Regla 6: sólo el instalador asignado inicia el trabajo.
    -- `v_role` es null fuera de una sesión (seeds, scripts): ahí no aplica.
    if v_role is not null and auth.uid() is distinct from new.assigned_installer_id then
      raise exception 'Sólo el instalador asignado puede iniciar el trabajo';
    end if;
  end if;

  -- Regla 3: mandar a revisión es potestad del instalador asignado.
  if new.status = 'en_revision' and v_role is not null then
    if auth.uid() is distinct from new.assigned_installer_id then
      raise exception 'Sólo el instalador asignado puede enviar la orden a revisión';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

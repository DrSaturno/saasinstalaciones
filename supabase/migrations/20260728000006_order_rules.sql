-- Reglas de negocio de la orden de trabajo, en la base.
--
-- La DB es la fuente de verdad (regla no negociable #4): estas reglas se
-- validan también en las Server Actions para dar mensajes claros, pero acá
-- quedan garantizadas aunque alguien saltee la UI.
--
--   1. No se sale de 'pendiente' sin instalador asignado.
--   2. No se pasa a 'en_proceso' sin que el instalador haya ACEPTADO la orden.
--   3. 'en_revision' sólo la manda el instalador asignado. El coordinador
--      aprueba y la empresa es última instancia, pero ninguno de los dos
--      "envía a revisión".
--   4. Si la orden pasó por 'relevamiento', no se puede planificar sin dejar
--      asentado el relevamiento. Si va de 'pendiente' derecho a 'planificada',
--      no se pide nada.
--
-- Idempotente: se puede re-ejecutar sin daño.

-- ---------------------------------------------------------------------------
-- 1. Nuevo tipo de avance: el acta de relevamiento
-- ---------------------------------------------------------------------------
alter table public.order_updates
  drop constraint if exists order_updates_type_check;

alter table public.order_updates
  add constraint order_updates_type_check
  check (type in ('checkin', 'progress', 'blocker', 'done', 'system', 'survey'));


-- ---------------------------------------------------------------------------
-- 2. La máquina de estados, con las reglas nuevas
-- ---------------------------------------------------------------------------
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

  -- Transiciones permitidas (sin cambios respecto del original).
  if not (
    (old.status = 'pendiente'    and new.status in ('relevamiento', 'planificada', 'cancelada')) or
    (old.status = 'relevamiento' and new.status in ('planificada', 'cancelada')) or
    (old.status = 'planificada'  and new.status in ('en_proceso', 'cancelada')) or
    (old.status = 'en_proceso'   and new.status in ('en_revision')) or
    (old.status = 'en_revision'  and new.status in ('finalizada', 'en_proceso'))
  ) then
    raise exception 'transición de estado inválida: % → %', old.status, new.status;
  end if;

  -- Regla 1: salir de 'pendiente' exige instalador asignado.
  -- Cancelar queda exento: una orden se cancela sin haber asignado a nadie.
  if old.status = 'pendiente'
     and new.status <> 'cancelada'
     and new.assigned_installer_id is null then
    raise exception 'La orden necesita un instalador asignado antes de avanzar';
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

  -- Regla 2: no se arranca el trabajo sin haberlo aceptado.
  if new.status = 'en_proceso' and old.status = 'planificada'
     and new.installer_accepted_at is null then
    raise exception 'El instalador tiene que aceptar la orden antes de iniciarla';
  end if;

  -- Regla 3: mandar a revisión es potestad del instalador asignado.
  -- `v_role` es null fuera de una sesión (seeds, scripts): ahí no se aplica.
  if new.status = 'en_revision' and v_role is not null then
    if v_role <> 'installer' and v_role <> 'coordinator' then
      raise exception 'Sólo el instalador asignado puede enviar la orden a revisión';
    end if;
    if auth.uid() is distinct from new.assigned_installer_id then
      raise exception 'Sólo el instalador asignado puede enviar la orden a revisión';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- El trigger tiene que ver también los cambios de instalador y de aceptación,
-- porque las reglas 1 y 2 dependen de esas columnas.
drop trigger if exists work_orders_validate_transition on public.work_orders;
create trigger work_orders_validate_transition
  before update on public.work_orders
  for each row
  when (old.status is distinct from new.status)
  execute function public.validate_order_transition();

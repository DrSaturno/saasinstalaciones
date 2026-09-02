-- Fase 1 de relevamiento y ejecución: conectar los dos modelos.
--
-- Esto habilita el caso que hoy es IMPOSIBLE: una orden cuyo único trabajo es
-- el relevamiento se cierra al aprobarse, sin pasar por `planificada` ni
-- `en_proceso`. Hoy hay que inventarle una ejecución que nunca ocurrió, que es
-- literalmente lo que AC-07-A prohíbe.
--
-- **La compuerta.** `validate_order_transition` no tiene bypass, y con razón:
-- es lo que impide que alguien escriba `status` a mano. Pero la proyección
-- necesita hacer saltos que un humano no puede hacer, así que se agrega
-- `app.activity_sync`, con el mismo criterio que el `app.assignment_gate` que
-- ya protege los campos de agenda.
--
-- La compuerta se abre y se cierra alrededor de UNA sola escritura, no para
-- toda la transacción. Dejarla abierta convertiría un guardián en un adorno.
--
-- **Y va en las dos direcciones.** La app sigue moviendo `work_orders.status`
-- por `transitionOrder` en todos lados. Si sólo proyectáramos actividad →
-- orden, las actividades de las 30 órdenes existentes quedarían mintiendo en
-- cuanto alguien avanzara una por el camino viejo. El sync inverso las mantiene
-- honestas mientras dure la convivencia.
--
-- El mismo flag corta el ciclo: una proyección no dispara la otra.

-- ---------------------------------------------------------------------------
-- La compuerta en el validador de transiciones
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

  -- Proyección desde las actividades: se saltea la máquina de estados legacy
  -- porque la actividad ya validó lo suyo. Es la única vía que puede hacerlo,
  -- y `project_activity_to_order` abre y cierra el flag alrededor de su
  -- propia escritura.
  if current_setting('app.activity_sync', true) = 'on' then
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

  if old.status = 'pendiente'
     and new.status <> 'cancelada'
     and new.assigned_installer_id is null then
    raise exception 'La orden necesita un instalador asignado antes de avanzar';
  end if;

  if old.status = 'relevamiento' and new.status = 'planificada' then
    if not exists (
      select 1 from public.order_updates u
      where u.order_id = new.id and u.type = 'survey'
    ) then
      raise exception 'Falta registrar el relevamiento antes de planificar';
    end if;
  end if;

  if new.status = 'en_proceso' and old.status = 'planificada'
     and new.installer_accepted_at is null then
    raise exception 'El instalador tiene que aceptar la orden antes de iniciarla';
  end if;

  if new.status = 'en_revision' and v_role is not null then
    if v_role <> 'installer' and v_role <> 'coordinator' then
      raise exception 'Sólo el instalador asignado puede enviar la orden a revisión';
    end if;
    if auth.uid() is distinct from new.assigned_installer_id then
      raise exception 'Sólo el instalador asignado puede enviar la orden a revisión';
    end if;
  end if;

  if old.status = 'en_revision'
     and new.status in ('finalizada', 'en_proceso')
     and auth.uid() is not null
     and auth.uid() = old.assigned_installer_id then
    raise exception 'No podés aprobar ni reabrir tu propia entrega';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Actividad → orden
-- ---------------------------------------------------------------------------

create or replace function public.project_activity_to_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_execution boolean;
  v_target text;
begin
  if current_setting('app.activity_sync', true) = 'on' then
    return new;
  end if;
  if new.lifecycle is not distinct from old.lifecycle then
    return new;
  end if;

  select exists (
    select 1 from public.work_activities a
    where a.work_order_id = new.work_order_id
      and a.activity_type = 'execution'
  ) into v_has_execution;

  -- Sólo se proyecta desde el relevamiento cuando ES el trabajo. Si además hay
  -- ejecución, el estado de la orden lo manda la ejecución: un relevamiento
  -- aprobado en una orden combinada NO la termina, la habilita.
  if new.activity_type = 'survey' and v_has_execution then
    return new;
  end if;

  -- Dos mapeos, uno por tipo de actividad. El del relevamiento es el que
  -- importa: cuando el relevamiento ES el trabajo, va del envío a la revisión
  -- y de ahí al cierre, sin pasar por 'planificada' ni 'en_proceso'. Ése es el
  -- punto de toda la fase — hoy ese camino obliga a inventar una ejecución.
  if new.activity_type = 'survey' then
    v_target := case new.lifecycle
      when 'draft'             then 'pendiente'
      when 'scheduled'         then 'relevamiento'
      when 'in_progress'       then 'relevamiento'
      when 'changes_requested' then 'relevamiento'
      when 'submitted'         then 'en_revision'
      when 'approved'          then 'finalizada'
      when 'completed'         then 'finalizada'
      when 'cancelled'         then 'cancelada'
    end;
  else
    v_target := case new.lifecycle
      when 'draft'             then 'pendiente'
      when 'scheduled'         then 'planificada'
      when 'in_progress'       then 'en_proceso'
      when 'changes_requested' then 'en_proceso'
      when 'submitted'         then 'en_revision'
      when 'approved'          then 'finalizada'
      when 'completed'         then 'finalizada'
      when 'cancelled'         then 'cancelada'
    end;
  end if;

  if v_target is null then return new; end if;

  perform set_config('app.activity_sync', 'on', true);
  update public.work_orders
  set status = v_target
  where id = new.work_order_id and status is distinct from v_target;
  perform set_config('app.activity_sync', 'off', true);

  return new;
end;
$$;

drop trigger if exists work_activities_project_order on public.work_activities;
create trigger work_activities_project_order
  after update of lifecycle on public.work_activities
  for each row execute function public.project_activity_to_order();

-- ---------------------------------------------------------------------------
-- Orden → actividad de ejecución
--
-- Mientras la aplicación siga moviendo el estado escalar por `transitionOrder`,
-- esto es lo que evita que las actividades queden mintiendo.
-- ---------------------------------------------------------------------------

create or replace function public.project_order_to_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target text;
begin
  if current_setting('app.activity_sync', true) = 'on' then
    return new;
  end if;
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_target := case new.status
    when 'pendiente'    then 'draft'
    when 'relevamiento' then 'draft'
    when 'planificada'  then 'scheduled'
    when 'en_proceso'   then 'in_progress'
    when 'en_revision'  then 'submitted'
    when 'finalizada'   then 'completed'
    when 'cancelada'    then 'cancelled'
  end;
  if v_target is null then return new; end if;

  perform set_config('app.activity_sync', 'on', true);
  update public.work_activities
  set lifecycle = v_target
  where work_order_id = new.id
    and activity_type = 'execution'
    and lifecycle is distinct from v_target;
  perform set_config('app.activity_sync', 'off', true);

  return new;
end;
$$;

drop trigger if exists work_orders_project_activity on public.work_orders;
create trigger work_orders_project_activity
  after update of status on public.work_orders
  for each row execute function public.project_order_to_activity();

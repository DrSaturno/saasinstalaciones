-- Punto 24, Fase 0: las etapas de campo que faltaban y la traza estructurada.
--
-- El flujo pedido es: aceptar → en camino → llegada → avance → [bloqueo] →
-- finalización → aprobación. De esas, "en camino" no existía en ninguna
-- forma y "llegada" era un efecto secundario de "Iniciar" (el botón encolaba
-- el check-in y la transición a `en_proceso` de un solo golpe).
--
-- Se modelan como ESTADOS y no como marcas de tiempo dentro de `en_proceso`
-- (DEC-24-01) porque el valor operativo real es que el coordinador vea
-- "¿ya salió?" en la lista de órdenes y en la agenda, sin derivarlo de otra
-- tabla.

alter table public.work_orders drop constraint if exists work_orders_status_check;
alter table public.work_orders
  add constraint work_orders_status_check check (status in (
    'pendiente', 'relevamiento', 'planificada',
    'en_camino', 'en_sitio',
    'en_proceso', 'en_revision', 'finalizada', 'cancelada'));

-- ---------------------------------------------------------------------------
-- Estado anterior y nuevo, en columnas
-- ---------------------------------------------------------------------------

-- Hasta acá el único rastro de un cambio de estado era una frase en prosa
-- ("Estado cambiado a Finalizada"), traducida al idioma de quien la ejecutó.
-- Reconstruir el historial obligaba a parsear ese texto. `REQ-14.2` pide
-- estado previo y nuevo; esto es eso.
--
-- La nota en prosa se conserva: ya hay historial escrito con ella, y
-- reescribir el pasado para que se parezca al modelo nuevo sería falsearlo.
alter table public.order_updates
  add column if not exists from_status text,
  add column if not exists to_status text;

comment on column public.order_updates.from_status is
  'Estado de la orden antes del cambio. Null en eventos que no mueven el estado (avance, mensaje).';
comment on column public.order_updates.to_status is
  'Estado de la orden después del cambio. Null en eventos que no mueven el estado.';

create index if not exists order_updates_transitions_idx
  on public.order_updates (order_id, created_at desc)
  where to_status is not null;

-- ---------------------------------------------------------------------------
-- La máquina de estados
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

  if current_setting('app.activity_sync', true) = 'on' then
    new.updated_at := now();
    return new;
  end if;

  -- `planificada → en_proceso` SE CONSERVA además del camino largo
  -- (DEC-24-01): las órdenes que ya venían de un flujo sin estas etapas, la
  -- proyección desde `work_activities` (que no sabe de traslados) y el
  -- trabajo que empieza sin traslado —el instalador ya estaba en el sitio por
  -- otra orden— dependen de él. La secuencia se guía en la UI, no se impone
  -- en la base.
  --
  -- `finalizada → en_proceso` es nuevo: reabrir un trabajo ya aprobado
  -- (FLD-R6.4). Hasta acá `finalizada` era terminal.
  if not (
    (old.status = 'pendiente'    and new.status in ('relevamiento', 'planificada', 'cancelada')) or
    (old.status = 'relevamiento' and new.status in ('planificada', 'cancelada')) or
    (old.status = 'planificada'  and new.status in ('en_camino', 'en_sitio', 'en_proceso', 'cancelada')) or
    (old.status = 'en_camino'    and new.status in ('en_sitio', 'en_proceso', 'cancelada')) or
    (old.status = 'en_sitio'     and new.status in ('en_proceso', 'cancelada')) or
    (old.status = 'en_proceso'   and new.status in ('en_revision')) or
    (old.status = 'en_revision'  and new.status in ('finalizada', 'en_proceso')) or
    (old.status = 'finalizada'   and new.status in ('en_proceso'))
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

  -- Aceptar es la etapa 1 del flujo: a partir de ahí el instalador asume el
  -- compromiso. Antes esta regla miraba sólo `planificada → en_proceso`;
  -- ahora el camino largo puede arrancar por `en_camino`, así que se aplica a
  -- CUALQUIER salida de `planificada` hacia el trabajo. Sin esto, salir por
  -- la etapa nueva esquivaba la aceptación.
  if old.status = 'planificada'
     and new.status in ('en_camino', 'en_sitio', 'en_proceso')
     and new.installer_accepted_at is null then
    raise exception 'El instalador tiene que aceptar la orden antes de iniciarla';
  end if;

  -- Salir en camino y declarar que se llegó son hechos que sólo sabe quien se
  -- está moviendo (FLD-R1.2). Mismo criterio y misma forma que la regla de
  -- `en_revision` que ya existía. `v_role` es null fuera de una sesión
  -- (seeds, scripts): ahí no se aplica.
  if new.status in ('en_camino', 'en_sitio') and v_role is not null then
    if auth.uid() is distinct from new.assigned_installer_id then
      raise exception 'Sólo el instalador asignado puede marcar el traslado y la llegada';
    end if;
  end if;

  if new.status = 'en_revision' and v_role is not null then
    if v_role <> 'installer' and v_role <> 'coordinator' then
      raise exception 'Sólo el instalador asignado puede enviar la orden a revisión';
    end if;
    if auth.uid() is distinct from new.assigned_installer_id then
      raise exception 'Sólo el instalador asignado puede enviar la orden a revisión';
    end if;
  end if;

  -- ADR-001: quien ejecutó no aprueba ni reabre su propia entrega, aunque
  -- además sea coordinador del proyecto. Ahora cubre también la reapertura
  -- desde `finalizada`, que antes no existía como transición.
  if old.status in ('en_revision', 'finalizada')
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
-- Proyección orden → actividad
-- ---------------------------------------------------------------------------

-- El `case` devolvía null para estados desconocidos y salía sin escribir, así
-- que los estados nuevos no rompían nada — pero dejaban la actividad quieta
-- mientras la orden avanzaba, y eso era correcto sólo por accidente.
--
-- Se mapean explícitamente a `scheduled`: el traslado y la llegada son
-- preparación, la actividad de ejecución todavía no empezó. Mapearlos a
-- `in_progress` habría causado un rebote — el camino inverso
-- (`in_progress → en_proceso`) devolvería la orden a `en_proceso` sola,
-- saltándose la etapa que el instalador acaba de marcar.
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
    when 'en_camino'    then 'scheduled'
    when 'en_sitio'     then 'scheduled'
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

-- ---------------------------------------------------------------------------
-- Cache de estado del sitio
-- ---------------------------------------------------------------------------

-- Bug real que destapan los estados nuevos: la clasificación es por listas
-- cerradas con un `else 'pendiente'` al final. Una orden que avanzaba de
-- `planificada` a `en_camino` no caía en ninguna rama y terminaba en el
-- `else`, así que el sitio RETROCEDÍA de 'planificada' a 'pendiente' justo
-- cuando el instalador salía para allá.
--
-- `en_camino` cuenta como planificada (todavía no llegó nadie al punto) y
-- `en_sitio` como en proceso (ya hay alguien interviniendo el lugar).
create or replace function public.refresh_site_status()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_site uuid := coalesce(new.site_id, old.site_id);
  v_status text;
begin
  select case
    when count(*) = 0 then 'sin_ordenes'
    when count(*) filter (where status not in ('finalizada', 'cancelada')) = 0 then 'finalizada'
    when count(*) filter (where status in ('en_sitio', 'en_proceso', 'en_revision')) > 0 then 'en_proceso'
    when count(*) filter (where status in ('planificada', 'en_camino')) > 0 then 'planificada'
    else 'pendiente'
  end into v_status
  from public.work_orders where site_id = v_site;

  update public.sites set status = v_status where id = v_site;
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- Tipo de evento para el traslado
-- ---------------------------------------------------------------------------

-- `checkin` ya significaba la llegada al punto; le faltaba el par para la
-- salida. Sin un tipo propio, el traslado tendría que escribirse como
-- 'system', que es el cajón de los cambios hechos por la empresa — y perdería
-- la distinción entre "el instalador informó que salió" y "alguien movió el
-- estado".
alter table public.order_updates drop constraint order_updates_type_check;
alter table public.order_updates
  add constraint order_updates_type_check
    check (type in ('checkin', 'travel', 'progress', 'blocker', 'done',
                    'system', 'survey', 'message'));

comment on column public.order_updates.type is
  'Hitos operativos (travel/checkin/progress/blocker/done/survey/system) más ''message'': un mensaje libre que no mueve el estado de la orden.';

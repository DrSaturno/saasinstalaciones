-- Punto 24, Fase 1: evidencia mínima para poder cerrar un trabajo.
--
-- Hasta acá una orden se podía mandar a revisión con CERO fotos. No había
-- ningún mínimo en ninguna capa: ni dominio, ni acción, ni base. El pedido
-- pide "un mínimo de evidencia fotográfica, por ejemplo tres, pudiendo
-- establecerse una cantidad diferente según el tipo de trabajo".

alter table public.companies
  add column if not exists min_completion_photos smallint not null default 3
    check (min_completion_photos between 0 and 20);

-- Nullable A PROPÓSITO: `null` significa "usá el de la empresa", no "cero".
-- Un default numérico acá obligaría a retocar proyecto por proyecto cada vez
-- que la empresa cambia su política.
alter table public.projects
  add column if not exists min_completion_photos smallint
    check (min_completion_photos between 0 and 20);

comment on column public.companies.min_completion_photos is
  'Fotos mínimas para solicitar la finalización. Baseline 3.';
comment on column public.projects.min_completion_photos is
  'Override del mínimo de la empresa para este proyecto. Null = usar el de la empresa.';

-- ---------------------------------------------------------------------------
-- Una sola definición del mínimo
-- ---------------------------------------------------------------------------

-- El dominio decide si ofrece el botón, la acción rechaza con un mensaje
-- claro y el trigger es la última palabra. Los tres tienen que estar de
-- acuerdo, y la única forma de garantizarlo es que la precedencia
-- —proyecto, si no empresa— viva en un solo lugar.
create or replace function public.order_min_photos(p_order uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(p.min_completion_photos, c.min_completion_photos, 3)
  from public.work_orders o
  join public.companies c on c.id = o.company_id
  left join public.projects p on p.id = o.project_id
  where o.id = p_order;
$fn$;

revoke all on function public.order_min_photos(uuid) from public;
grant execute on function public.order_min_photos(uuid) to authenticated;

-- Cuenta las fotos de TODA la orden, no las del evento de cierre (FLD-R4.3):
-- quien documentó bien durante la ejecución no tiene que volver a fotografiar
-- lo mismo para poder cerrar.
create or replace function public.order_photo_count(p_order uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(sum(jsonb_array_length(u.photos)), 0)::integer
  from public.order_updates u
  where u.order_id = p_order
    and jsonb_typeof(u.photos) = 'array';
$fn$;

revoke all on function public.order_photo_count(uuid) from public;
grant execute on function public.order_photo_count(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- La regla, en la última capa
-- ---------------------------------------------------------------------------

-- Se agrega al trigger que ya valida las transiciones. Es el único control
-- que la cola offline no puede esquivar: `installerTransition` escribe por su
-- propio camino cuando vuelve la señal, así que una validación que viva sólo
-- en la Server Action se saltea sola en cuanto el teléfono sincroniza.
-- `AC-14-A` pide explícitamente "servidor y DB".
create or replace function public.validate_order_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.auth_role();
  v_min integer;
  v_photos integer;
begin
  if old.status = new.status then
    new.updated_at := now();
    return new;
  end if;

  if current_setting('app.activity_sync', true) = 'on' then
    new.updated_at := now();
    return new;
  end if;

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

  if old.status = 'planificada'
     and new.status in ('en_camino', 'en_sitio', 'en_proceso')
     and new.installer_accepted_at is null then
    raise exception 'El instalador tiene que aceptar la orden antes de iniciarla';
  end if;

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

  -- Evidencia mínima (FLD-R4.1, AC-14-A). El mensaje dice cuántas hay y
  -- cuántas faltan: "no se puede finalizar" no le dice a nadie qué hacer.
  --
  -- Sólo se aplica al cierre que hace el instalador (`en_proceso →
  -- en_revision`). La aprobación del coordinador no lo revalida: si él decide
  -- aprobar con lo que hay, es su decisión y queda registrada.
  if old.status = 'en_proceso' and new.status = 'en_revision' then
    v_min := public.order_min_photos(new.id);
    v_photos := public.order_photo_count(new.id);
    if v_photos < v_min then
      raise exception 'Faltan fotos para cerrar: hay % y el mínimo es %', v_photos, v_min;
    end if;
  end if;

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
-- Escritura del mínimo de la empresa
-- ---------------------------------------------------------------------------

-- `companies` tiene UNA sola policy, y es de SELECT. Sin policy de UPDATE, el
-- update del gerente afecta cero filas EN SILENCIO: la acción respondería
-- "guardado" sin haber guardado nada.
--
-- La salida fácil sería una policy de UPDATE sobre la tabla; sería un error.
-- `companies` también tiene `status` (activa/suspendida), `order_prefix` y el
-- país: una policy amplia le daría a cualquier gerente la capacidad de
-- levantarse su propia suspensión. Es la misma lección que dejó el punto 21,
-- cuando una policy de SELECT demasiado amplia sobre `projects` habilitaba
-- exportar un proyecto entero.
--
-- Por eso una función acotada que sólo puede escribir esta columna.
create or replace function public.set_company_min_completion_photos(p_value smallint)
returns smallint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_company uuid := public.auth_company();
begin
  if public.auth_role() <> 'company_manager' or v_company is null then
    raise exception 'Acceso denegado';
  end if;
  if p_value is null or p_value < 0 or p_value > 20 then
    raise exception 'El mínimo de fotos tiene que estar entre 0 y 20';
  end if;

  update public.companies set min_completion_photos = p_value where id = v_company;
  return p_value;
end;
$fn$;

revoke all on function public.set_company_min_completion_photos(smallint) from public;
grant execute on function public.set_company_min_completion_photos(smallint) to authenticated;

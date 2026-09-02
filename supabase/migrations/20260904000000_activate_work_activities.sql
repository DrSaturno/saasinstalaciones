-- Fase 0 de relevamiento y ejecución: conectar lo que ya existía.
--
-- `work_activities`, `survey_submissions` y `survey_submission_decisions` están
-- en producción desde el 12-08-2026 con RLS, triggers de validación y el
-- comando `decide_survey_submission`. Con 0 filas y sin una sola referencia
-- desde `app/`, porque faltaban los dos eslabones que las ponen en movimiento:
-- nada creaba actividades y nada enviaba una submission.
--
-- Esta migración agrega esos dos comandos y hace el backfill. **No toca la
-- máquina de estados de órdenes**: es puramente aditiva, así que nada de lo que
-- hoy funciona cambia de comportamiento. Conectar los dos modelos es la Fase 1,
-- y va junto con el cierre del relevamiento independiente porque las dos cosas
-- tocan `validate_order_transition`.

-- ---------------------------------------------------------------------------
-- Crear las actividades de una orden
--
-- **Sin `operation_id`, a diferencia del resto del módulo.** Acá la llave
-- natural es la orden misma: una orden tiene un solo juego de actividades, así
-- que volver a llamar con lo mismo devuelve lo que ya hay y volver a llamar con
-- algo distinto falla. Eso es idempotencia más fuerte que un identificador que
-- quien llama tiene que acordarse de repetir.
-- ---------------------------------------------------------------------------

create or replace function public.create_order_activities(
  p_order_id uuid,
  p_include_survey boolean default false,
  p_include_execution boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.work_orders%rowtype;
  v_survey_id uuid;
  v_execution_id uuid;
  v_existing_types text[];
  v_wanted_types text[];
begin
  if auth.uid() is null then
    raise exception 'ACCESS_DENIED';
  end if;
  if not (p_include_survey or p_include_execution) then
    raise exception 'ACTIVITY_KIND_REQUIRED';
  end if;

  select * into v_order from public.work_orders w where w.id = p_order_id;
  if not found or not public.auth_can_operate_work_order(p_order_id, v_order.company_id) then
    raise exception 'ACCESS_DENIED';
  end if;

  v_wanted_types := array_remove(array[
    case when p_include_survey then 'survey' end,
    case when p_include_execution then 'execution' end
  ], null);

  select array_agg(a.activity_type order by a.activity_type)
  into v_existing_types
  from public.work_activities a
  where a.work_order_id = p_order_id;

  if v_existing_types is not null then
    -- Ya tiene actividades. Si piden lo mismo, se devuelve lo que hay; si
    -- piden otra cosa, falla en vez de agregar en silencio: sumar una
    -- ejecución a una orden que era de sólo relevamiento cambia lo que la
    -- orden ES, y eso no puede pasar por un reintento.
    if v_existing_types <> (select array_agg(t order by t) from unnest(v_wanted_types) t) then
      raise exception 'ACTIVITIES_ALREADY_EXIST';
    end if;
    -- Subconsultas y no `max()`: Postgres no agrega uuid. Como hay a lo sumo
    -- una actividad de cada tipo por orden, un `limit 1` alcanza y es directo.
    select
      (select a.id from public.work_activities a
        where a.work_order_id = p_order_id and a.activity_type = 'survey' limit 1),
      (select a.id from public.work_activities a
        where a.work_order_id = p_order_id and a.activity_type = 'execution' limit 1)
    into v_survey_id, v_execution_id;

    return jsonb_build_object(
      'survey_activity_id', v_survey_id,
      'execution_activity_id', v_execution_id,
      'created', false
    );
  end if;

  -- Las actividades nacen SIN fecha (`schedule_precision = 'unknown'`). Es la
  -- respuesta literal al requisito: la fecha del relevamiento puede quedar
  -- pendiente. Y agendarlas es territorio de ADR-004 — el trigger exige pasar
  -- por `app.assignment_gate` para tocar esos campos, así que ponerlos acá
  -- sería meterse en un frente que esta spec declara fuera de alcance.
  if p_include_survey then
    insert into public.work_activities (
      company_id, work_order_id, activity_type, position, lifecycle,
      schedule_precision, created_by
    ) values (
      v_order.company_id, p_order_id, 'survey', 1, 'draft', 'unknown', auth.uid()
    )
    returning id into v_survey_id;
  end if;

  if p_include_execution then
    insert into public.work_activities (
      company_id, work_order_id, activity_type, position, lifecycle,
      schedule_precision, prerequisite_activity_id, created_by
    ) values (
      v_order.company_id, p_order_id, 'execution',
      case when p_include_survey then 2 else 1 end,
      'draft', 'unknown',
      -- Si hay relevamiento, la ejecución declara que depende de él. A partir
      -- de ahí el trigger no la deja arrancar sin aprobación.
      v_survey_id,
      auth.uid()
    )
    returning id into v_execution_id;
  end if;

  return jsonb_build_object(
    'survey_activity_id', v_survey_id,
    'execution_activity_id', v_execution_id,
    'created', true
  );
end;
$$;

revoke all on function public.create_order_activities(uuid, boolean, boolean) from public;
grant execute on function public.create_order_activities(uuid, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Enviar un relevamiento
--
-- **Idempotente por contenido.** Si el mismo relevamiento se manda dos veces
-- —un reintento offline, un doble toque— el hash coincide y se devuelve la
-- versión que ya existe en vez de crear una nueva. Reservar una versión nueva
-- para cada reintento le haría creer al coordinador que hubo una corrección
-- que nunca ocurrió.
-- ---------------------------------------------------------------------------

create or replace function public.submit_survey_submission(
  p_activity_id uuid,
  p_form_data jsonb default '{}'::jsonb,
  p_measurements jsonb default '{}'::jsonb,
  p_checklist jsonb default '{}'::jsonb,
  p_evidence jsonb default '[]'::jsonb,
  p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity public.work_activities%rowtype;
  v_hash text;
  v_existing uuid;
  v_next_version integer;
  v_submission_id uuid;
begin
  if auth.uid() is null then
    raise exception 'ACCESS_DENIED';
  end if;

  select * into v_activity from public.work_activities a where a.id = p_activity_id;
  if not found then raise exception 'ACTIVITY_NOT_FOUND'; end if;
  if v_activity.activity_type <> 'survey' then
    raise exception 'NOT_A_SURVEY_ACTIVITY';
  end if;

  -- Releva quien está asignado. El coordinador que después revisa no puede ser
  -- el mismo, y de eso ya se ocupa `decide_survey_submission`.
  if not public.auth_is_activity_assignee(p_activity_id) then
    raise exception 'ACCESS_DENIED';
  end if;

  v_hash := md5(
    coalesce(p_form_data::text, '') || '|' ||
    coalesce(p_measurements::text, '') || '|' ||
    coalesce(p_checklist::text, '') || '|' ||
    coalesce(p_evidence::text, '') || '|' ||
    coalesce(btrim(p_notes), '')
  );

  select ss.id into v_existing
  from public.survey_submissions ss
  where ss.activity_id = p_activity_id
    and ss.content_hash = v_hash
    and ss.status = 'submitted';
  if found then
    return v_existing;
  end if;

  select coalesce(max(ss.version), 0) + 1
  into v_next_version
  from public.survey_submissions ss
  where ss.activity_id = p_activity_id;

  insert into public.survey_submissions (
    company_id, activity_id, version, status, author_id,
    form_data, measurements, checklist_responses, evidence, notes,
    content_hash, submitted_at
  ) values (
    v_activity.company_id, p_activity_id, v_next_version, 'submitted', auth.uid(),
    coalesce(p_form_data, '{}'::jsonb),
    coalesce(p_measurements, '{}'::jsonb),
    coalesce(p_checklist, '{}'::jsonb),
    coalesce(p_evidence, '[]'::jsonb),
    btrim(coalesce(p_notes, '')),
    v_hash, now()
  )
  returning id into v_submission_id;

  return v_submission_id;
end;
$$;

revoke all on function public.submit_survey_submission(uuid, jsonb, jsonb, jsonb, jsonb, text) from public;
grant execute on function public.submit_survey_submission(uuid, jsonb, jsonb, jsonb, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill de las órdenes que ya existen
--
-- Una actividad de ejecución por orden, con el lifecycle que corresponde a su
-- estado actual. **No se fabrica ningún relevamiento ni ninguna aprobación**:
-- verificado el 02-09-2026, ninguna de las órdenes vivas tiene un relevamiento
-- del modelo viejo, así que no hay evidencia que preservar.
--
-- Las fechas van a `legacy_scheduled_date` con precisión `unknown`, que es lo
-- que decidió DEC-13: la orden guardaba un día sin hora y no se inventa una.
-- ---------------------------------------------------------------------------

insert into public.work_activities (
  company_id, work_order_id, activity_type, position, lifecycle,
  schedule_precision, legacy_scheduled_date, legacy_scheduled_end_date, created_by
)
select
  w.company_id, w.id, 'execution', 1,
  case w.status
    when 'pendiente'    then 'draft'
    when 'relevamiento' then 'draft'
    when 'planificada'  then 'scheduled'
    when 'en_proceso'   then 'in_progress'
    when 'en_revision'  then 'submitted'
    when 'finalizada'   then 'completed'
    when 'cancelada'    then 'cancelled'
    else 'draft'
  end,
  'unknown',
  w.scheduled_date,
  w.scheduled_end_date,
  null
from public.work_orders w
where not exists (
  select 1 from public.work_activities a where a.work_order_id = w.id
);

-- ---------------------------------------------------------------------------
-- Asignar a alguien a una actividad
--
-- **Esto apareció a mitad de la fase y ensancha la frontera declarada.**
-- `auth_is_activity_assignee` no lee `work_orders.assigned_installer_id`: lee
-- `work_assignments`, una tercera tabla que también estaba en producción con 0
-- filas y sin nada que la creara. Sin una asignación, el instalador no puede
-- ni ver ni enviar un relevamiento en el modelo nuevo, así que sin esto la
-- fase entera no se sostiene.
--
-- Lo que SÍ queda afuera, como dice la spec: la agenda. Esta función asigna y
-- nada más — `schedule_precision = 'unknown'`, sin horarios, sin chequear
-- disponibilidad ni superposiciones. Todo eso es ADR-004 y tiene su propia
-- máquina, incluida la compuerta `app.assignment_gate` que protege esos campos.
--
-- Reasignar no pisa: la asignación anterior queda `replaced` y la nueva la
-- apunta con `replaces_assignment_id`. Quién estuvo a cargo y hasta cuándo es
-- historia, no un campo que se sobrescribe.

create or replace function public.assign_activity(
  p_activity_id uuid,
  p_installer_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity public.work_activities%rowtype;
  v_current public.work_assignments%rowtype;
  v_assignment_id uuid;
begin
  if auth.uid() is null then
    raise exception 'ACCESS_DENIED';
  end if;

  select * into v_activity from public.work_activities a where a.id = p_activity_id;
  if not found or not public.auth_can_operate_work_activity(p_activity_id) then
    raise exception 'ACCESS_DENIED';
  end if;

  -- Sólo gente del equipo activo de esa empresa.
  if not exists (
    select 1 from public.company_installers ci
    where ci.company_id = v_activity.company_id
      and ci.installer_id = p_installer_id
      and ci.status = 'active'
  ) then
    raise exception 'INSTALLER_NOT_IN_ROSTER';
  end if;

  select * into v_current
  from public.work_assignments wa
  where wa.activity_id = p_activity_id
    and wa.status <> 'replaced'
    and wa.status <> 'cancelled'
  order by wa.version desc
  limit 1;

  if found and v_current.installer_id = p_installer_id then
    return v_current.id;
  end if;

  if found then
    update public.work_assignments
    set status = 'replaced', valid_until = now()
    where id = v_current.id;
  end if;

  insert into public.work_assignments (
    company_id, activity_id, installer_id, version, status,
    schedule_precision, replaces_assignment_id, created_by
  ) values (
    v_activity.company_id, p_activity_id, p_installer_id,
    coalesce(v_current.version, 0) + 1, 'active',
    'unknown', v_current.id, auth.uid()
  )
  returning id into v_assignment_id;

  return v_assignment_id;
end;
$$;

revoke all on function public.assign_activity(uuid, uuid) from public;
grant execute on function public.assign_activity(uuid, uuid) to authenticated;

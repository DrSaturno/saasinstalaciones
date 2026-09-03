-- Fase 3 de agenda: el gate. Todas las vías de asignación pasan por acá, o no
-- pasan.
--
-- **Por qué una sola función y un trigger, y no "todas las Server Actions
-- ahora validan esto".** Confiar en que cada pantalla se acuerde de llamar al
-- chequeo es la forma más rápida de que alguna no lo haga. El trigger sobre
-- `work_orders.assigned_installer_id` hace que un `update` directo falle en la
-- base, con el mismo mecanismo que `app.assignment_gate` ya usa para los
-- horarios (Fase 0): sin la compuerta abierta, escribir ese campo es un error,
-- no una omisión silenciosa.
--
-- **El orden de los controles es la traducción de DEC-09/DEC-19 a código:**
-- elegibilidad y estado de la orden primero (no son de agenda, son de si la
-- operación tiene sentido); ausencia y solapamiento después, sin excepción
-- posible; traslado al final, el único que admite un motivo escrito y sigue
-- adelante.
--
-- **El lock es por instalador, no por orden** (AG-R2). Lo que está en disputa
-- cuando dos empresas asignan al mismo tiempo es la agenda de una persona, no
-- una fila de `work_orders` — bloquear la orden no evita nada si son dos
-- órdenes distintas.

-- ---------------------------------------------------------------------------
-- El gate
-- ---------------------------------------------------------------------------

create or replace function public.assign_installer_gate(
  p_order_id uuid,
  p_installer_id uuid,
  p_operation_id uuid,
  p_override_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_receipt public.assignment_command_receipts%rowtype;
  v_order public.work_orders%rowtype;
  v_activity public.work_activities%rowtype;
  v_site record;
  v_current public.work_assignments%rowtype;
  v_range tstzrange;
  v_travel jsonb;
  v_available boolean;
  v_reason text;
  v_override_allowed boolean := false;
  v_assignment_id uuid;
  v_version integer;
  v_correlation_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then
    raise exception 'ACCESS_DENIED';
  end if;

  -- Idempotencia: un reintento con el mismo operation_id devuelve lo que ya
  -- se decidió, sin volver a evaluar nada. `operation_id` es la clave
  -- primaria de la tabla, así que esto es la fuente de verdad, no una
  -- optimización.
  select * into v_receipt
  from public.assignment_command_receipts
  where operation_id = p_operation_id;
  if found then
    return jsonb_build_object(
      'available', v_receipt.available,
      'code', v_receipt.reason_code,
      'override_allowed', v_receipt.override_allowed,
      'assignment_id', v_receipt.assignment_id,
      'operation_id', v_receipt.operation_id
    );
  end if;

  select * into v_order from public.work_orders where id = p_order_id;
  if not found or not public.auth_can_operate_work_order(p_order_id, v_order.company_id) then
    raise exception 'ACCESS_DENIED';
  end if;

  -- La actividad de ejecución representa el trabajo en sí; si la orden es
  -- sólo relevamiento, esa. Mismo criterio que `set_activity_schedule` para
  -- que agenda y asignación hablen de la misma actividad.
  select * into v_activity
  from public.work_activities a
  where a.work_order_id = p_order_id
  order by case when a.activity_type = 'execution' then 0 else 1 end
  limit 1;
  if not found then
    raise exception 'ACTIVITY_NOT_FOUND';
  end if;

  select s.lat, s.lng into v_site
  from public.sites s where s.id = v_order.site_id;

  -- `work_activities` no tiene una columna `schedule_range` generada — esa
  -- vive en `work_assignments`, donde SÍ hay algo que solaparse. Acá se arma
  -- con la misma regla: sólo hay rango con precisión exacta y las dos puntas
  -- cargadas. Sin eso, `v_range` queda en null y los chequeos de abajo lo
  -- tratan como «no verificable», nunca como cero (AG-R10, AC-11-C).
  if v_activity.schedule_precision = 'exact'
     and v_activity.scheduled_start_at is not null
     and v_activity.scheduled_end_at is not null then
    v_range := tstzrange(v_activity.scheduled_start_at, v_activity.scheduled_end_at, '[)');
  else
    v_range := null;
  end if;

  -- Elegibilidad y estado de la orden: no son de agenda, son de si la
  -- operación tiene sentido en absoluto.
  if not exists (
    select 1 from public.company_installers ci
    where ci.company_id = v_order.company_id
      and ci.installer_id = p_installer_id
      and ci.status = 'active'
  ) then
    v_available := false;
    v_reason := 'NOT_ELIGIBLE';
  elsif v_order.status in ('finalizada', 'cancelada') then
    v_available := false;
    v_reason := 'ACTIVITY_CLOSED';
  elsif public.installer_absence_blocks(p_installer_id, v_range) then
    -- Bloqueo duro: una ausencia aprobada, sin excepción (AG-R4).
    v_available := false;
    v_reason := 'OUTSIDE_AVAILABILITY';
  else
    -- A partir de acá el resultado depende de otras filas de `work_assignments`,
    -- así que el lock tiene que estar tomado antes de mirarlas: dos empresas
    -- asignando a la misma persona al mismo tiempo no pueden ganar las dos
    -- (AC-11-A). Se libera solo al terminar la transacción.
    perform pg_advisory_xact_lock(hashtext(p_installer_id::text));

    if public.installer_overlapping_assignments(p_installer_id, v_range, v_activity.id) > 0 then
      -- Bloqueo duro: un solapamiento es un hecho, no una estimación (AG-R4).
      -- La restricción de exclusión de la Fase 2 es el cerrojo por si algo
      -- esquiva este chequeo; esto es el mensaje legible antes de llegar ahí.
      v_available := false;
      v_reason := 'SCHEDULE_CONFLICT';
    else
      v_travel := public.installer_travel_feasibility(
        p_installer_id, v_range, v_site.lat, v_site.lng, v_activity.id
      );
      if v_travel ->> 'verifiable' = 'true'
         and (v_travel ->> 'feasible')::boolean = false then
        -- Bloqueo con override: es una estimación nuestra, no un hecho
        -- (AG-R5). Sin motivo, se informa y se corta acá.
        v_override_allowed := true;
        if p_override_reason is null
           or char_length(trim(p_override_reason)) < 10 then
          v_available := false;
          v_reason := 'TRAVEL_CONFLICT';
        else
          v_available := true;
          v_reason := 'AVAILABLE';
        end if;
      else
        -- No verificable (AG-R10) o verificable y factible: en los dos casos
        -- se deja pasar. No poder medir el traslado no es lo mismo que haber
        -- comprobado que hay uno.
        v_available := true;
        v_reason := 'AVAILABLE';
      end if;
    end if;
  end if;

  if v_available then
    select * into v_current
    from public.work_assignments wa
    where wa.activity_id = v_activity.id
      and wa.status not in ('replaced', 'cancelled')
    order by wa.version desc
    limit 1;

    if found and v_current.installer_id = p_installer_id then
      -- Ya está asignada a esta misma persona: reintento idempotente, no una
      -- reasignación.
      v_assignment_id := v_current.id;
      v_version := v_current.version;
    else
      if found then
        update public.work_assignments
        set status = 'replaced', valid_until = now()
        where id = v_current.id;
      end if;

      v_version := coalesce(v_current.version, 0) + 1;

      insert into public.work_assignments (
        company_id, activity_id, installer_id, version, status,
        schedule_precision, scheduled_start_at, scheduled_end_at, timezone,
        replaces_assignment_id, correlation_id, created_by
      ) values (
        v_order.company_id, v_activity.id, p_installer_id, v_version, 'active',
        v_activity.schedule_precision, v_activity.scheduled_start_at,
        v_activity.scheduled_end_at, v_activity.timezone,
        v_current.id, v_correlation_id, auth.uid()
      )
      returning id into v_assignment_id;

      -- La proyección al escalar legacy que el resto de la app todavía lee.
      -- Mismo patrón que `app.activity_sync`: la compuerta se abre para
      -- exactamente esta escritura y se cierra enseguida.
      perform set_config('app.assignment_gate', 'on', true);
      update public.work_orders
      set assigned_installer_id = p_installer_id
      where id = p_order_id;
      perform set_config('app.assignment_gate', 'off', true);
    end if;

    if v_reason = 'AVAILABLE' and v_override_allowed then
      -- Se usó el override: queda auditado con motivo, y la asignación queda
      -- marcada como forzada a través de esa misma fila — no hace falta una
      -- columna nueva, `assignment_override_audit` ES la marca (AG-GATE-04).
      insert into public.assignment_override_audit (
        company_id, activity_id, assignment_id, installer_id,
        conflict_code, reason, actor_id, correlation_id
      ) values (
        v_order.company_id, v_activity.id, v_assignment_id, p_installer_id,
        'TRAVEL_CONFLICT', trim(p_override_reason), auth.uid(), v_correlation_id
      );
    end if;
  end if;

  insert into public.assignment_command_receipts (
    operation_id, company_id, actor_id, activity_id, request_payload,
    available, reason_code, override_allowed, assignment_id,
    activity_version, correlation_id
  ) values (
    p_operation_id, v_order.company_id, auth.uid(), v_activity.id,
    jsonb_build_object('order_id', p_order_id, 'installer_id', p_installer_id),
    v_available, v_reason, v_override_allowed, v_assignment_id,
    coalesce(v_version, 0), v_correlation_id
  );

  return jsonb_build_object(
    'available', v_available,
    'code', v_reason,
    'override_allowed', v_override_allowed,
    'assignment_id', v_assignment_id,
    'operation_id', p_operation_id
  );
end;
$fn$;

revoke all on function public.assign_installer_gate(
  uuid, uuid, uuid, text) from public;
grant execute on function public.assign_installer_gate(
  uuid, uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- El cerrojo del lado de `work_orders`: escribir el campo sin pasar por acá
-- es un error, no una omisión silenciosa.
-- ---------------------------------------------------------------------------

create or replace function public.validate_installer_assignment_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- Vaciar el campo (desasignar) nunca puede crear un conflicto, así que no
  -- necesita el gate: quitar a alguien de una orden es siempre seguro.
  if new.assigned_installer_id is not null
     and (tg_op = 'INSERT' or new.assigned_installer_id is distinct from old.assigned_installer_id)
     and auth.uid() is not null
     and current_setting('app.assignment_gate', true) is distinct from 'on'
  then
    raise exception 'ASSIGNMENT_MUST_USE_GATE';
  end if;
  return new;
end;
$fn$;

drop trigger if exists work_orders_assignment_gate on public.work_orders;
create trigger work_orders_assignment_gate
  before insert or update of assigned_installer_id on public.work_orders
  for each row execute function public.validate_installer_assignment_gate();

-- ---------------------------------------------------------------------------
-- AG-GATE-04: una baja atribuible a una asignación forzada no penaliza
-- ---------------------------------------------------------------------------

-- Si la empresa asignó igual después de que la plataforma avisara del
-- traslado, la responsabilidad de lo que pase después es de la empresa que
-- decidió, no del instalador. Se fuerza `justified` sin importar lo que haya
-- marcado el gerente: no es una opción de revisión, es una consecuencia de
-- haber usado el override.
create or replace function public.review_order_cancellation(
  p_request_id uuid,
  p_decision text,
  p_justified boolean,
  p_note text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_req public.order_cancellation_requests%rowtype;
  v_order public.work_orders%rowtype;
  v_activity_id uuid;
  v_assignment_id uuid;
  v_justified boolean;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decisión inválida';
  end if;

  select * into v_req from public.order_cancellation_requests c
  where c.id = p_request_id for update;
  if not found then raise exception 'Pedido no encontrado'; end if;

  if not (
    public.auth_role() = 'company_manager'
    and v_req.company_id = public.auth_company()
  ) then
    raise exception 'Sólo la empresa puede resolver un pedido de baja';
  end if;

  if v_req.status <> 'pending' then
    raise exception 'Este pedido ya fue resuelto';
  end if;

  v_justified := p_justified;

  select a.id into v_activity_id
  from public.work_activities a
  where a.work_order_id = v_req.order_id
  order by case when a.activity_type = 'execution' then 0 else 1 end
  limit 1;

  if v_activity_id is not null then
    select wa.id into v_assignment_id
    from public.work_assignments wa
    where wa.activity_id = v_activity_id
      and wa.installer_id = v_req.installer_id
      and wa.status not in ('replaced', 'cancelled')
    order by wa.version desc
    limit 1;

    if v_assignment_id is not null and exists (
      select 1 from public.assignment_override_audit oa
      where oa.assignment_id = v_assignment_id
    ) then
      v_justified := true;
    end if;
  end if;

  update public.order_cancellation_requests
  set status = p_decision,
      justified = v_justified,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = left(btrim(coalesce(p_note, '')), 500)
  where id = p_request_id;

  if p_decision = 'approved' then
    select * into v_order from public.work_orders w
    where w.id = v_req.order_id for update;

    update public.work_orders
    set assigned_installer_id = null, installer_accepted_at = null
    where id = v_req.order_id;
  end if;

  insert into public.notifications (user_id, type, title, body, data)
  select
    p.id,
    'cancellation_reviewed',
    case
      when p.locale = 'pt' and p_decision = 'approved' then 'Sua saída foi aprovada'
      when p.locale = 'pt' then 'Sua saída não foi aprovada'
      when p_decision = 'approved' then 'Tu baja fue aprobada'
      else 'Tu baja no fue aprobada'
    end,
    coalesce(
      nullif(left(btrim(coalesce(p_note, '')), 180), ''),
      case
        when p.locale = 'pt' and p_decision = 'approved'
          then 'Você não está mais nesta ordem.'
        when p.locale = 'pt' then 'Você continua nesta ordem.'
        when p_decision = 'approved' then 'Ya no estás en esta orden.'
        else 'Seguís en esta orden.'
      end
    ),
    jsonb_build_object(
      'url', '/tasks/' || v_req.order_id,
      'order_id', v_req.order_id,
      'request_id', p_request_id,
      'company_id', v_req.company_id,
      'decision', p_decision,
      'justified', v_justified,
      'locale', p.locale
    )
  from public.profiles p
  where p.id = v_req.installer_id;
end;
$fn$;

revoke all on function public.review_order_cancellation(uuid, text, boolean, text) from public;
grant execute on function public.review_order_cancellation(uuid, text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Migrar la bolsa de trabajo al gate
-- ---------------------------------------------------------------------------

-- La membresía tiene que existir ANTES de llamar al gate: la elegibilidad se
-- valida contra `company_installers.status = 'active'`, y antes esta función
-- creaba la membresía DESPUÉS de asignar las órdenes. Reordenado.
create or replace function public.accept_broadcast_application(
  p_broadcast_id uuid,
  p_installer_id uuid,
  p_order_ids uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_broadcast public.broadcasts%rowtype;
  v_application_status text;
  v_accepted integer;
  v_requested integer := coalesce(cardinality(p_order_ids), 0);
  v_available_count integer;
  v_installer_locale text := 'es';
  v_order_id uuid;
  v_result jsonb;
begin
  select *
  into v_broadcast
  from public.broadcasts b
  where b.id = p_broadcast_id
    and (
      (public.auth_role() = 'company_manager' and b.company_id = public.auth_company())
      or (
        b.project_id is not null
        and public.auth_has_company_role(b.company_id, 'coordinator')
        and public.can_operate_project(b.project_id)
      )
    )
  for update;

  if not found then raise exception 'Búsqueda no encontrada'; end if;
  if v_broadcast.status <> 'open' then raise exception 'La búsqueda está cerrada'; end if;

  select ba.status
  into v_application_status
  from public.broadcast_applications ba
  where ba.broadcast_id = p_broadcast_id
    and ba.installer_id = p_installer_id
  for update;

  if not found then raise exception 'Postulación no encontrada'; end if;
  if v_application_status = 'accepted' then return; end if;
  if v_application_status <> 'applied' then
    raise exception 'La postulación ya fue resuelta';
  end if;

  select count(*) into v_accepted
  from public.broadcast_applications ba
  where ba.broadcast_id = p_broadcast_id
    and ba.status = 'accepted';
  if v_accepted >= v_broadcast.slots then raise exception 'No quedan cupos'; end if;

  if v_requested > 0 then
    if v_broadcast.project_id is null then
      raise exception 'La búsqueda no está asociada a un proyecto';
    end if;

    select count(*) into v_available_count
    from public.work_orders w
    where w.id = any(p_order_ids)
      and w.company_id = v_broadcast.company_id
      and w.project_id = v_broadcast.project_id
      and w.assigned_installer_id is null
      and w.status not in ('finalizada', 'cancelada');
    if v_available_count <> v_requested then
      raise exception 'Una o más órdenes no están disponibles';
    end if;
  end if;

  insert into public.installers (id)
  values (p_installer_id)
  on conflict (id) do nothing;

  insert into public.company_installers (
    company_id, installer_id, role, status, joined_at
  )
  values (v_broadcast.company_id, p_installer_id, 'installer', 'active', now())
  on conflict (company_id, installer_id)
  do update set
    status = 'active',
    joined_at = coalesce(company_installers.joined_at, now());

  insert into public.company_membership_roles (
    company_id, user_id, role, granted_by
  )
  values (v_broadcast.company_id, p_installer_id, 'installer', auth.uid())
  on conflict (company_id, user_id, role) do nothing;

  insert into public.chat_threads (company_id, installer_id)
  values (v_broadcast.company_id, p_installer_id)
  on conflict (company_id, installer_id) do nothing;

  -- Recién ahora por el gate: los mismos controles que cualquier otra vía
  -- (AG-R3). Si alguna orden se rechaza, se interrumpe — la transacción entera
  -- se revierte, incluida la membresía recién creada — y queda la postulación
  -- pendiente en vez de comprometer al instalador con un choque evitable.
  if v_requested > 0 then
    foreach v_order_id in array p_order_ids loop
      v_result := public.assign_installer_gate(
        v_order_id, p_installer_id, gen_random_uuid()
      );
      if not (v_result ->> 'available')::boolean then
        raise exception 'No se pudo asignar la orden %: %',
          v_order_id, (v_result ->> 'code');
      end if;

      update public.work_orders set source = 'broadcast' where id = v_order_id;
    end loop;
  end if;

  update public.broadcast_applications
  set status = 'accepted'
  where broadcast_id = p_broadcast_id
    and installer_id = p_installer_id;

  select p.locale into v_installer_locale
  from public.profiles p
  where p.id = p_installer_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    p_installer_id,
    'application_accepted',
    case when v_installer_locale = 'pt' then 'Candidatura aceita'
         else 'Postulación aceptada' end,
    case when v_installer_locale = 'pt'
         then 'Você entrou para a equipe de ' || v_broadcast.title
         else 'Te sumaron al equipo para ' || v_broadcast.title end,
    jsonb_build_object(
      'url', '/jobs',
      'broadcast_id', p_broadcast_id,
      'installer_id', p_installer_id,
      'company_id', v_broadcast.company_id,
      'locale', v_installer_locale
    )
  );

  if v_accepted + 1 >= v_broadcast.slots then
    insert into public.notifications (user_id, type, title, body, data)
    select
      ba.installer_id,
      'application_rejected',
      case when p.locale = 'pt' then 'Candidatura não selecionada'
           else 'Postulación no seleccionada' end,
      case when p.locale = 'pt'
           then 'As vagas de ' || v_broadcast.title || ' foram preenchidas'
           else 'Se completaron los cupos para ' || v_broadcast.title end,
      jsonb_build_object(
        'url', '/jobs',
        'broadcast_id', p_broadcast_id,
        'company_id', v_broadcast.company_id,
        'locale', p.locale
      )
    from public.broadcast_applications ba
    join public.profiles p on p.id = ba.installer_id
    where ba.broadcast_id = p_broadcast_id
      and ba.status = 'applied';

    update public.broadcasts
    set status = 'closed'
    where id = p_broadcast_id;

    update public.broadcast_applications
    set status = 'rejected'
    where broadcast_id = p_broadcast_id
      and status = 'applied';
  end if;
end;
$fn$;

revoke all on function public.accept_broadcast_application(uuid, uuid, uuid[])
  from public;
grant execute on function public.accept_broadcast_application(uuid, uuid, uuid[])
  to authenticated;

-- ---------------------------------------------------------------------------
-- El mismo gate también corre al reprogramar
-- ---------------------------------------------------------------------------

-- `set_activity_schedule` (Fase 0) sólo escribía el horario nuevo; nunca
-- volvía a mirar ausencia, solapamiento o traslado, y nunca actualizaba la
-- foto que `work_assignments` guarda del horario en el momento de asignar.
-- Eso dejaba una puerta abierta de verdad: asignar a alguien ANTES de cargar
-- el horario (cuando todavía no hay nada que chequear) y recién después
-- reprogramar, esquivaba `assign_installer_gate` por completo — la foto vieja
-- nunca se actualizaba, así que ningún chequeo sobre otra orden la veía. El
-- comentario original de la Fase 0 ya marcaba este lugar como el que faltaba.
--
-- Se dropea la firma vieja de 6 parámetros antes de crear la de 7: dejar las
-- dos overloaded confunde a PostgREST sobre cuál usar cuando el llamador no
-- manda `p_override_reason`.
drop function if exists public.set_activity_schedule(
  uuid, date, time, time, integer, text);

create or replace function public.set_activity_schedule(
  p_activity_id uuid,
  p_date date default null,
  p_start_time time default null,
  p_end_time time default null,
  p_duration_minutes integer default null,
  p_timezone text default null,
  p_override_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_activity public.work_activities%rowtype;
  v_order public.work_orders%rowtype;
  v_site record;
  v_current public.work_assignments%rowtype;
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_end_time time;
  v_precision text;
  v_legacy_date date;
  v_range tstzrange;
  v_travel jsonb;
  v_available boolean := true;
  v_reason text := 'AVAILABLE';
  v_override_allowed boolean := false;
begin
  select * into v_activity
  from public.work_activities where id = p_activity_id;
  if not found then
    raise exception 'ACTIVITY_NOT_FOUND';
  end if;

  if not public.auth_can_operate_work_activity(p_activity_id) then
    raise exception 'NOT_ALLOWED_TO_SCHEDULE';
  end if;

  v_tz := coalesce(p_timezone, v_activity.timezone);
  if not exists (
    select 1 from pg_catalog.pg_timezone_names tz where tz.name = v_tz
  ) then
    raise exception 'INVALID_TIMEZONE';
  end if;

  if p_duration_minutes is not null and p_duration_minutes <= 0 then
    raise exception 'INVALID_DURATION';
  end if;

  v_end_time := p_end_time;
  if v_end_time is null
     and p_start_time is not null
     and p_duration_minutes is not null then
    v_end_time := (p_start_time + make_interval(mins => p_duration_minutes))::time;
  end if;

  if p_date is null then
    v_precision := 'unknown';
  elsif p_start_time is null or v_end_time is null then
    v_precision := 'day';
  else
    v_precision := 'exact';
  end if;

  if v_precision = 'exact' then
    v_start := (p_date + p_start_time) at time zone v_tz;
    v_end := (p_date + v_end_time) at time zone v_tz;
    -- Un trabajo nocturno que empieza 22:00 y termina 01:00 cierra al día
    -- siguiente. Es un caso real del negocio —`nocturno` es una de las
    -- condiciones de dificultad—, no una entrada al revés.
    if v_end <= v_start then
      v_end := ((p_date + 1) + v_end_time) at time zone v_tz;
    end if;
    v_legacy_date := p_date;
    v_range := tstzrange(v_start, v_end, '[)');
  elsif v_precision = 'day' then
    v_start := null;
    v_end := null;
    v_legacy_date := p_date;
    v_range := null;
  else
    v_start := null;
    v_end := null;
    v_legacy_date := null;
    v_range := null;
  end if;

  -- Si hay una asignación activa, el horario nuevo pasa por el mismo gate que
  -- una asignación nueva (AG-R2/AG-R4/AG-R5) — no por elegibilidad ni estado
  -- de la orden, que reprogramar no cambia, sino por lo que sí puede volverse
  -- falso con un horario distinto: ausencia, solapamiento y traslado.
  select * into v_current
  from public.work_assignments wa
  where wa.activity_id = p_activity_id
    and wa.status not in ('replaced', 'cancelled')
  order by wa.version desc
  limit 1;

  if found then
    select * into v_order from public.work_orders where id = v_activity.work_order_id;
    select s.lat, s.lng into v_site from public.sites s where s.id = v_order.site_id;

    -- Mismo cerrojo por instalador que `assign_installer_gate` (AC-11-A):
    -- lo que está en disputa es la agenda de esa persona.
    perform pg_advisory_xact_lock(hashtext(v_current.installer_id::text));

    if public.installer_absence_blocks(v_current.installer_id, v_range) then
      v_available := false;
      v_reason := 'OUTSIDE_AVAILABILITY';
    elsif public.installer_overlapping_assignments(
      v_current.installer_id, v_range, p_activity_id
    ) > 0 then
      v_available := false;
      v_reason := 'SCHEDULE_CONFLICT';
    else
      v_travel := public.installer_travel_feasibility(
        v_current.installer_id, v_range, v_site.lat, v_site.lng, p_activity_id
      );
      if v_travel ->> 'verifiable' = 'true'
         and (v_travel ->> 'feasible')::boolean = false then
        v_override_allowed := true;
        if p_override_reason is null
           or char_length(trim(p_override_reason)) < 10 then
          v_available := false;
          v_reason := 'TRAVEL_CONFLICT';
        end if;
      end if;
    end if;
  end if;

  if not v_available then
    -- No se escribe nada: reprogramar a un horario que choca se rechaza
    -- igual que asignar a un horario que choca, y sin `override_reason` la
    -- orden se queda con el horario que tenía.
    return jsonb_build_object(
      'activity_id', p_activity_id,
      'available', false,
      'code', v_reason,
      'override_allowed', v_override_allowed
    );
  end if;

  -- La compuerta se abre para exactamente una escritura y se cierra enseguida,
  -- mismo patrón que `app.activity_sync` en la proyección de actividades.
  perform set_config('app.assignment_gate', 'on', true);

  update public.work_activities
     set scheduled_start_at = v_start,
         scheduled_end_at = v_end,
         schedule_precision = v_precision,
         timezone = v_tz,
         legacy_scheduled_date = v_legacy_date,
         estimated_duration_minutes =
           coalesce(p_duration_minutes, estimated_duration_minutes),
         lifecycle = case
           -- Agendar una actividad en borrador la pone en agenda; más allá de
           -- eso el lifecycle no se toca, que es territorio de otros comandos.
           when lifecycle = 'draft' and v_precision <> 'unknown' then 'scheduled'
           else lifecycle
         end
   where id = p_activity_id;

  if v_current.id is not null then
    -- La foto que el gate compara contra otras órdenes: sin esto, un
    -- reschedule posterior a la asignación dejaba esta fila desactualizada
    -- para siempre, y ningún chequeo sobre otra orden la veía.
    update public.work_assignments
       set schedule_precision = v_precision,
           scheduled_start_at = v_start,
           scheduled_end_at = v_end,
           timezone = v_tz
     where id = v_current.id;

    if v_reason = 'AVAILABLE' and v_override_allowed then
      -- Se usó el override de traslado: misma marca que en
      -- `assign_installer_gate`, para que AG-GATE-04 alcance también a una
      -- baja motivada por un traslado que la empresa forzó al reprogramar.
      insert into public.assignment_override_audit (
        company_id, activity_id, assignment_id, installer_id,
        conflict_code, reason, actor_id, correlation_id
      ) values (
        v_order.company_id, p_activity_id, v_current.id, v_current.installer_id,
        'TRAVEL_CONFLICT', trim(p_override_reason), auth.uid(), gen_random_uuid()
      );
    end if;
  end if;

  perform set_config('app.assignment_gate', 'off', true);

  return jsonb_build_object(
    'activity_id', p_activity_id,
    'available', true,
    'code', 'AVAILABLE',
    'override_allowed', v_override_allowed,
    'schedule_precision', v_precision,
    'scheduled_start_at', v_start,
    'scheduled_end_at', v_end,
    'timezone', v_tz
  );
end;
$fn$;

revoke all on function public.set_activity_schedule(
  uuid, date, time, time, integer, text, text) from public;
grant execute on function public.set_activity_schedule(
  uuid, date, time, time, integer, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Una vía más al gate: formalizar el proyecto desde la bolsa de trabajo
-- ---------------------------------------------------------------------------

-- `formalize_project_from_broadcast` (02-09-2026, anterior a este gate)
-- asignaba `assigned_installer_id` directo en el insert de la orden nueva —
-- exactamente la vía suelta que este archivo cierra en todos los demás
-- lugares. Se corrige acá, no editando esa migración vieja: el archivo
-- histórico tiene que seguir describiendo lo que production corrió en su
-- momento.
create or replace function public.formalize_project_from_broadcast(
  p_broadcast_id uuid,
  p_installer_id uuid,
  p_coordinator_id uuid,
  p_project_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_broadcast public.broadcasts%rowtype;
  v_company public.companies%rowtype;
  v_quoted numeric(14, 2);
  v_application_status text;
  v_project_id uuid;
  v_site_id uuid;
  v_order_id uuid;
  v_name text := btrim(coalesce(p_project_name, ''));
begin
  if public.auth_role() is distinct from 'company_manager' then
    raise exception 'Sólo la empresa puede formalizar el proyecto';
  end if;
  if v_name = '' then
    raise exception 'El proyecto necesita un nombre';
  end if;

  select * into v_broadcast
  from public.broadcasts b
  where b.id = p_broadcast_id
    and b.company_id = public.auth_company()
  for update;
  if not found then raise exception 'Búsqueda no encontrada'; end if;

  if v_broadcast.project_id is not null then
    raise exception 'Esta búsqueda ya tiene un proyecto';
  end if;
  if v_broadcast.client_id is null then
    raise exception 'La búsqueda no tiene cliente asociado';
  end if;

  select ba.status, ba.quoted_amount
  into v_application_status, v_quoted
  from public.broadcast_applications ba
  where ba.broadcast_id = p_broadcast_id
    and ba.installer_id = p_installer_id
  for update;
  if not found then raise exception 'Postulación no encontrada'; end if;
  if v_application_status <> 'accepted' then
    raise exception 'La cotización todavía no fue aceptada';
  end if;

  if p_coordinator_id is null then
    raise exception 'Asigná un coordinador antes de crear el proyecto';
  end if;
  if not exists (
    select 1
    from public.company_installers ci
    join public.company_membership_roles cmr
      on cmr.company_id = ci.company_id
     and cmr.user_id = ci.installer_id
     and cmr.role = 'coordinator'
    where ci.company_id = v_broadcast.company_id
      and ci.installer_id = p_coordinator_id
      and ci.status = 'active'
  ) then
    raise exception 'Asigná un coordinador antes de crear el proyecto';
  end if;

  select * into v_company
  from public.companies c
  where c.id = v_broadcast.company_id;

  insert into public.projects (
    company_id, name, client_name, client_id, coordinator_id, description,
    status, starts_at, ends_at, country, zones, planned_installations,
    billing_mode, contract_amount, currency
  )
  select
    v_broadcast.company_id,
    v_name,
    cl.name,
    v_broadcast.client_id,
    p_coordinator_id,
    btrim(concat_ws(
      E'\n\n', nullif(v_broadcast.description, ''), nullif(v_broadcast.requirements, '')
    )),
    'active',
    v_broadcast.scheduled_date,
    v_broadcast.scheduled_end_date,
    v_company.country,
    array[v_broadcast.zone],
    1,
    'per_installation',
    null,
    v_broadcast.currency
  from public.clients cl
  where cl.id = v_broadcast.client_id
    and cl.company_id = v_broadcast.company_id
  returning id into v_project_id;

  if v_project_id is null then raise exception 'Cliente no encontrado'; end if;

  insert into public.sites (
    project_id, company_id, name, zone, lat, lng, is_placeholder
  )
  values (
    v_project_id, v_broadcast.company_id, v_name, v_broadcast.zone,
    v_broadcast.lat, v_broadcast.lng, true
  )
  returning id into v_site_id;

  -- `order_number` lo pone el trigger; `installer_amount` es lo acordado con
  -- esta persona: lo que cotizó, y si no cotizó, lo que la empresa publicó.
  -- Sin instalador todavía: `assign_installer_gate` es la única puerta para
  -- ese campo (AG-R3) — asignar directo acá, aunque la cotización ya esté
  -- aceptada, sería la misma vía suelta que el resto de la Fase 3 cerró.
  insert into public.work_orders (
    site_id, project_id, company_id, title, description, status,
    scheduled_date, scheduled_end_date, source,
    currency, installer_amount
  )
  values (
    v_site_id, v_project_id, v_broadcast.company_id, v_broadcast.title,
    v_broadcast.logistics_notes, 'pendiente',
    v_broadcast.scheduled_date, v_broadcast.scheduled_end_date, 'broadcast',
    v_broadcast.currency, coalesce(v_quoted, v_broadcast.pay_amount)
  )
  returning id into v_order_id;

  perform public.create_order_activities(v_order_id, false, true);
  if v_broadcast.scheduled_date is not null then
    perform public.set_activity_schedule(
      (select id from public.work_activities where work_order_id = v_order_id),
      v_broadcast.scheduled_date
    );
  end if;

  -- No corta la formalización si el gate bloquea (agenda cambió entre la
  -- cotización y hoy): el proyecto y la orden quedan creados igual, sin
  -- asignar, mismo criterio que el resto del alta de órdenes.
  perform public.assign_installer_gate(
    v_order_id, p_installer_id, gen_random_uuid()
  );

  -- Cierra la trazabilidad: desde el proyecto se puede volver a la
  -- convocatoria que lo originó.
  update public.broadcasts
  set project_id = v_project_id
  where id = p_broadcast_id;

  return v_project_id;
end;
$fn$;

revoke all on function public.formalize_project_from_broadcast(uuid, uuid, uuid, text) from public;
grant execute on function public.formalize_project_from_broadcast(uuid, uuid, uuid, text) to authenticated;

-- Fase 0 de agenda: capturar horarios, que es lo que falta para que un
-- conflicto sea siquiera detectable.
--
-- **Por qué una función y no un update.** El trigger `validate_work_activity`
-- ya exige pasar por `app.assignment_gate` para mover un horario, y esa
-- compuerta existe porque ahí es donde en la Fase 3 van a vivir los controles
-- de solapamiento, ausencia y traslado. Si esta fase abriera la compuerta desde
-- una Server Action, cada pantalla que agenda sería un llamador suelto que la
-- Fase 3 tendría que salir a cazar — y bastaría olvidarse de uno para que todo
-- el control quede decorativo (AG-R3).
--
-- Así que la puerta se construye ahora, con una sola llave. Hoy no chequea
-- nada porque todavía no hay con qué; los controles se agregan ADENTRO de esta
-- función y ninguna pantalla se entera.
--
-- **Los instantes se arman acá y no en TypeScript.** Combinar fecha, hora y
-- huso da un momento en el tiempo, y `timestamp at time zone` conoce los husos
-- de verdad. Hacerlo en el cliente sería reimplementar un calendario para
-- volver a equivocarse con el mismo tipo de bug que ya costó una corrida de CI.

create or replace function public.set_activity_schedule(
  p_activity_id uuid,
  -- Todos con default: una agenda puede estar ausente por completo, y omitir
  -- un parámetro tiene que significar lo mismo que mandarlo en null. Además
  -- hace que el generador de tipos los emita opcionales, que es lo que son.
  p_date date default null,
  p_start_time time default null,
  p_end_time time default null,
  p_duration_minutes integer default null,
  p_timezone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_activity public.work_activities%rowtype;
  v_tz text;
  v_start timestamptz;
  v_end timestamptz;
  v_end_time time;
  v_precision text;
  v_legacy_date date;
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

  -- El fin puede venir dado o derivarse de la duración estimada. Si no hay
  -- ninguno de los dos, la agenda llega hasta el día: no se inventa una franja
  -- para poder bloquear con ella (AC-11-C).
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
  elsif v_precision = 'day' then
    v_start := null;
    v_end := null;
    v_legacy_date := p_date;
  else
    v_start := null;
    v_end := null;
    v_legacy_date := null;
  end if;

  -- ---------------------------------------------------------------------
  -- AQUÍ van los controles de la Fase 3, antes de escribir y dentro de esta
  -- misma transacción: lock por instalador, ausencias, solapamiento y
  -- viabilidad del traslado. Está escrito así a propósito para que agregarlos
  -- no obligue a tocar ninguna pantalla.
  -- ---------------------------------------------------------------------

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

  perform set_config('app.assignment_gate', 'off', true);

  return jsonb_build_object(
    'activity_id', p_activity_id,
    'schedule_precision', v_precision,
    'scheduled_start_at', v_start,
    'scheduled_end_at', v_end,
    'timezone', v_tz
  );
end;
$fn$;

revoke all on function public.set_activity_schedule(
  uuid, date, time, time, integer, text) from public;
grant execute on function public.set_activity_schedule(
  uuid, date, time, time, integer, text) to authenticated;

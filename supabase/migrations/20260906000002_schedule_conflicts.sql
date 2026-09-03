-- Fase 2 de agenda: detectar el conflicto.
--
-- Tres piezas, y una de ellas es un cerrojo que faltaba.
--
-- **El cerrojo.** El backlog daba por hecho que `work_assignments` tenía
-- exclusión por GiST. No la tenía: había un *índice*, que acelera buscar
-- solapamientos pero no impide ninguno. Verificado en producción contra
-- `pg_constraint`. Así que hoy la base aceptaría dos asignaciones superpuestas
-- de la misma persona sin protestar.
--
-- La restricción va justamente sobre lo que **no admite excepción**: un
-- solapamiento es un hecho, y `DEC-09`/`REQ-11.7` lo tratan como bloqueo duro.
-- El traslado insuficiente, que sí admite override porque es una estimación
-- nuestra, se calcula y no se restringe. Que el cerrojo cubra exactamente lo
-- inapelable no es casualidad: es la traducción de la regla a la base.
--
-- **La estimación de traslado (DEC-18).** Distancia entre coordenadas por una
-- velocidad promedio, con un factor de rodeo y un margen. Todo parametrizado en
-- una tabla, no en el código: calibrar no puede exigir un despliegue.
--
-- **Y lo que no se puede saber.** 13 de las 30 locaciones de producción no
-- tienen coordenadas. Sin ellas no se devuelve una estimación mala: se devuelve
-- `null`, que el llamador tiene que tratar como «no verificable» y no como
-- «no hay problema» (AG-R10).

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- El cerrojo: una persona no puede estar en dos lugares a la vez
-- ---------------------------------------------------------------------------

-- Sólo aplica a las asignaciones vigentes y con horario exacto. Una agenda de
-- precisión `day` no genera `schedule_range`, así que no participa — y eso es
-- deliberado: sin horas no se puede afirmar un choque (AC-11-C).
alter table public.work_assignments
  drop constraint if exists work_assignments_no_overlap;

alter table public.work_assignments
  add constraint work_assignments_no_overlap
  exclude using gist (
    installer_id with =,
    schedule_range with &&
  )
  where (
    schedule_range is not null
    and status in ('offered', 'active', 'accepted')
  );

-- ---------------------------------------------------------------------------
-- Los parámetros del traslado, versionados
-- ---------------------------------------------------------------------------

create table if not exists public.schedule_rule_versions (
  version text primary key,
  params jsonb not null,
  active boolean not null default false,
  note text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists schedule_rule_versions_active_key
  on public.schedule_rule_versions ((true)) where active;

alter table public.schedule_rule_versions enable row level security;

-- Se lee, no se escribe: cuando la plataforma bloquea una asignación por
-- traslado, la empresa tiene derecho a saber con qué números lo calculó.
drop policy if exists schedule_rules_read on public.schedule_rule_versions;
create policy schedule_rules_read on public.schedule_rule_versions
  for select to authenticated using (true);

grant select on public.schedule_rule_versions to authenticated;

insert into public.schedule_rule_versions (version, params, active, note)
values (
  'v1',
  jsonb_build_object(
    -- Velocidad promedio efectiva, no la de manejar en ruta despejada: incluye
    -- semáforos, estacionar y bajar la herramienta.
    'avg_speed_kmh', 28,
    -- La línea recta nunca es el camino. Este factor absorbe el rodeo, y por
    -- eso la velocidad de arriba puede parecer baja: las dos cosas juntas son
    -- lo que hace conservadora a la estimación.
    'detour_factor', 1.35,
    -- Margen mínimo entre dos trabajos aunque estén en la misma cuadra.
    'min_margin_minutes', 20,
    -- Más allá de esto ya no es «apretado», es otro día de trabajo.
    'max_reasonable_travel_minutes', 240
  ),
  true,
  'Punto de partida sin calibrar contra recorridos reales. Errar hacia el conflicto es lo correcto: un falso conflicto cuesta un override con motivo, y uno no detectado cuesta una cancelacion.'
)
on conflict (version) do nothing;

-- ---------------------------------------------------------------------------
-- La estimación
-- ---------------------------------------------------------------------------

-- Distancia en kilómetros entre dos puntos. `null` si a alguno le falta una
-- coordenada: no hay estimación degradada, hay ausencia de estimación.
create or replace function public.haversine_km(
  p_lat_a numeric, p_lng_a numeric,
  p_lat_b numeric, p_lng_b numeric
)
returns numeric
language sql
immutable
as $fn$
  select case
    when p_lat_a is null or p_lng_a is null
      or p_lat_b is null or p_lng_b is null then null
    else round((
      2 * 6371 * asin(sqrt(
        power(sin(radians(p_lat_b::double precision - p_lat_a::double precision) / 2), 2)
        + cos(radians(p_lat_a::double precision))
          * cos(radians(p_lat_b::double precision))
          * power(sin(radians(p_lng_b::double precision - p_lng_a::double precision) / 2), 2)
      ))
    )::numeric, 3)
  end;
$fn$;

/**
 * Minutos que razonablemente lleva ir de un punto al otro, margen incluido.
 *
 * `null` cuando falta alguna coordenada. Quien llame tiene que distinguir eso
 * de un cero: no saber cuánto se tarda no es tardar nada.
 */
create or replace function public.estimated_travel_minutes(
  p_lat_a numeric, p_lng_a numeric,
  p_lat_b numeric, p_lng_b numeric
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  p jsonb;
  v_km numeric;
begin
  v_km := public.haversine_km(p_lat_a, p_lng_a, p_lat_b, p_lng_b);
  if v_km is null then
    return null;
  end if;

  select params into p from public.schedule_rule_versions where active limit 1;
  if p is null then
    raise exception 'No hay una version de reglas de agenda activa';
  end if;

  return ceil(
    (v_km * (p ->> 'detour_factor')::numeric)
      / (p ->> 'avg_speed_kmh')::numeric * 60
    + (p ->> 'min_margin_minutes')::numeric
  )::integer;
end;
$fn$;

revoke all on function public.estimated_travel_minutes(
  numeric, numeric, numeric, numeric) from public;

-- ---------------------------------------------------------------------------
-- Qué le choca a una persona en un rango dado
-- ---------------------------------------------------------------------------

-- **Cruza empresas a propósito y por eso es interna.** Es la única forma de
-- saber que alguien ya está comprometido sin contarle a una empresa con quién.
-- Lo que sale de acá no se le entrega a nadie: el gate de la Fase 3 lo traduce
-- a un veredicto y un código opaco (REQ-11.4).
create or replace function public.installer_overlapping_assignments(
  p_installer_id uuid,
  p_range tstzrange,
  p_exclude_activity_id uuid default null
)
returns integer
language sql
stable
security definer
set search_path = public
as $fn$
  select count(*)::integer
    from public.work_assignments a
   where a.installer_id = p_installer_id
     and a.status in ('offered', 'active', 'accepted')
     and a.schedule_range is not null
     and p_range is not null
     and a.schedule_range && p_range
     and (p_exclude_activity_id is null or a.activity_id <> p_exclude_activity_id);
$fn$;

revoke all on function public.installer_overlapping_assignments(
  uuid, tstzrange, uuid) from public;

-- Ausencias que tapan el rango: las propias de la persona valen en todas las
-- empresas; las de una empresa, sólo las aprobadas y sólo ahí. Las dos listas
-- se consultan juntas porque para la agenda son lo mismo — no está.
create or replace function public.installer_absence_blocks(
  p_installer_id uuid,
  p_range tstzrange
)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
      from public.installer_global_unavailability u
     where u.installer_id = p_installer_id
       and u.status = 'active'
       and p_range is not null
       and tstzrange(u.starts_at, u.ends_at, '[)') && p_range
  ) or exists (
    select 1
      from public.installer_unavailability u
     where u.installer_id = p_installer_id
       and u.status = 'approved'
       and p_range is not null
       and tstzrange(u.starts_at, u.ends_at, '[)') && p_range
  );
$fn$;

revoke all on function public.installer_absence_blocks(uuid, tstzrange) from public;

-- El trabajo inmediatamente anterior y el siguiente, con su ubicación, para
-- poder preguntarse si el traslado entra. Devuelve los minutos disponibles y
-- los estimados; el gate decide qué hacer con eso.
create or replace function public.installer_travel_feasibility(
  p_installer_id uuid,
  p_range tstzrange,
  p_lat numeric,
  p_lng numeric,
  p_exclude_activity_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_prev record;
  v_next record;
  v_needed integer;
  v_available integer;
  v_worst jsonb := null;
  -- Un vecino que existe pero no se puede medir. Es el caso que más fácil se
  -- cuela como «todo bien»: hay con qué chocar y no hay con qué comprobarlo.
  v_unmeasured boolean := false;
begin
  if p_range is null then
    return jsonb_build_object('verifiable', false, 'reason', 'NO_RANGE');
  end if;

  -- El anterior que termina antes de que este empiece.
  select a.scheduled_end_at, s.lat, s.lng
    into v_prev
    from public.work_assignments a
    join public.work_activities act on act.id = a.activity_id
    join public.work_orders w on w.id = act.work_order_id
    join public.sites s on s.id = w.site_id
   where a.installer_id = p_installer_id
     and a.status in ('offered', 'active', 'accepted')
     and a.scheduled_end_at is not null
     and a.scheduled_end_at <= lower(p_range)
     and (p_exclude_activity_id is null or a.activity_id <> p_exclude_activity_id)
   order by a.scheduled_end_at desc
   limit 1;

  -- El siguiente que empieza después de que este termina.
  select a.scheduled_start_at, s.lat, s.lng
    into v_next
    from public.work_assignments a
    join public.work_activities act on act.id = a.activity_id
    join public.work_orders w on w.id = act.work_order_id
    join public.sites s on s.id = w.site_id
   where a.installer_id = p_installer_id
     and a.status in ('offered', 'active', 'accepted')
     and a.scheduled_start_at is not null
     and a.scheduled_start_at >= upper(p_range)
     and (p_exclude_activity_id is null or a.activity_id <> p_exclude_activity_id)
   order by a.scheduled_start_at asc
   limit 1;

  if v_prev.scheduled_end_at is not null then
    v_needed := public.estimated_travel_minutes(v_prev.lat, v_prev.lng, p_lat, p_lng);
    if v_needed is null then
      v_unmeasured := true;
    else
      v_available := floor(
        extract(epoch from (lower(p_range) - v_prev.scheduled_end_at)) / 60
      )::integer;
      if v_available < v_needed then
        v_worst := jsonb_build_object(
          'verifiable', true, 'feasible', false, 'side', 'before',
          'available_minutes', v_available, 'needed_minutes', v_needed
        );
      end if;
    end if;
  end if;

  if v_worst is null and v_next.scheduled_start_at is not null then
    v_needed := public.estimated_travel_minutes(p_lat, p_lng, v_next.lat, v_next.lng);
    if v_needed is null then
      v_unmeasured := true;
    else
      v_available := floor(
        extract(epoch from (v_next.scheduled_start_at - upper(p_range))) / 60
      )::integer;
      if v_available < v_needed then
        v_worst := jsonb_build_object(
          'verifiable', true, 'feasible', false, 'side', 'after',
          'available_minutes', v_available, 'needed_minutes', v_needed
        );
      end if;
    end if;
  end if;

  if v_worst is not null then
    return v_worst;
  end if;

  -- No tener vecinos ES factible. No poder medir el traslado NO es lo mismo
  -- que estar bien, y por eso son dos respuestas distintas (AG-R10).
  if v_prev.scheduled_end_at is null and v_next.scheduled_start_at is null then
    return jsonb_build_object('verifiable', true, 'feasible', true, 'reason', 'NO_NEIGHBOURS');
  end if;

  if v_unmeasured then
    return jsonb_build_object('verifiable', false, 'reason', 'NO_COORDINATES');
  end if;

  return jsonb_build_object('verifiable', true, 'feasible', true);
end;
$fn$;

revoke all on function public.installer_travel_feasibility(
  uuid, tstzrange, numeric, numeric, uuid) from public;

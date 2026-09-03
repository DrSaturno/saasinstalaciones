-- Fase 2 de reputación: el cálculo.
--
-- **Los pesos son datos, no código.** Viven en `reputation_rule_versions` y no
-- en una constante, porque el propio plan dice que hay que calibrarlos contra
-- datos reales antes de mostrar el número (REP-CALC-05). Si estuvieran en una
-- función, calibrar sería desplegar. Los de `v1` que se siembran acá son un
-- punto de partida declarado, no una fórmula validada.
--
-- **Por qué esto vive en SQL y confiabilidad vive en TypeScript.** No es
-- inconsistencia: es la misma regla en dos situaciones distintas. Confiabilidad
-- se calcula en una función pura porque quien la mira ya tiene permiso para
-- leer los eventos que la componen. Reputación no: su valor viene justamente de
-- cruzar empresas, y ningún usuario puede leer ese conjunto completo. Así que
-- el cálculo tiene que ocurrir donde está el privilegio.
--
-- Y de ahí sale la mejor propiedad del diseño: **la frontera de privacidad es
-- la forma de lo que la función devuelve**, no una policy que alguien pueda
-- leer mal. `reputation_summary` devuelve totales y reconocimientos. No
-- devuelve filas de trabajos. No hay manera de pedirle el detalle, porque no lo
-- tiene para dar (DEC-17, AC-20-E).

-- ---------------------------------------------------------------------------
-- Las reglas, versionadas
-- ---------------------------------------------------------------------------

create table if not exists public.reputation_rule_versions (
  version text primary key,
  weights jsonb not null,
  active boolean not null default false,
  note text not null default '',
  created_at timestamptz not null default now()
);

-- Una sola versión activa: si hubiera dos, el mismo historial daría dos
-- números distintos según cuál se leyera primero.
create unique index if not exists reputation_rule_versions_active_key
  on public.reputation_rule_versions ((true)) where active;

alter table public.reputation_rule_versions enable row level security;

-- Se lee, no se escribe: el requisito pide que la fórmula sea explicable, y no
-- se puede explicar lo que no se puede mirar. Cambiarla es una migración.
drop policy if exists reputation_rules_read on public.reputation_rule_versions;
create policy reputation_rules_read on public.reputation_rule_versions
  for select to authenticated using (true);

grant select on public.reputation_rule_versions to authenticated;

insert into public.reputation_rule_versions (version, weights, active, note)
values (
  'v1',
  jsonb_build_object(
    -- Cuánto aporta cada hecho.
    'job_completed', 3,
    'incident_resolved', 2,
    'fault', -8,
    -- Aceptar sobre la hora: hasta 2 días hábiles, el mismo umbral que usa el
    -- plazo de cancelación (DEC-07). Que sean el mismo número no es casual —
    -- premiar por debajo del plazo que la plataforma considera razonable es
    -- justamente reconocer que la persona salvó una fecha comprometida.
    'short_notice_bonus', 4,
    'short_notice_max_business_days', 2,
    -- Dificultad: la suma de los pesos de las condiciones de la foto.
    'complex_bonus', 5,
    'complex_threshold', 3,
    'conditions', jsonb_build_object(
      'altura', 2,
      'electrico', 2,
      'nocturno', 2,
      'gran_formato', 1,
      'acceso_restringido', 1,
      -- Bajos a propósito: casi todo trabajo de vía pública es a la intemperie,
      -- así que si pesaran mucho "complejo" dejaría de distinguir nada.
      'exterior', 1,
      'flete', 1
    ),
    -- La trayectoria decae, no se corta: a diferencia de confiabilidad, que
    -- tiene una ventana dura de 180 días, acá lo viejo pesa cada vez menos pero
    -- nunca desaparece de golpe (REP-R7).
    'half_life_days', 365,
    -- La curva. Con K=40, unos 13 trabajos simples llevan a ~63/100 y unos 30 a
    -- ~89: los primeros mueven mucho y el número 200 mueve poco.
    'K', 40,
    'min_sample', 5,
    'streak_badge_min', 5,
    'sustained_badge_min_completed', 20
  ),
  true,
  'Punto de partida sin calibrar. REP-CALC-05 tiene que ajustarlo contra datos reales antes de mostrar el número a las empresas.'
)
on conflict (version) do nothing;

-- ---------------------------------------------------------------------------
-- La racha
-- ---------------------------------------------------------------------------

-- Se lee del libro de CONFIABILIDAD y no del de reputación, porque es el único
-- que sabe si una baja fue justificada. Duplicar esa clasificación daría dos
-- tablas capaces de contradecirse sobre la misma cancelación, y el día que se
-- contradigan ninguna de las dos es creíble (REP-R4).
--
-- Y se deriva en vez de guardarse en un contador (REP-R5): un contador
-- incrementable no se puede auditar contra los hechos y se desincroniza con el
-- primer evento revertido.
--
-- La racha es, literalmente, cuántos trabajos se completaron después de la
-- última falta. `cancel_in_notice` y `cancel_justified` ni figuran en la
-- consulta: no pueden cortarla ni por accidente.
create or replace function public.installer_streak(p_installer_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $fn$
  with hechos as (
    select kind, occurred_at
      from public.installer_reliability_events
     where installer_id = p_installer_id
       and reverted_at is null
       and kind in ('order_completed', 'cancel_late', 'reschedule_no_response')
  ),
  ultima_falta as (
    select coalesce(max(occurred_at), '-infinity'::timestamptz) as en
      from hechos
     where kind in ('cancel_late', 'reschedule_no_response')
  )
  select count(*)::integer
    from hechos, ultima_falta
   where hechos.kind = 'order_completed'
     and hechos.occurred_at > ultima_falta.en;
$fn$;

revoke all on function public.installer_streak(uuid) from public;

-- ---------------------------------------------------------------------------
-- El resumen
-- ---------------------------------------------------------------------------

-- `p_as_of` es obligatorio y no tiene default, igual que en confiabilidad: si
-- la función leyera el reloj por dentro, dos llamadas con los mismos eventos
-- darían distinto y AC-20-A dejaría de ser verificable.
create or replace function public.reputation_summary(
  p_installer_id uuid,
  p_as_of timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  w jsonb;
  v_version text;
  v_total numeric := 0;
  v_completed integer := 0;
  v_complex integer := 0;
  v_short integer := 0;
  v_incidents integer := 0;
  v_faults integer := 0;
  v_sample integer;
  v_score integer;
  v_streak integer;
  v_enough boolean;
  v_decay numeric;
  v_diff numeric;
  r record;
begin
  -- Quién puede preguntar. La empresa que evalúa puede ser cualquiera —de eso
  -- se trata que la reputación sirva para conseguir trabajo nuevo— pero lo que
  -- recibe son totales, nunca de quién ni dónde fue cada trabajo.
  if not (
    p_installer_id = auth.uid()
    or public.auth_role() = 'company_manager'
    or public.auth_coordinates_anywhere()
  ) then
    raise exception 'Sin permiso para consultar esta reputación';
  end if;

  select version, weights into v_version, w
    from public.reputation_rule_versions where active limit 1;
  if w is null then
    raise exception 'No hay una versión de reglas activa';
  end if;

  for r in
    select kind, context, occurred_at
      from public.installer_performance_events
     where installer_id = p_installer_id
       and reverted_at is null
       and occurred_at <= p_as_of
  loop
    v_decay := power(
      0.5,
      (extract(epoch from (p_as_of - r.occurred_at)) / 86400.0)
        / (w ->> 'half_life_days')::numeric
    );

    if r.kind = 'job_completed' then
      v_completed := v_completed + 1;
      v_total := v_total + (w ->> 'job_completed')::numeric * v_decay;

      select coalesce(sum((w -> 'conditions' ->> cond)::numeric), 0)
        into v_diff
        from jsonb_array_elements_text(
               coalesce(r.context -> 'conditions', '[]'::jsonb)) as cond;

      if v_diff >= (w ->> 'complex_threshold')::numeric then
        v_complex := v_complex + 1;
        v_total := v_total + (w ->> 'complex_bonus')::numeric * v_decay;
      end if;

    elsif r.kind = 'job_accepted' then
      -- Sin fecha comprometida no hay anticipación que premiar: `null` no
      -- entra por ninguna comparación.
      if (r.context ->> 'lead_time_business_days') is not null
         and (r.context ->> 'lead_time_business_days')::numeric
             <= (w ->> 'short_notice_max_business_days')::numeric then
        v_short := v_short + 1;
        v_total := v_total + (w ->> 'short_notice_bonus')::numeric * v_decay;
      end if;

    elsif r.kind = 'incident_resolved' then
      v_incidents := v_incidents + 1;
      v_total := v_total + (w ->> 'incident_resolved')::numeric * v_decay;
    end if;
  end loop;

  -- Las faltas salen del libro de confiabilidad: el pedido dice que las bajas
  -- injustificadas también restan reputación, y no hace falta un segundo
  -- registro de lo mismo.
  for r in
    select occurred_at
      from public.installer_reliability_events
     where installer_id = p_installer_id
       and reverted_at is null
       and occurred_at <= p_as_of
       and kind in ('cancel_late', 'reschedule_no_response')
  loop
    v_faults := v_faults + 1;
    v_total := v_total + (w ->> 'fault')::numeric * power(
      0.5,
      (extract(epoch from (p_as_of - r.occurred_at)) / 86400.0)
        / (w ->> 'half_life_days')::numeric
    );
  end loop;

  v_streak := public.installer_streak(p_installer_id);
  v_sample := v_completed + v_incidents;
  v_enough := v_sample >= (w ->> 'min_sample')::integer;

  -- Debajo de la muestra mínima no se afirma un número. Quien recién empieza no
  -- tiene mala reputación: no tiene reputación todavía, que no es lo mismo.
  if v_enough then
    v_score := round(
      100 * (1 - exp(-greatest(v_total, 0) / (w ->> 'K')::numeric))
    );
  else
    v_score := null;
  end if;

  return jsonb_build_object(
    'rule_version', v_version,
    'as_of', p_as_of,
    'score', v_score,
    'has_enough_history', v_enough,
    'sample_size', v_sample,
    'streak', v_streak,
    'completed', v_completed,
    'complex_completed', v_complex,
    'short_notice_accepted', v_short,
    'incidents_resolved', v_incidents,
    'faults', v_faults,
    -- Los reconocimientos se derivan, no se guardan: así ajustar un umbral no
    -- deja badges viejos contradiciendo al número que se muestra al lado.
    'badges', (
      select coalesce(jsonb_agg(b), '[]'::jsonb) from (
        select 'disponibilidad_inmediata' as b where v_short > 0
        union all
        select 'alta_dificultad' where v_complex > 0
        union all
        select 'racha' where v_streak >= (w ->> 'streak_badge_min')::integer
        union all
        select 'compromiso_sostenido'
         where v_completed >= (w ->> 'sustained_badge_min_completed')::integer
           and v_faults = 0
      ) as badges
    )
  );
end;
$fn$;

revoke all on function public.reputation_summary(uuid, timestamptz) from public;
grant execute on function public.reputation_summary(uuid, timestamptz) to authenticated;

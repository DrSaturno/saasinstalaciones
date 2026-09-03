-- Fase 3 de reputación: el desglose, y una sola cuenta para todo.
--
-- **El problema que resuelve.** El requisito pide que el instalador vea el
-- aporte de cada hecho a su número. La forma obvia sería escribir una segunda
-- función que recorra los eventos y calcule cuánto sumó cada uno. Y sería la
-- peor: dos implementaciones de la misma aritmética que se van separando con
-- el primer ajuste de pesos, hasta que un día el desglose no da el número que
-- se muestra al lado. En un sistema de reputación eso no es un bug cosmético
-- — es la razón por la que la gente deja de creerle.
--
-- Así que la aritmética queda en UN lugar: `reputation_contributions` devuelve
-- una fila por hecho con lo que aportó, y tanto el resumen como el detalle son
-- lecturas de esa misma tabla. El total es, literalmente, la suma del desglose.

-- ---------------------------------------------------------------------------
-- El aporte de cada hecho
-- ---------------------------------------------------------------------------

-- Interna: no la llama nadie de afuera. El control de quién puede ver qué está
-- en las dos funciones públicas de abajo, que son las que filtran.
create or replace function public.reputation_contributions(
  p_installer_id uuid,
  p_as_of timestamptz
)
returns table (
  event_id uuid,
  company_id uuid,
  kind text,
  occurred_at timestamptz,
  detail jsonb,
  effect numeric
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  w jsonb;
begin
  select weights into w from public.reputation_rule_versions where active limit 1;
  if w is null then
    raise exception 'No hay una version de reglas activa';
  end if;

  return query
  -- Los hechos de reputación
  select
    e.id,
    e.company_id,
    e.kind,
    e.occurred_at,
    case e.kind
      when 'job_completed' then jsonb_build_object(
        'conditions', coalesce(e.context -> 'conditions', '[]'::jsonb),
        'complex', d.dificultad >= (w ->> 'complex_threshold')::numeric,
        'difficulty', d.dificultad
      )
      when 'job_accepted' then jsonb_build_object(
        'lead_time_business_days', e.context -> 'lead_time_business_days',
        'short_notice', d.sobre_la_hora
      )
      else jsonb_build_object('severity', e.context -> 'severity')
    end,
    -- El decaimiento: lo viejo pesa menos, pero nunca se corta de golpe.
    (
      case e.kind
        when 'job_completed' then
          (w ->> 'job_completed')::numeric
          + case when d.dificultad >= (w ->> 'complex_threshold')::numeric
                 then (w ->> 'complex_bonus')::numeric else 0 end
        when 'job_accepted' then
          case when d.sobre_la_hora then (w ->> 'short_notice_bonus')::numeric
               else 0 end
        when 'incident_resolved' then (w ->> 'incident_resolved')::numeric
        else 0
      end
    ) * power(
      0.5,
      (extract(epoch from (p_as_of - e.occurred_at)) / 86400.0)
        / (w ->> 'half_life_days')::numeric
    )
  from public.installer_performance_events e
  cross join lateral (
    select
      coalesce((
        select sum((w -> 'conditions' ->> cond)::numeric)
          from jsonb_array_elements_text(
                 coalesce(e.context -> 'conditions', '[]'::jsonb)) as cond
      ), 0) as dificultad,
      (
        (e.context ->> 'lead_time_business_days') is not null
        and (e.context ->> 'lead_time_business_days')::numeric
            <= (w ->> 'short_notice_max_business_days')::numeric
      ) as sobre_la_hora
  ) d
  where e.installer_id = p_installer_id
    and e.reverted_at is null
    and e.occurred_at <= p_as_of

  union all

  -- Las faltas salen del libro de confiabilidad: el pedido dice que las bajas
  -- injustificadas también restan reputación, y no hace falta registrar dos
  -- veces el mismo hecho.
  select
    f.id,
    f.company_id,
    'fault',
    f.occurred_at,
    jsonb_build_object('reliability_kind', f.kind),
    (w ->> 'fault')::numeric * power(
      0.5,
      (extract(epoch from (p_as_of - f.occurred_at)) / 86400.0)
        / (w ->> 'half_life_days')::numeric
    )
  from public.installer_reliability_events f
  where f.installer_id = p_installer_id
    and f.reverted_at is null
    and f.occurred_at <= p_as_of
    and f.kind in ('cancel_late', 'reschedule_no_response');
end;
$fn$;

revoke all on function public.reputation_contributions(uuid, timestamptz) from public;

-- ---------------------------------------------------------------------------
-- El resumen, ahora como suma del desglose
-- ---------------------------------------------------------------------------

-- Mismo contrato y mismos números que antes; lo que cambia es que ya no tiene
-- aritmética propia. Si el total y el desglose alguna vez difirieran, sería
-- porque alguien volvió a escribir la cuenta dos veces.
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
begin
  if not (
    p_installer_id = auth.uid()
    or public.auth_role() = 'company_manager'
    or public.auth_coordinates_anywhere()
  ) then
    raise exception 'Sin permiso para consultar esta reputacion';
  end if;

  select version, weights into v_version, w
    from public.reputation_rule_versions where active limit 1;
  if w is null then
    raise exception 'No hay una version de reglas activa';
  end if;

  select
    coalesce(sum(c.effect), 0),
    count(*) filter (where c.kind = 'job_completed'),
    count(*) filter (where c.kind = 'job_completed'
                       and (c.detail ->> 'complex')::boolean),
    count(*) filter (where c.kind = 'job_accepted'
                       and (c.detail ->> 'short_notice')::boolean),
    count(*) filter (where c.kind = 'incident_resolved'),
    count(*) filter (where c.kind = 'fault')
  into v_total, v_completed, v_complex, v_short, v_incidents, v_faults
  from public.reputation_contributions(p_installer_id, p_as_of) c;

  v_streak := public.installer_streak(p_installer_id);
  v_sample := v_completed + v_incidents;
  v_enough := v_sample >= (w ->> 'min_sample')::integer;

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

-- ---------------------------------------------------------------------------
-- El detalle
-- ---------------------------------------------------------------------------

-- Quién ve qué (REQ-10.5): la persona ve todo lo suyo, porque el requisito
-- pide que pueda entender su propio número. La empresa ve **sólo los hechos de
-- su operación** — no el historial de esa persona en las demás empresas, que
-- es de otro inquilino. Esa diferencia es todo el punto de tener una función
-- de detalle aparte del resumen: el resumen cruza empresas justamente porque
-- no dice de quién fue cada trabajo.
create or replace function public.reputation_detail(
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
  v_propia boolean := p_installer_id = auth.uid();
  v_empresa uuid;
begin
  if v_propia then
    v_empresa := null;
  elsif public.auth_role() = 'company_manager' then
    v_empresa := public.auth_company();
  else
    raise exception 'Sin permiso para consultar este detalle';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'kind', c.kind,
        'occurred_at', c.occurred_at,
        'detail', c.detail,
        -- Redondeado para mostrar: el desglose es una explicación, no una
        -- planilla contable.
        'effect', round(c.effect, 2)
      )
      order by c.occurred_at desc
    )
    from public.reputation_contributions(p_installer_id, p_as_of) c
    where v_empresa is null or c.company_id = v_empresa
  ), '[]'::jsonb);
end;
$fn$;

revoke all on function public.reputation_detail(uuid, timestamptz) from public;
grant execute on function public.reputation_detail(uuid, timestamptz) to authenticated;

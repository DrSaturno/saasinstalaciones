-- Fase 1 de reputación: el libro de eventos.
--
-- **Por qué un libro aparte y no una consulta.** La reputación se podría
-- recalcular leyendo las condiciones actuales de cada orden. No sirve: marcar
-- una orden como "trabajo en altura" DESPUÉS de terminada le cambiaría la
-- reputación a alguien por un trabajo que ya hizo. Cada evento guarda en
-- `context` la foto de las características al momento del hecho, y esa foto no
-- se toca nunca más (AC-20-I).
--
-- **Hechos, no puntajes.** Igual que en confiabilidad: acá no hay pesos ni
-- umbrales. Cuánto vale "aceptó con 1 día hábil de anticipación" es parte de la
-- fórmula, y la fórmula tiene su propia versión (Fase 2). Cambiarla no puede
-- obligar a reescribir el historial.
--
-- **Por qué no alcanza con `installer_reliability_events`.** Ese libro dice que
-- alguien aceptó y completó; éste dice CÓMO era el trabajo que aceptó. Son
-- preguntas distintas, con fórmulas y versiones independientes. La racha, en
-- cambio, NO vive acá: se deriva del libro de confiabilidad, que es el único
-- que sabe si una baja fue justificada (REP-R4).

-- ---------------------------------------------------------------------------
-- La foto de las condiciones
-- ---------------------------------------------------------------------------

-- Gemela SQL de `workConditionsOf` en lib/domain/work-conditions.ts. Como con
-- los días hábiles, la autoridad es ésta: el cliente no puede auto-declarar qué
-- tan difícil era su propio trabajo. La de TypeScript es para mostrar.
--
-- Incluye las derivadas (`exterior`, `flete`) justamente porque son las que
-- pueden cambiar después: si mañana editan `requires_freight`, la foto vieja
-- tiene que seguir diciendo lo que era cuando la persona aceptó.
create or replace function public.order_condition_snapshot(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select jsonb_build_object(
    'conditions',
    coalesce(
      (select jsonb_agg(c.condition order by c.condition)
         from public.work_order_conditions c
        where c.order_id = w.id),
      '[]'::jsonb
    )
    || (case when w.indoor then '[]'::jsonb else '["exterior"]'::jsonb end)
    || (case when w.requires_freight then '["flete"]'::jsonb else '[]'::jsonb end)
  )
  from public.work_orders w
  where w.id = p_order_id;
$fn$;

-- ---------------------------------------------------------------------------
-- El libro
-- ---------------------------------------------------------------------------

create table if not exists public.installer_performance_events (
  id uuid primary key default gen_random_uuid(),
  installer_id uuid not null references public.installers (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  order_id uuid references public.work_orders (id) on delete set null,

  kind text not null check (kind in (
    'job_accepted',
    'job_completed',
    'incident_resolved'
  )),

  -- La foto: condiciones congeladas y, al aceptar, la anticipación real.
  context jsonb not null default '{}'::jsonb,

  occurred_at timestamptz not null default now(),

  source_table text,
  source_id uuid,

  reverted_at timestamptz,
  reverted_by uuid references public.profiles (id) on delete set null,
  revert_reason text not null default '',

  constraint performance_revert_pair check (
    (reverted_at is null) = (reverted_by is null)
  )
);

-- Un hecho, un evento. Si la función que lo emite corre dos veces —un reintento,
-- un update que vuelve a disparar el trigger— la segunda no duplica.
create unique index if not exists performance_events_source_key
  on public.installer_performance_events (kind, source_table, source_id)
  where source_id is not null;

create index if not exists performance_events_installer_idx
  on public.installer_performance_events (installer_id, occurred_at desc);

alter table public.installer_performance_events enable row level security;

-- Sólo hay políticas de SELECT, y eso es lo que cierra la escritura: con RLS
-- activa y sin política permisiva, insert/update/delete quedan denegados para
-- `authenticated` aunque el proyecto le otorgue el privilegio por default.
-- Todo lo que escribe pasa por las funciones `security definer` de abajo.

drop policy if exists performance_events_own_read
  on public.installer_performance_events;
create policy performance_events_own_read
  on public.installer_performance_events
  for select to authenticated
  using (installer_id = auth.uid());

-- La empresa ve los eventos ocurridos EN SU OPERACIÓN, no el historial completo
-- de la persona en la plataforma. El agregado que cruza empresas llega en la
-- Fase 2 y sale por una función que devuelve sólo totales (DEC-17).
drop policy if exists performance_events_company_read
  on public.installer_performance_events;
create policy performance_events_company_read
  on public.installer_performance_events
  for select to authenticated
  using (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  );

grant select on public.installer_performance_events to authenticated;

-- ---------------------------------------------------------------------------
-- Emisión
-- ---------------------------------------------------------------------------

create or replace function public.emit_performance_event(
  p_installer_id uuid,
  p_company_id uuid,
  p_order_id uuid,
  p_kind text,
  p_source_table text,
  p_source_id uuid,
  p_context jsonb,
  p_occurred_at timestamptz default now()
)
returns void
language sql
security definer
set search_path = public
as $fn$
  insert into public.installer_performance_events (
    installer_id, company_id, order_id, kind,
    source_table, source_id, context, occurred_at
  )
  select p_installer_id, p_company_id, p_order_id, p_kind,
         p_source_table, p_source_id, coalesce(p_context, '{}'::jsonb),
         p_occurred_at
  where p_installer_id is not null
  on conflict do nothing;
$fn$;

revoke all on function public.emit_performance_event(
  uuid, uuid, uuid, text, text, uuid, jsonb, timestamptz) from public;

-- Aceptar y completar salen del ciclo de vida de la orden, igual que en
-- confiabilidad, así que van por trigger y no por una acción explícita.
create or replace function public.track_performance_from_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_country text;
  v_lead integer;
begin
  if new.assigned_installer_id is not null
     and new.installer_accepted_at is not null
     and old.installer_accepted_at is null then

    select c.country into v_country
    from public.companies c where c.id = new.company_id;
    v_country := coalesce(v_country, 'AR');

    -- La anticipación se mide en días HÁBILES y con el calendario de la
    -- empresa: es la misma autoridad que decide si una baja fue en plazo. Si se
    -- midiera en días corridos, la plataforma podría premiar por aceptar algo
    -- que después considera fuera de plazo (REP-R3).
    --
    -- Sin fecha comprometida no hay anticipación que medir, y `null` es la
    -- respuesta honesta: no es lo mismo que aceptar sobre la hora.
    if new.scheduled_date is not null then
      v_lead := public.business_days_between(
        (new.installer_accepted_at at time zone
          case when v_country = 'BR' then 'America/Sao_Paulo'
               else 'America/Argentina/Buenos_Aires' end)::date,
        new.scheduled_date,
        v_country,
        new.company_id
      );
    else
      v_lead := null;
    end if;

    perform public.emit_performance_event(
      new.assigned_installer_id, new.company_id, new.id,
      'job_accepted', 'work_orders', new.id,
      public.order_condition_snapshot(new.id)
        || jsonb_build_object('lead_time_business_days', v_lead),
      new.installer_accepted_at
    );
  end if;

  if new.status = 'finalizada' and old.status is distinct from 'finalizada'
     and new.assigned_installer_id is not null then
    perform public.emit_performance_event(
      new.assigned_installer_id, new.company_id, new.id,
      'job_completed', 'work_orders', new.id,
      public.order_condition_snapshot(new.id)
    );
  end if;

  return new;
end;
$fn$;

drop trigger if exists work_orders_track_performance on public.work_orders;
create trigger work_orders_track_performance
  after update of installer_accepted_at, status on public.work_orders
  for each row execute function public.track_performance_from_order();

-- Incidencias resueltas.
--
-- El evento dice que en ese trabajo hubo una incidencia y se resolvió; NO dice
-- que la haya resuelto bien el instalador ni que corresponda premiarlo. Eso lo
-- decide la fórmula, que en la Fase 2 va a poder exigir que el trabajo además
-- se haya completado y pesar la severidad. El libro registra el hecho.
create or replace function public.track_performance_from_incident()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_installer uuid;
begin
  if new.status = 'resolved' and old.status is distinct from 'resolved' then
    select w.assigned_installer_id into v_installer
    from public.work_orders w where w.id = new.order_id;

    if v_installer is not null then
      perform public.emit_performance_event(
        v_installer, new.company_id, new.order_id,
        'incident_resolved', 'order_incidents', new.id,
        jsonb_build_object(
          'category', new.category,
          'severity', new.severity,
          'requires_revisit', new.requires_revisit
        ),
        coalesce(new.resolved_at, now())
      );
    end if;
  end if;

  return new;
end;
$fn$;

drop trigger if exists order_incidents_track_performance on public.order_incidents;
create trigger order_incidents_track_performance
  after update of status on public.order_incidents
  for each row execute function public.track_performance_from_incident();

-- ---------------------------------------------------------------------------
-- Reversa
-- ---------------------------------------------------------------------------

-- Nada se borra: se revierte, y queda el motivo (REP-R10, AC-20-G). Espejo de
-- `revert_reliability_event`, incluida la regla de quién puede: sólo la empresa
-- donde ocurrió el hecho, nunca otra que después lo mire en un agregado.
create or replace function public.revert_performance_event(
  p_event_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_event public.installer_performance_events%rowtype;
begin
  select * into v_event from public.installer_performance_events e
  where e.id = p_event_id for update;
  if not found then raise exception 'Evento no encontrado'; end if;

  if not (
    public.auth_role() = 'company_manager'
    and v_event.company_id = public.auth_company()
  ) then
    raise exception 'Sólo la empresa puede revertir un evento de su operación';
  end if;

  if v_event.reverted_at is not null then
    raise exception 'Este evento ya fue revertido';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Una reversa necesita un motivo';
  end if;

  update public.installer_performance_events
  set reverted_at = now(),
      reverted_by = auth.uid(),
      revert_reason = left(btrim(p_reason), 500)
  where id = p_event_id;
end;
$fn$;

revoke all on function public.revert_performance_event(uuid, text) from public;
grant execute on function public.revert_performance_event(uuid, text) to authenticated;

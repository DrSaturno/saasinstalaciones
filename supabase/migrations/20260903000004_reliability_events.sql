-- Fase 4 de confiabilidad: los eventos.
--
-- **Hechos, no puntajes.** Cada fila dice qué pasó (aceptó, completó, se dio de
-- baja en plazo, no contestó), nunca cuánto pesa. El peso lo pone la fórmula al
-- proyectar, y por eso vive en `lib/domain/reliability.ts`: cambiar la fórmula
-- no obliga a reescribir el historial, y recalcular con los mismos eventos da
-- siempre el mismo resultado — que es lo que pide ADR-011.
--
-- **Nada se borra: se revierte.** Si una decisión se da vuelta, el evento queda
-- y se marca `reverted_at` con quién y por qué. El requisito habla de
-- penalizaciones que se pueden revisar y revertir; un `delete` no deja rastro
-- de que hubo algo que revisar.
--
-- **Modo sombra.** Esta migración NO conecta el índice a nada: no filtra
-- ofertas, no cambia prioridades, no bloquea. Sólo registra y deja ver. Salir
-- de sombra es una decisión explícita y posterior (DEC-08, R6-GATE).

create table if not exists public.installer_reliability_events (
  id uuid primary key default gen_random_uuid(),
  installer_id uuid not null references public.installers (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  order_id uuid references public.work_orders (id) on delete set null,

  kind text not null check (kind in (
    'order_accepted',
    'order_completed',
    'cancel_in_notice',
    'cancel_late',
    'cancel_justified',
    'reschedule_accepted',
    'reschedule_declined',
    'reschedule_no_response'
  )),

  occurred_at timestamptz not null default now(),

  -- De dónde salió, para poder rastrearlo y para no emitir dos veces por el
  -- mismo hecho.
  source_table text,
  source_id uuid,

  reverted_at timestamptz,
  reverted_by uuid references public.profiles (id) on delete set null,
  revert_reason text not null default '',

  constraint reliability_revert_pair check (
    (reverted_at is null) = (reverted_by is null)
  )
);

-- Un hecho, un evento. El origen es la llave natural: si la función que lo
-- emite corre dos veces, la segunda no duplica.
create unique index if not exists reliability_events_source_key
  on public.installer_reliability_events (kind, source_table, source_id)
  where source_id is not null;

create index if not exists reliability_events_installer_idx
  on public.installer_reliability_events (installer_id, occurred_at desc);

alter table public.installer_reliability_events enable row level security;

-- El instalador ve los suyos. El requisito pide transparencia: tiene que poder
-- entender qué evento afectó su nivel.
drop policy if exists reliability_events_own_read on public.installer_reliability_events;
create policy reliability_events_own_read on public.installer_reliability_events
  for select to authenticated
  using (installer_id = auth.uid());

-- La empresa ve los eventos ocurridos EN SU OPERACIÓN, no el historial completo
-- de la persona en la plataforma. ADR-011: nunca historial por empresa ajena.
drop policy if exists reliability_events_company_read on public.installer_reliability_events;
create policy reliability_events_company_read on public.installer_reliability_events
  for select to authenticated
  using (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  );

-- Nadie escribe a mano: los eventos los emiten las funciones del flujo.
-- Revertir también es una función, para que quede el motivo.

-- ---------------------------------------------------------------------------
-- Emisión
-- ---------------------------------------------------------------------------

create or replace function public.emit_reliability_event(
  p_installer_id uuid,
  p_company_id uuid,
  p_order_id uuid,
  p_kind text,
  p_source_table text,
  p_source_id uuid,
  p_occurred_at timestamptz default now()
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.installer_reliability_events (
    installer_id, company_id, order_id, kind, source_table, source_id, occurred_at
  )
  select p_installer_id, p_company_id, p_order_id, p_kind,
         p_source_table, p_source_id, p_occurred_at
  where p_installer_id is not null
  on conflict do nothing;
$$;

revoke all on function public.emit_reliability_event(uuid, uuid, uuid, text, text, uuid, timestamptz) from public;

-- Aceptar y completar salen del ciclo de vida de la orden, no de una acción
-- específica, así que van por trigger.
create or replace function public.track_reliability_from_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_installer_id is not null
     and new.installer_accepted_at is not null
     and old.installer_accepted_at is null then
    perform public.emit_reliability_event(
      new.assigned_installer_id, new.company_id, new.id,
      'order_accepted', 'work_orders', new.id, new.installer_accepted_at
    );
  end if;

  if new.status = 'finalizada' and old.status is distinct from 'finalizada'
     and new.assigned_installer_id is not null then
    perform public.emit_reliability_event(
      new.assigned_installer_id, new.company_id, new.id,
      'order_completed', 'work_orders', new.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists work_orders_track_reliability on public.work_orders;
create trigger work_orders_track_reliability
  after update of installer_accepted_at, status on public.work_orders
  for each row execute function public.track_reliability_from_order();

-- ---------------------------------------------------------------------------
-- El silencio, que es el único que penaliza por sí solo
-- ---------------------------------------------------------------------------

create or replace function public.emit_reschedule_timeouts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_row record;
begin
  -- Vencidas: notificadas, sin respuesta, sin superar, y con el plazo ya
  -- cumplido según el calendario congelado en la propia fila.
  for v_row in
    select r.*
    from public.order_reschedules r
    where r.notified_at is not null
      and r.response is null
      and r.superseded_at is null
      and public.business_days_between(
            (r.notified_at at time zone r.calendar_timezone)::date,
            (now() at time zone r.calendar_timezone)::date,
            r.calendar_country,
            r.company_id
          ) > r.response_window_days
  loop
    perform public.emit_reliability_event(
      v_row.installer_id, v_row.company_id, v_row.order_id,
      'reschedule_no_response', 'order_reschedules', v_row.id
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.emit_reschedule_timeouts() from public;

comment on function public.emit_reschedule_timeouts() is
  'Idempotente: el índice único por origen evita duplicar si corre dos veces. La corrección del vencimiento NO depende de que corra a horario — el estado se deriva; esto sólo materializa el evento.';

-- ---------------------------------------------------------------------------
-- Reversa auditada
-- ---------------------------------------------------------------------------

create or replace function public.revert_reliability_event(
  p_event_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.installer_reliability_events%rowtype;
begin
  select * into v_event from public.installer_reliability_events e
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

  update public.installer_reliability_events
  set reverted_at = now(),
      reverted_by = auth.uid(),
      revert_reason = left(btrim(p_reason), 500)
  where id = p_event_id;
end;
$$;

revoke all on function public.revert_reliability_event(uuid, text) from public;
grant execute on function public.revert_reliability_event(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Emisión desde el flujo, por trigger
--
-- Van por trigger y no editando `respond_to_reschedule` y compañía por dos
-- razones: no hay que duplicar esas funciones enteras sólo para agregarles una
-- línea, y cubre cualquier camino futuro que escriba esas tablas — no sólo el
-- que existe hoy.
-- ---------------------------------------------------------------------------

create or replace function public.track_reliability_from_reschedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.response is not null and old.response is null then
    perform public.emit_reliability_event(
      new.installer_id, new.company_id, new.order_id,
      case when new.response = 'accepted'
           then 'reschedule_accepted'
           else 'reschedule_declined' end,
      'order_reschedules', new.id, new.responded_at
    );
  end if;
  return new;
end;
$$;

drop trigger if exists order_reschedules_track_reliability on public.order_reschedules;
create trigger order_reschedules_track_reliability
  after update of response on public.order_reschedules
  for each row execute function public.track_reliability_from_reschedule();

create or replace function public.track_reliability_from_cancellation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Pedida en plazo: el requisito dice que no penaliza, pero el hecho se
  -- registra igual. El índice mira el comportamiento general, no sólo lo malo.
  if tg_op = 'INSERT' and new.status = 'auto_approved' then
    perform public.emit_reliability_event(
      new.installer_id, new.company_id, new.order_id,
      'cancel_in_notice', 'order_cancellation_requests', new.id, new.requested_at
    );
    return new;
  end if;

  -- Resuelta fuera de plazo. Aprobada y justificada no pesa igual que aprobada
  -- sin justificación: esa distinción es justamente para qué existe la
  -- revisión humana. Rechazada no emite nada — no hubo baja, el compromiso
  -- sigue en pie.
  if tg_op = 'UPDATE'
     and old.status = 'pending'
     and new.status = 'approved' then
    perform public.emit_reliability_event(
      new.installer_id, new.company_id, new.order_id,
      case when new.justified then 'cancel_justified' else 'cancel_late' end,
      'order_cancellation_requests', new.id, new.reviewed_at
    );
  end if;

  return new;
end;
$$;

drop trigger if exists order_cancellation_track_reliability_insert
  on public.order_cancellation_requests;
create trigger order_cancellation_track_reliability_insert
  after insert on public.order_cancellation_requests
  for each row execute function public.track_reliability_from_cancellation();

drop trigger if exists order_cancellation_track_reliability_update
  on public.order_cancellation_requests;
create trigger order_cancellation_track_reliability_update
  after update of status on public.order_cancellation_requests
  for each row execute function public.track_reliability_from_cancellation();

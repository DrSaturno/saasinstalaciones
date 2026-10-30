-- Bloque 5 (docs/specs/2026-09-24-multi-instalador): varios instaladores por
-- trabajo, hasta 15.
--
-- **Diseño aditivo, no reemplazo.** El responsable de una orden sigue siendo
-- exactamente `work_orders.assigned_installer_id`/`installer_amount`, escrito
-- por el mismo `assign_installer_gate` de siempre, sin tocar su firma ni su
-- comportamiento. Para una orden con un solo instalador (el caso común) nada
-- cambia. Lo nuevo es `work_order_team_members`, de 0 a 14 AYUDANTES además
-- del responsable, y cada policy que hoy decide acceso comparando
-- `assigned_installer_id = auth.uid()` se extiende con un OR que es `false`
-- cuando no hay ayudantes. Ver `docs/specs/2026-09-24-multi-instalador/design.md`.
--
-- El motor de conflictos de agenda (punto 21: `installer_overlapping_assignments`,
-- `installer_absence_blocks`, `installer_travel_feasibility`, la exclusión GiST
-- de `work_assignments`) ya está escrito por instalador, no por actividad ni
-- por orden — se reutiliza tal cual para cada ayudante, sin ninguna
-- modificación.

-- ---------------------------------------------------------------------------
-- 1. Relajar el índice que hoy fuerza una sola fila vigente POR ACTIVIDAD
-- ---------------------------------------------------------------------------

-- Pasa a ser una sola fila vigente por (actividad, instalador): dos personas
-- distintas pueden tener cada una su propia fila vigente en la misma
-- actividad. La exclusión GiST `work_assignments_no_overlap` ya está indexada
-- por `installer_id`, así que agregar una segunda persona no choca contra
-- ella: cada quien se choca sólo consigo mismo.
drop index public.work_assignments_one_current_idx;

create unique index work_assignments_one_current_idx
  on public.work_assignments (activity_id, installer_id)
  where status in ('offered', 'active', 'accepted');

-- ---------------------------------------------------------------------------
-- 2. El plantel: ayudantes de una orden
-- ---------------------------------------------------------------------------

create table public.work_order_team_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  order_id uuid not null,
  installer_id uuid not null references public.installers (id) on delete restrict,
  installer_amount numeric(14, 2)
    check (installer_amount is null or installer_amount >= 0),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid')),
  payment_status_changed_at timestamptz,
  payment_status_changed_by uuid references public.profiles (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'removed')),
  added_by uuid references public.profiles (id) on delete set null,
  removed_by uuid references public.profiles (id) on delete set null,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_order_team_members_order_company_fk
    foreign key (order_id, company_id)
    references public.work_orders (id, company_id) on delete cascade,
  constraint work_order_team_members_id_company_key unique (id, company_id),
  constraint work_order_team_members_removed_shape_check check (
    (status = 'active' and removed_at is null and removed_by is null)
    or (status = 'removed' and removed_at is not null)
  )
);

comment on table public.work_order_team_members is
  'Ayudantes de una orden, además del responsable (work_orders.assigned_installer_id). Bloque 5, docs/specs/2026-09-24-multi-instalador.';

-- Una fila activa por (orden, instalador): sacarlo y volver a sumarlo es una
-- fila nueva, no reactivar la vieja — conserva el historial de cuándo entró y
-- salió cada vez.
create unique index work_order_team_members_active_idx
  on public.work_order_team_members (order_id, installer_id)
  where status = 'active';

create index work_order_team_members_installer_idx
  on public.work_order_team_members (installer_id, status);

alter table public.work_order_team_members enable row level security;

-- Sin insert/update/delete para `authenticated`: todas las escrituras pasan
-- por `add_order_team_member`/`remove_order_team_member`/`set_team_member_*`
-- (security definer, corren como dueño de la función y no necesitan grant).
create policy work_order_team_members_read on public.work_order_team_members
  for select to authenticated
  using (
    installer_id = auth.uid()
    or public.auth_can_operate_work_order(order_id, company_id)
  );

revoke all on public.work_order_team_members from anon;
grant select on public.work_order_team_members to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Quién es "del plantel" de una orden, para las policies de acceso
-- ---------------------------------------------------------------------------

create or replace function public.auth_is_order_helper(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.work_order_team_members m
    where m.order_id = p_order_id
      and m.installer_id = auth.uid()
      and m.status = 'active'
  )
$$;

revoke all on function public.auth_is_order_helper(uuid) from public;
grant execute on function public.auth_is_order_helper(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. El gate para ayudantes: agrega, nunca reemplaza
-- ---------------------------------------------------------------------------

create or replace function public.add_order_team_member(
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
  v_range tstzrange;
  v_travel jsonb;
  v_available boolean;
  v_reason text;
  v_override_allowed boolean := false;
  v_team_size integer;
  v_member_id uuid;
  v_wa_id uuid;
  v_version integer;
  v_correlation_id uuid := gen_random_uuid();
begin
  if auth.uid() is null then
    raise exception 'ACCESS_DENIED';
  end if;

  -- Idempotencia: mismo criterio que `assign_installer_gate`.
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

  if v_order.assigned_installer_id is null then
    raise exception 'ORDER_NEEDS_LEAD_FIRST';
  end if;
  if v_order.assigned_installer_id = p_installer_id then
    raise exception 'TEAM_ALREADY_LEAD';
  end if;

  -- El cupo (15 en total, responsable incluido) se protege bajo el mismo
  -- advisory lock que el resto de esta función usa para el instalador, más uno
  -- propio por orden: dos altas concurrentes en la misma orden no pueden
  -- pasar las dos el cheque de cupo.
  perform pg_advisory_xact_lock(hashtext(p_order_id::text));

  select count(*) into v_team_size
  from public.work_order_team_members
  where order_id = p_order_id and status = 'active';
  if v_team_size + 1 >= 15 then
    raise exception 'TEAM_FULL';
  end if;

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

  if v_activity.schedule_precision = 'exact'
     and v_activity.scheduled_start_at is not null
     and v_activity.scheduled_end_at is not null then
    v_range := tstzrange(v_activity.scheduled_start_at, v_activity.scheduled_end_at, '[)');
  else
    v_range := null;
  end if;

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
  elsif exists (
    select 1 from public.work_order_team_members m
    where m.order_id = p_order_id
      and m.installer_id = p_installer_id
      and m.status = 'active'
  ) then
    -- Ya está en el plantel: reintento idempotente, no un alta nueva.
    v_available := true;
    v_reason := 'AVAILABLE';
  else
    -- Mismo cerrojo por instalador que `assign_installer_gate` (AC-11-A):
    -- lo que está en disputa es la agenda de esa persona.
    perform pg_advisory_xact_lock(hashtext(p_installer_id::text));

    if public.installer_absence_blocks(p_installer_id, v_range) then
      v_available := false;
      v_reason := 'OUTSIDE_AVAILABILITY';
    elsif public.installer_overlapping_assignments(p_installer_id, v_range, v_activity.id) > 0 then
      v_available := false;
      v_reason := 'SCHEDULE_CONFLICT';
    else
      v_travel := public.installer_travel_feasibility(
        p_installer_id, v_range, v_site.lat, v_site.lng, v_activity.id
      );
      if v_travel ->> 'verifiable' = 'true'
         and (v_travel ->> 'feasible')::boolean = false then
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
        v_available := true;
        v_reason := 'AVAILABLE';
      end if;
    end if;
  end if;

  if v_available then
    -- `version` es un contador POR ACTIVIDAD (`work_assignments_activity_version_key`
    -- es `unique(activity_id, version)`), compartido por el responsable y todos
    -- los ayudantes — no arranca en 1 para cada instalador nuevo. El lock por
    -- actividad hace atómico "leer el máximo, insertar con el siguiente" frente
    -- a otra alta concurrente en la misma orden (ya serializada arriba por el
    -- lock de orden) o en la misma actividad desde otra orden que la comparta.
    perform pg_advisory_xact_lock(hashtext(v_activity.id::text));
    select coalesce(max(version), 0) + 1 into v_version
    from public.work_assignments
    where activity_id = v_activity.id;

    insert into public.work_assignments (
      company_id, activity_id, installer_id, version, status,
      schedule_precision, scheduled_start_at, scheduled_end_at, timezone,
      correlation_id, created_by
    ) values (
      v_order.company_id, v_activity.id, p_installer_id, v_version, 'active',
      v_activity.schedule_precision, v_activity.scheduled_start_at,
      v_activity.scheduled_end_at, v_activity.timezone,
      v_correlation_id, auth.uid()
    )
    on conflict (activity_id, installer_id) where status in ('offered', 'active', 'accepted')
    do nothing;

    insert into public.work_order_team_members (
      company_id, order_id, installer_id, added_by
    ) values (
      v_order.company_id, p_order_id, p_installer_id, auth.uid()
    )
    on conflict (order_id, installer_id) where status = 'active'
    do nothing;

    -- Cubre tanto el alta recién hecha como el reintento idempotente (ninguno
    -- de los dos inserts de arriba hizo nada porque las filas ya existían): en
    -- los dos casos hay una fila activa de cada una para leer.
    select id into v_member_id
    from public.work_order_team_members
    where order_id = p_order_id and installer_id = p_installer_id and status = 'active';

    select id into v_wa_id
    from public.work_assignments
    where activity_id = v_activity.id and installer_id = p_installer_id
      and status in ('offered', 'active', 'accepted');

    if v_reason = 'AVAILABLE' and v_override_allowed then
      insert into public.assignment_override_audit (
        company_id, activity_id, assignment_id, installer_id,
        conflict_code, reason, actor_id, correlation_id
      ) values (
        v_order.company_id, v_activity.id, v_wa_id, p_installer_id,
        'TRAVEL_CONFLICT', trim(p_override_reason), auth.uid(), v_correlation_id
      );
    end if;
  end if;

  -- `assignment_id` en el recibo es FK a `work_assignments`, no a
  -- `work_order_team_members`: va `v_wa_id`, la fila de agenda, aunque lo que
  -- de verdad importa para el llamador (y lo que devuelve el jsonb de abajo)
  -- sea `v_member_id`, la fila del plantel.
  insert into public.assignment_command_receipts (
    operation_id, company_id, actor_id, activity_id, request_payload,
    available, reason_code, override_allowed, assignment_id,
    activity_version, correlation_id
  ) values (
    p_operation_id, v_order.company_id, auth.uid(), v_activity.id,
    jsonb_build_object('order_id', p_order_id, 'installer_id', p_installer_id, 'team_member', true),
    v_available, v_reason, v_override_allowed, v_wa_id,
    1, v_correlation_id
  );

  return jsonb_build_object(
    'available', v_available,
    'code', v_reason,
    'override_allowed', v_override_allowed,
    'assignment_id', v_wa_id,
    'team_member_id', v_member_id,
    'operation_id', p_operation_id
  );
end;
$fn$;

-- `revoke ... from public` NO ALCANZA en este proyecto: se comprobó (24-09-2026,
-- ver advisor de seguridad de Supabase) que `anon` conserva EXECUTE en
-- funciones nuevas pese al revoke de siempre — hay un grant a `anon` que no
-- pasa por `public` y que el revoke-de-public no toca. Por eso el revoke acá
-- es explícito por rol, no sólo `from public`.
revoke all on function public.add_order_team_member(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.add_order_team_member(uuid, uuid, uuid, text) to authenticated;

-- Quitar un ayudante nunca crea un conflicto de agenda: no necesita el gate,
-- mismo criterio que desasignar al responsable hoy.
create or replace function public.remove_order_team_member(
  p_order_id uuid,
  p_installer_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_order public.work_orders%rowtype;
  v_activity_id uuid;
begin
  if auth.uid() is null then
    raise exception 'ACCESS_DENIED';
  end if;

  select * into v_order from public.work_orders where id = p_order_id;
  if not found or not public.auth_can_operate_work_order(p_order_id, v_order.company_id) then
    raise exception 'ACCESS_DENIED';
  end if;

  update public.work_order_team_members
  set status = 'removed', removed_by = auth.uid(), removed_at = now()
  where order_id = p_order_id
    and installer_id = p_installer_id
    and status = 'active';

  if not found then
    raise exception 'TEAM_MEMBER_NOT_FOUND';
  end if;

  select a.id into v_activity_id
  from public.work_activities a
  where a.work_order_id = p_order_id
  order by case when a.activity_type = 'execution' then 0 else 1 end
  limit 1;

  if v_activity_id is not null then
    update public.work_assignments
    set status = 'cancelled', valid_until = now()
    where activity_id = v_activity_id
      and installer_id = p_installer_id
      and status in ('offered', 'active', 'accepted');
  end if;
end;
$fn$;

revoke all on function public.remove_order_team_member(uuid, uuid) from public, anon;
grant execute on function public.remove_order_team_member(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Dinero por ayudante
-- ---------------------------------------------------------------------------

create or replace function public.set_team_member_amount(
  p_order_id uuid,
  p_installer_id uuid,
  p_amount numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id from public.work_orders where id = p_order_id;
  -- Lo que se le paga a alguien es del gerente, igual que `installer_amount` del
  -- responsable: un coordinador opera la orden pero no toca plata, y esta
  -- función es `security definer`, así que el muro tiene que estar acá y no
  -- sólo en que la pantalla se lo oculte.
  if not found
     or not public.auth_can_operate_work_order(p_order_id, v_company_id)
     or not public.auth_is_company_manager(v_company_id) then
    raise exception 'ACCESS_DENIED';
  end if;
  if p_amount is not null and p_amount < 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  update public.work_order_team_members
  set installer_amount = p_amount, updated_at = now()
  where order_id = p_order_id
    and installer_id = p_installer_id
    and status = 'active';

  if not found then
    raise exception 'TEAM_MEMBER_NOT_FOUND';
  end if;
end;
$fn$;

revoke all on function public.set_team_member_amount(uuid, uuid, numeric) from public, anon;
grant execute on function public.set_team_member_amount(uuid, uuid, numeric) to authenticated;

create or replace function public.set_team_member_payment_status(
  p_order_id uuid,
  p_installer_id uuid,
  p_status text,
  p_note text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_company_id uuid;
  v_current text;
begin
  if p_status not in ('pending', 'paid') then
    raise exception 'Estado de pago inválido: %', p_status;
  end if;

  select company_id into v_company_id from public.work_orders where id = p_order_id;
  if not found
     or not public.auth_can_operate_work_order(p_order_id, v_company_id)
     or not public.auth_is_company_manager(v_company_id) then
    raise exception 'ACCESS_DENIED';
  end if;

  select payment_status into v_current
  from public.work_order_team_members
  where order_id = p_order_id and installer_id = p_installer_id and status = 'active';
  if not found then
    raise exception 'TEAM_MEMBER_NOT_FOUND';
  end if;

  if v_current = p_status then
    return;
  end if;

  update public.work_order_team_members
  set payment_status = p_status,
      payment_status_changed_at = now(),
      payment_status_changed_by = auth.uid(),
      updated_at = now()
  where order_id = p_order_id and installer_id = p_installer_id and status = 'active';

  insert into public.order_payment_events (
    order_id, company_id, installer_id, status, note, changed_by
  )
  values (p_order_id, v_company_id, p_installer_id, p_status, coalesce(p_note, ''), auth.uid());
end;
$fn$;

revoke all on function public.set_team_member_payment_status(uuid, uuid, text, text) from public, anon;
grant execute on function public.set_team_member_payment_status(uuid, uuid, text, text) to authenticated;

-- `null` sigue significando "evento del responsable" (el `set_order_payment_status`
-- de siempre, sin tocar); no nulo es el evento de ese ayudante puntual.
alter table public.order_payment_events
  add column installer_id uuid references public.installers (id) on delete set null;

comment on column public.order_payment_events.installer_id is
  'Null = evento del responsable de la orden (flujo histórico). No null = evento de este ayudante puntual (bloque 5).';

-- ---------------------------------------------------------------------------
-- 6. Extender el acceso: responsable O ayudante activo
-- ---------------------------------------------------------------------------

drop policy if exists work_orders_installer_read on public.work_orders;
create policy work_orders_installer_read on public.work_orders
  for select to authenticated
  using (
    (assigned_installer_id = auth.uid() or public.auth_is_order_helper(id))
    and public.company_is_active(company_id)
  );

drop policy if exists work_orders_installer_progress on public.work_orders;
create policy work_orders_installer_progress on public.work_orders
  for update to authenticated
  using (
    (assigned_installer_id = auth.uid() or public.auth_is_order_helper(id))
    and public.company_is_active(company_id)
  )
  with check (
    (assigned_installer_id = auth.uid() or public.auth_is_order_helper(id))
    and public.company_is_active(company_id)
  );

drop policy if exists order_incidents_installer_read on public.order_incidents;
create policy order_incidents_installer_read on public.order_incidents
  for select to authenticated
  using (
    public.company_is_active(company_id)
    and exists (
      select 1
      from public.work_orders w
      where w.id = order_id
        and w.company_id = order_incidents.company_id
        and (w.assigned_installer_id = auth.uid() or public.auth_is_order_helper(w.id))
    )
  );

drop policy if exists order_incidents_installer_insert on public.order_incidents;
create policy order_incidents_installer_insert on public.order_incidents
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.company_is_active(company_id)
    and exists (
      select 1
      from public.work_orders w
      where w.id = order_id
        and w.company_id = order_incidents.company_id
        and (w.assigned_installer_id = auth.uid() or public.auth_is_order_helper(w.id))
    )
  );

-- `installer_id` nulo (evento del responsable) usa el criterio de siempre;
-- no nulo (evento de un ayudante) sólo lo ve ese ayudante — nunca el de otro
-- integrante del mismo equipo (MULTIINST-R3.2).
drop policy if exists order_payment_events_installer_read on public.order_payment_events;
create policy order_payment_events_installer_read on public.order_payment_events
  for select to authenticated
  using (
    public.company_is_active(company_id)
    and (
      (
        installer_id is null
        and exists (
          select 1 from public.work_orders w
          where w.id = order_id
            and w.company_id = order_payment_events.company_id
            and w.assigned_installer_id = auth.uid()
        )
      )
      or installer_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Lo que ve el instalador de sus ganancias, con los ayudantes sumados
-- ---------------------------------------------------------------------------

-- La mitad del responsable filtra `assigned_installer_id = auth.uid()`
-- EXPLÍCITO, no confiado a la RLS de `work_orders` de fondo: desde este mismo
-- bloque, esa RLS también deja pasar a los AYUDANTES (necesitan leer la orden
-- para operarla), así que confiar sólo en la RLS filtraría por "quién puede
-- ver la orden", no por "de quién es este monto" — y le mostraría a un
-- ayudante el monto del responsable con sólo poder leer la fila.
drop view public.installer_earnings;
create view public.installer_earnings
with (security_invoker = true) as
select
  w.id                        as order_id,
  w.order_number,
  w.company_id,
  w.project_id,
  w.site_id,
  w.title,
  w.status,
  w.assigned_installer_id     as installer_id,
  w.installer_amount          as amount,
  w.currency,
  w.payment_status,
  w.payment_status_changed_at,
  w.scheduled_date,
  w.finalized_at,
  w.created_at
from public.work_orders w
where w.assigned_installer_id = auth.uid()
union all
select
  w.id                        as order_id,
  w.order_number,
  w.company_id,
  w.project_id,
  w.site_id,
  w.title,
  w.status,
  m.installer_id,
  m.installer_amount          as amount,
  w.currency,
  m.payment_status,
  m.payment_status_changed_at,
  w.scheduled_date,
  w.finalized_at,
  w.created_at
from public.work_order_team_members m
join public.work_orders w on w.id = m.order_id
where m.status = 'active';

comment on view public.installer_earnings is
  'Órdenes vistas desde el instalador, responsable o ayudante: expone su propio installer_amount como «amount», NUNCA work_orders.amount ni el monto de otro integrante. Bloque 5.';

grant select on public.installer_earnings to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Reglas de transición: responsable O ayudante activo
-- ---------------------------------------------------------------------------

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
  v_is_helper boolean;
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

  -- Un responsable sigue siendo obligatorio (MULTIINST-R1.3/R6.2): tener sólo
  -- ayudantes, sin responsable, no alcanza para avanzar la orden.
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

  if v_role is not null then
    v_is_helper := auth.uid() is distinct from new.assigned_installer_id
      and public.auth_is_order_helper(new.id);
  else
    v_is_helper := false;
  end if;

  if new.status in ('en_camino', 'en_sitio') and v_role is not null then
    if auth.uid() is distinct from new.assigned_installer_id and not v_is_helper then
      raise exception 'Sólo un integrante del equipo puede marcar el traslado y la llegada';
    end if;
  end if;

  if new.status = 'en_revision' and v_role is not null then
    if v_role <> 'installer' and v_role <> 'coordinator' then
      raise exception 'Sólo un integrante del equipo puede enviar la orden a revisión';
    end if;
    if auth.uid() is distinct from new.assigned_installer_id and not v_is_helper then
      raise exception 'Sólo un integrante del equipo puede enviar la orden a revisión';
    end if;
  end if;

  if old.status = 'en_proceso' and new.status = 'en_revision' then
    v_min := public.order_min_photos(new.id);
    v_photos := public.order_photo_count(new.id);
    if v_photos < v_min then
      raise exception 'Faltan fotos para cerrar: hay % y el mínimo es %', v_photos, v_min;
    end if;
  end if;

  -- ADR-001 alcanza a todo el equipo, no sólo al responsable: quien ejecutó,
  -- con cualquiera de los dos roles, no aprueba ni reabre su propia entrega.
  if old.status in ('en_revision', 'finalizada')
     and new.status in ('finalizada', 'en_proceso')
     and auth.uid() is not null
     and (
       auth.uid() = old.assigned_installer_id
       or public.auth_is_order_helper(old.id)
     ) then
    raise exception 'No podés aprobar ni reabrir tu propia entrega';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Completitud del equipo
-- ---------------------------------------------------------------------------

alter table public.work_orders
  add column required_installers smallint not null default 1
    check (required_installers between 1 and 15);

comment on column public.work_orders.required_installers is
  'Cuántos instaladores necesita esta orden (responsable incluido). Default 1: no obliga a nadie a usar equipos. Bloque 5.';

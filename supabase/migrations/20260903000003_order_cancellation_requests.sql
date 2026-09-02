-- Fase 3 de confiabilidad: el instalador pide la baja de un trabajo.
--
-- Hasta ahora no podía: `cancelada` sólo la alcanzan gerente y coordinador, así
-- que un instalador que no puede ir sólo tenía el chat.
--
-- **Pedir la baja NO cancela la orden.** El trabajo sigue haciendo falta; lo
-- que cambia es quién lo hace. Aprobar un pedido desasigna al instalador y deja
-- la orden lista para reasignar, igual que cuando se da de baja por una
-- reprogramación. Cancelar la orden entera es otra decisión, y es del gerente.
--
-- **Dónde vive el cálculo de días hábiles.** `within_notice` decide si el
-- pedido se autoaprueba, así que es una decisión de seguridad: si la calculara
-- la aplicación y se la pasara a esta función, cualquiera podría llamar al RPC
-- diciendo "estoy en plazo" y saltearse la revisión. Por eso la cuenta la hace
-- el servidor, en SQL, leyendo `non_working_days` — la MISMA tabla que lee
-- `lib/domain/business-days.ts`.
--
-- El reparto queda así, y es a propósito:
--   * SQL       → autoridad. Lo que se guarda y lo que dispara consecuencias.
--   * TypeScript → vista previa. Lo que se le muestra al instalador antes de
--                  apretar, para que sepa en qué está por meterse.
-- Las dos leen el mismo calendario, así que no pueden discrepar en los datos;
-- si alguna vez discreparan en la cuenta, la que manda es la de acá.

create or replace function public.business_days_between(
  p_from date,
  p_to date,
  p_country text,
  p_company_id uuid default null
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  -- Días hábiles que hay entre las dos fechas, sin contar el día de inicio.
  -- Negativo si `p_to` quedó antes que `p_from`, para que quien llame pueda
  -- distinguir "faltan dos días" de "ya pasó".
  select coalesce(
    sign(p_to - p_from)::integer * count(*)::integer,
    0
  )
  from generate_series(
    least(p_from, p_to) + 1,
    greatest(p_from, p_to),
    interval '1 day'
  ) as d(day)
  where extract(isodow from d.day) < 6
    and not exists (
      select 1 from public.non_working_days n
      where n.day = d.day::date
        and n.country = p_country
        and (n.company_id is null or n.company_id = p_company_id)
    );
$$;

revoke all on function public.business_days_between(date, date, text, uuid) from public;
grant execute on function public.business_days_between(date, date, text, uuid) to authenticated;

comment on function public.business_days_between(date, date, text, uuid) is
  'Días hábiles entre dos fechas leyendo non_working_days. Es la autoridad para within_notice; lib/domain/business-days.ts hace el mismo cálculo sólo para vista previa.';

-- ---------------------------------------------------------------------------
-- El instalador pide la baja
-- ---------------------------------------------------------------------------

create or replace function public.request_order_cancellation(
  p_order_id uuid,
  p_reason_code text,
  p_reason_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.work_orders%rowtype;
  v_country text;
  v_today date;
  v_within boolean;
  v_status text;
  v_request_id uuid;
  v_installer_name text;
begin
  select * into v_order from public.work_orders w where w.id = p_order_id for update;
  if not found then raise exception 'Orden no encontrada'; end if;

  if v_order.assigned_installer_id is distinct from auth.uid() then
    raise exception 'Sólo el instalador asignado puede pedir la baja';
  end if;
  if v_order.status in ('finalizada', 'cancelada') then
    raise exception 'Esta orden ya está cerrada';
  end if;
  if exists (
    select 1 from public.order_cancellation_requests c
    where c.order_id = p_order_id and c.status = 'pending'
  ) then
    raise exception 'Ya hay un pedido de baja en revisión para esta orden';
  end if;

  select c.country into v_country
  from public.companies c where c.id = v_order.company_id;
  v_country := coalesce(v_country, 'AR');
  v_today := (now() at time zone
    case when v_country = 'BR' then 'America/Sao_Paulo'
         else 'America/Argentina/Buenos_Aires' end)::date;

  -- En plazo = avisar con al menos dos días hábiles de anticipación al inicio
  -- programado (DEC-07). Sin fecha comprometida no hay plazo que romper, así
  -- que se toma como en plazo: no hay agenda que reorganizar.
  v_within := v_order.scheduled_date is null or public.business_days_between(
    v_today, v_order.scheduled_date, v_country, v_order.company_id
  ) >= 2;

  -- Dentro del plazo el requisito es explícito: no penaliza y no hace falta
  -- revisar. Fuera del plazo va a revisión humana, nunca a penalización
  -- automática.
  v_status := case when v_within then 'auto_approved' else 'pending' end;

  insert into public.order_cancellation_requests (
    company_id, order_id, installer_id, reason_code, reason_note,
    scheduled_date_at_request, within_notice, calendar_country, status,
    reviewed_at
  ) values (
    v_order.company_id, p_order_id, auth.uid(),
    p_reason_code, btrim(coalesce(p_reason_note, '')),
    v_order.scheduled_date, v_within, v_country, v_status,
    null
  )
  returning id into v_request_id;

  -- Aprobada sola: se desvincula ya. La orden queda para reasignar.
  if v_within then
    update public.work_orders
    set assigned_installer_id = null, installer_accepted_at = null
    where id = p_order_id;
  end if;

  select pr.full_name into v_installer_name
  from public.profiles pr where pr.id = auth.uid();

  insert into public.notifications (user_id, type, title, body, data)
  select
    p.id,
    'cancellation_requested',
    case
      when p.locale = 'pt' and v_within then 'Instalador saiu do trabalho'
      when p.locale = 'pt' then 'Pedido de saída para revisar'
      when v_within then 'Un instalador se dio de baja'
      else 'Pedido de baja para revisar'
    end,
    coalesce(v_order.order_number, '') || ' · ' ||
    coalesce(v_installer_name,
      case when p.locale = 'pt' then 'O instalador' else 'El instalador' end) ||
    case
      when p.locale = 'pt' and v_within then ' avisou dentro do prazo.'
      when p.locale = 'pt' then ' pediu a saída fora do prazo.'
      when v_within then ' avisó dentro del plazo.'
      else ' pidió la baja fuera del plazo.'
    end,
    jsonb_build_object(
      'url',
      case
        when p.role = 'company_manager' and p.company_id = v_order.company_id
          then '/orders/' || p_order_id
        else '/coordination/' || p_order_id
      end,
      'order_id', p_order_id,
      'request_id', v_request_id,
      'installer_id', auth.uid(),
      'company_id', v_order.company_id,
      'within_notice', v_within,
      'locale', p.locale
    )
  from public.profiles p
  where (
    p.role = 'company_manager' and p.company_id = v_order.company_id
  ) or exists (
    select 1
    from public.projects pr
    join public.company_installers ci
      on ci.company_id = pr.company_id
     and ci.installer_id = pr.coordinator_id
     and ci.status = 'active'
    join public.company_membership_roles cmr
      on cmr.company_id = ci.company_id
     and cmr.user_id = ci.installer_id
     and cmr.role = 'coordinator'
    where pr.id = v_order.project_id
      and pr.company_id = v_order.company_id
      and p.id = pr.coordinator_id
  );

  return v_request_id;
end;
$$;

revoke all on function public.request_order_cancellation(uuid, text, text) from public;
grant execute on function public.request_order_cancellation(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- El gerente revisa lo que quedó pendiente
-- ---------------------------------------------------------------------------

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
as $$
declare
  v_req public.order_cancellation_requests%rowtype;
  v_order public.work_orders%rowtype;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decisión inválida';
  end if;

  select * into v_req from public.order_cancellation_requests c
  where c.id = p_request_id for update;
  if not found then raise exception 'Pedido no encontrado'; end if;

  -- Sólo el gerente. Es la decisión que puede afectar la confiabilidad de una
  -- persona; el coordinador ve el pedido pero no lo resuelve.
  if not (
    public.auth_role() = 'company_manager'
    and v_req.company_id = public.auth_company()
  ) then
    raise exception 'Sólo la empresa puede resolver un pedido de baja';
  end if;

  if v_req.status <> 'pending' then
    raise exception 'Este pedido ya fue resuelto';
  end if;

  update public.order_cancellation_requests
  set status = p_decision,
      justified = p_justified,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = left(btrim(coalesce(p_note, '')), 500)
  where id = p_request_id;

  -- Aprobar desvincula. Rechazar no cambia nada: el instalador sigue
  -- comprometido y la conversación sigue por el chat de la orden.
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
      'justified', p_justified,
      'locale', p.locale
    )
  from public.profiles p
  where p.id = v_req.installer_id;
end;
$$;

revoke all on function public.review_order_cancellation(uuid, text, boolean, text) from public;
grant execute on function public.review_order_cancellation(uuid, text, boolean, text) to authenticated;

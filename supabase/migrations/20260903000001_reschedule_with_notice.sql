-- Fase 1 de confiabilidad: reprogramar con aviso, en una sola transacción.
--
-- Hasta ahora `rescheduleOrder` sólo escribía la fecha nueva. El instalador se
-- enteraba cuando abría la app, y no quedaba constancia de cuándo se le avisó
-- — así que el plazo de dos días hábiles que pide el requisito no tenía de
-- dónde arrancar.
--
-- **Por qué es una función y no tres escrituras desde la aplicación.** Hay que
-- mover la fecha, registrar la reprogramación, crear la notificación y recién
-- entonces sellar `notified_at`. Hechas por separado, una falla en la tercera
-- dejaría al instalador con un plazo corriendo por un aviso que nunca recibió:
-- exactamente lo que el requisito prohíbe. Acá entra todo o no entra nada, y
-- `notified_at` se sella en la misma transacción que inserta la notificación,
-- así no puede existir uno sin la otra.
--
-- **Sin instalador asignado no hay a quién preguntarle.** La reprogramación se
-- registra igual, para el historial, pero queda sin notificar y sin plazo.
--
-- **Reprogramar de nuevo supersede la pregunta anterior.** Si la empresa vuelve
-- a mover la fecha antes de que conteste, castigarlo por no responder algo que
-- ya no es la fecha vigente sería injusto.

create or replace function public.reschedule_order_with_notice(
  p_order_id uuid,
  p_scheduled_date date,
  p_scheduled_end_date date default null,
  p_reason text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.work_orders%rowtype;
  v_country text;
  v_timezone text;
  v_reschedule_id uuid;
begin
  select * into v_order
  from public.work_orders w
  where w.id = p_order_id
  for update;
  if not found then raise exception 'Orden no encontrada'; end if;

  if not (
    (public.auth_role() = 'company_manager' and v_order.company_id = public.auth_company())
    or (
      v_order.company_id in (select public.auth_companies('coordinator'))
      and public.can_operate_project(v_order.project_id)
    )
  ) then
    raise exception 'No tenés permiso para reprogramar esta orden';
  end if;

  if v_order.status in ('finalizada', 'cancelada') then
    raise exception 'No se puede reprogramar una orden ya cerrada';
  end if;

  if p_scheduled_date is null then
    raise exception 'La reprogramación necesita una fecha';
  end if;
  if p_scheduled_end_date is not null and p_scheduled_end_date < p_scheduled_date then
    raise exception 'La fecha final no puede ser anterior al inicio';
  end if;

  -- Sin cambio real no hay nada que avisar, y avisar igual gastaría el plazo
  -- del instalador por una operación que no lo afecta.
  if v_order.scheduled_date is not distinct from p_scheduled_date
     and v_order.scheduled_end_date is not distinct from p_scheduled_end_date then
    raise exception 'La orden ya tiene esa fecha';
  end if;

  select c.country into v_country
  from public.companies c where c.id = v_order.company_id;
  v_timezone := case when v_country = 'BR'
    then 'America/Sao_Paulo'
    else 'America/Argentina/Buenos_Aires' end;

  -- La pregunta anterior deja de correr.
  update public.order_reschedules
  set superseded_at = now()
  where order_id = p_order_id
    and response is null
    and superseded_at is null;

  insert into public.order_reschedules (
    company_id, order_id, installer_id,
    previous_date, previous_end_date, new_date, new_end_date,
    reason, rescheduled_by, calendar_country, calendar_timezone
  ) values (
    v_order.company_id, p_order_id, v_order.assigned_installer_id,
    v_order.scheduled_date, v_order.scheduled_end_date,
    p_scheduled_date, p_scheduled_end_date,
    btrim(coalesce(p_reason, '')), auth.uid(), coalesce(v_country, 'AR'), v_timezone
  )
  returning id into v_reschedule_id;

  update public.work_orders
  set scheduled_date = p_scheduled_date,
      scheduled_end_date = p_scheduled_end_date
  where id = p_order_id;

  -- El aviso y su sello, juntos. Si el insert de la notificación fallara, la
  -- transacción entera se cae y `notified_at` no queda escrito: nunca hay un
  -- plazo corriendo sin aviso.
  if v_order.assigned_installer_id is not null then
    insert into public.notifications (user_id, type, title, body, data)
    select
      p.id,
      'order_rescheduled',
      case when p.locale = 'pt'
        then 'Seu trabalho foi reagendado'
        else 'Tu trabajo fue reprogramado' end,
      v_order.order_number || ' · ' ||
      case when p.locale = 'pt' then 'Nova data: ' else 'Nueva fecha: ' end ||
      to_char(p_scheduled_date, 'DD/MM/YYYY'),
      jsonb_build_object(
        'url', '/tasks/' || p_order_id,
        'order_id', p_order_id,
        'company_id', v_order.company_id,
        'reschedule_id', v_reschedule_id,
        'locale', p.locale
      )
    from public.profiles p
    where p.id = v_order.assigned_installer_id;

    update public.order_reschedules
    set notified_at = now()
    where id = v_reschedule_id;
  end if;

  return v_reschedule_id;
end;
$$;

revoke all on function public.reschedule_order_with_notice(uuid, date, date, text) from public;
grant execute on function public.reschedule_order_with_notice(uuid, date, date, text) to authenticated;

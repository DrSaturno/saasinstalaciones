-- Bloque 5 (multi-instalador): los avisos de la orden llegan a todo el equipo.
--
-- Hasta acá las notificaciones dirigidas al instalador de una orden salían sólo
-- para `assigned_installer_id`. Con ayudantes, quien también va a estar en el
-- sitio se enteraba de un cambio de fecha o de una devolución de la entrega
-- por otra persona, o no se enteraba.
--
-- Se extienden las DOS notificaciones que informan un cambio de la orden:
--   * reprogramación (`order_rescheduled`) y
--   * decisión sobre la entrega (`delivery_returned` / `delivery_approved`).
--
-- **Lo que NO cambia, a propósito.** La *pregunta* de la reprogramación
-- («¿seguís en este trabajo?»), su plazo de respuesta, el recordatorio
-- (`emit_reschedule_reminders`) y el vencimiento con penalización siguen siendo
-- del responsable: `order_reschedules.installer_id` es quien decide y quien
-- responde. Un ayudante se entera de la fecha nueva, pero no tiene nada que
-- contestar ni nada que pueda vencérsele. Tampoco se toca el aviso de baja
-- (`request_order_cancellation`): sólo lo pide el responsable.
--
-- Migración de expand: sólo `create or replace` de dos funciones; no cambia
-- ninguna firma ni ninguna tabla.

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
    where p.id = v_order.assigned_installer_id
       or p.id in (
         select m.installer_id
         from public.work_order_team_members m
         where m.order_id = p_order_id and m.status = 'active'
       );

    update public.order_reschedules
    set notified_at = now()
    where id = v_reschedule_id;
  end if;

  return v_reschedule_id;
end;
$$;

revoke all on function public.reschedule_order_with_notice(uuid, date, date, text) from public, anon;
grant execute on function public.reschedule_order_with_notice(uuid, date, date, text) to authenticated;

create or replace function public.notify_review_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.work_orders%rowtype;
  v_recipient record;
  v_reopened boolean;
begin
  -- Sólo los eventos de decisión: los escribe la empresa (`type = 'system'`),
  -- mueven el estado, y no los generó el propio instalador.
  if new.type <> 'system' or new.to_status is null or new.installer_id is not null then
    return new;
  end if;

  select * into v_order from public.work_orders w where w.id = new.order_id;
  if v_order.assigned_installer_id is null then
    return new;
  end if;

  v_reopened := new.to_status = 'en_proceso' and new.from_status in ('en_revision', 'finalizada');

  -- Responsable más ayudantes activos; nadie necesita que le avisen de su
  -- propia acción.
  for v_recipient in
    select p.id, coalesce(p.locale, 'es') as locale
    from public.profiles p
    where (
      p.id = v_order.assigned_installer_id
      or p.id in (
        select m.installer_id
        from public.work_order_team_members m
        where m.order_id = new.order_id and m.status = 'active'
      )
    )
      and p.id is distinct from new.created_by
  loop
    insert into public.notifications (user_id, type, title, body, data)
    values (
      v_recipient.id,
      case when v_reopened then 'delivery_returned' else 'delivery_approved' end,
      case
        when v_reopened and v_recipient.locale = 'pt'
          then 'Revisar ' || coalesce(v_order.order_number, 'uma ordem')
        when v_reopened
          then 'Revisar ' || coalesce(v_order.order_number, 'una orden')
        when v_recipient.locale = 'pt'
          then 'Trabalho aprovado: ' || coalesce(v_order.order_number, 'uma ordem')
        else 'Trabajo aprobado: ' || coalesce(v_order.order_number, 'una orden')
      end,
      -- El cuerpo es la nota del evento, que ya trae el motivo redactado por
      -- quien decidió: es lo que hay que leer para saber qué corregir.
      left(coalesce(nullif(new.note, ''),
        case when v_recipient.locale = 'pt' then 'A empresa revisou sua entrega.'
             else 'La empresa revisó tu entrega.' end), 180),
      jsonb_build_object(
        'url', '/tasks/' || new.order_id,
        'order_id', new.order_id,
        'update_id', new.id,
        'company_id', new.company_id,
        'from_status', new.from_status,
        'to_status', new.to_status,
        -- Que te devuelvan el trabajo pide atención; que te lo aprueben, no.
        'severity', case when v_reopened then 'warning' else 'info' end,
        'locale', v_recipient.locale
      )
    );
  end loop;

  return new;
end;
$$;

comment on function public.notify_review_decision() is
  'Avisa al responsable y a los ayudantes activos qué decidió la empresa sobre la entrega. En la base porque la RLS de notifications impide escribir en la bandeja ajena.';

-- Sumar a alguien al equipo le avisa igual que asignarle la orden.
--
-- `notify_order_assignment` sólo mira `work_orders.assigned_installer_id`, así
-- que un ayudante sumado no recibía ninguna notificación, y el push
-- `order_assigned` que la app dispara al sumarlo no tenía nada que entregar.
-- Va como trigger (y no en `add_order_team_member`) para cubrir también el caso
-- de reactivar a alguien que se había quitado.
create or replace function public.notify_team_member_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.work_orders%rowtype;
begin
  if new.status <> 'active' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'active' then
    return new;
  end if;

  select * into v_order from public.work_orders w where w.id = new.order_id;
  if not found then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, data)
  select
    p.id,
    'order_assigned',
    case when p.locale = 'pt' then 'Nova ordem atribuída' else 'Nueva orden asignada' end,
    v_order.order_number || ' · ' || v_order.title,
    jsonb_build_object(
      'url', '/tasks/' || v_order.id,
      'order_id', v_order.id,
      'company_id', v_order.company_id,
      'locale', p.locale
    )
  from public.profiles p
  where p.id = new.installer_id;

  return new;
end;
$$;

revoke all on function public.notify_team_member_added() from public, anon, authenticated;

drop trigger if exists work_order_team_members_notify_added on public.work_order_team_members;
create trigger work_order_team_members_notify_added
  after insert or update of status on public.work_order_team_members
  for each row execute function public.notify_team_member_added();

comment on function public.notify_team_member_added() is
  'Notificación in-app «Nueva orden asignada» para el ayudante que se suma (o se reactiva) en el equipo de una orden.';

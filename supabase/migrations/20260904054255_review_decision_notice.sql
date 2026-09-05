-- Punto 24, Fase 3: el instalador se entera de qué decidió el coordinador.
--
-- `REQ-14.6` pide que cada cambio de responsable genere una notificación
-- persistida. Hoy `notify_order_update` sólo avisa HACIA la empresa —arranca
-- con `if new.installer_id is null then return new`, y los eventos que escribe
-- el coordinador no llevan instalador—, así que el camino de vuelta no
-- existía: al instalador le reabrían el trabajo y se enteraba entrando a
-- mirar.
--
-- Va en la base y no en la Server Action porque la RLS de `notifications` es
-- `user_id = auth.uid()`: el coordinador no puede escribir en la bandeja de
-- otra persona, y está bien que no pueda.

create or replace function public.notify_review_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.work_orders%rowtype;
  v_locale text;
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

  -- Nadie necesita que le avisen de su propia acción.
  if new.created_by is not distinct from v_order.assigned_installer_id then
    return new;
  end if;

  select coalesce(p.locale, 'es') into v_locale
  from public.profiles p where p.id = v_order.assigned_installer_id;

  v_reopened := new.to_status = 'en_proceso' and new.from_status in ('en_revision', 'finalizada');

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_order.assigned_installer_id,
    case when v_reopened then 'delivery_returned' else 'delivery_approved' end,
    case
      when v_reopened and v_locale = 'pt'
        then 'Revisar ' || coalesce(v_order.order_number, 'uma ordem')
      when v_reopened
        then 'Revisar ' || coalesce(v_order.order_number, 'una orden')
      when v_locale = 'pt'
        then 'Trabalho aprovado: ' || coalesce(v_order.order_number, 'uma ordem')
      else 'Trabajo aprobado: ' || coalesce(v_order.order_number, 'una orden')
    end,
    -- El cuerpo es la nota del evento, que ya trae el motivo redactado por
    -- quien decidió. Es exactamente lo que el instalador necesita leer para
    -- saber qué corregir; resumirlo acá sería perderlo.
    left(coalesce(nullif(new.note, ''),
      case when v_locale = 'pt' then 'A empresa revisou sua entrega.'
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
      'locale', v_locale
    )
  );

  return new;
end;
$$;

drop trigger if exists order_updates_notify_review on public.order_updates;
create trigger order_updates_notify_review
  after insert on public.order_updates
  for each row execute function public.notify_review_decision();

comment on function public.notify_review_decision() is
  'Avisa al instalador asignado qué decidió la empresa sobre su entrega. En la base porque la RLS de notifications impide escribir en la bandeja ajena.';

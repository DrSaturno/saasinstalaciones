-- Fase 5 de confiabilidad: el recordatorio antes de que venza el plazo.
--
-- El requisito lo pide explícitamente: "el instalador deberá recibir
-- recordatorios o avisos cuando el plazo de respuesta esté próximo a vencer,
-- con el objetivo de evitar que una falta de respuesta involuntaria genere una
-- penalización".
--
-- **Por qué esto sí necesita un reloj y el vencimiento no.** El estado de una
-- reprogramación se deriva al leer, así que vence bien aunque nadie corra
-- nada. Un recordatorio, en cambio, tiene que llegar en un momento en que
-- nadie está mirando: eso no se puede derivar, hay que dispararlo.
--
-- **Y por eso las dos funciones son idempotentes.** `reminder_sent_at` acá y el
-- índice único por origen en los eventos. Correrlas dos veces no manda dos
-- avisos ni penaliza dos veces; no correrlas a horario no rompe nada, sólo
-- atrasa el aviso. La corrección nunca depende del scheduler.
--
-- **El agendado NO va en una migración.** `create extension pg_cron` en un
-- archivo de migración obligaría a CI a instalarlo en cada corrida desde cero.
-- Se agenda a mano en producción, una vez. Estas funciones son útiles igual:
-- se pueden llamar desde donde sea, y se prueban sin scheduler.

create or replace function public.emit_reschedule_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_row record;
  v_elapsed integer;
begin
  for v_row in
    select r.*, w.order_number, w.id as wo_id
    from public.order_reschedules r
    join public.work_orders w on w.id = r.order_id
    where r.notified_at is not null
      and r.response is null
      and r.superseded_at is null
      and r.reminder_sent_at is null
      and r.installer_id is not null
  loop
    -- Días hábiles transcurridos desde el aviso, con el calendario que quedó
    -- congelado en la propia fila.
    v_elapsed := public.business_days_between(
      (v_row.notified_at at time zone v_row.calendar_timezone)::date,
      (now() at time zone v_row.calendar_timezone)::date,
      v_row.calendar_country,
      v_row.company_id
    );

    -- Se avisa en el último día hábil del plazo: antes sería ruido, después
    -- ya no serviría para lo que el requisito quiere: evitar que se le pase.
    continue when v_elapsed < v_row.response_window_days - 1;
    continue when v_elapsed > v_row.response_window_days;

    insert into public.notifications (user_id, type, title, body, data)
    select
      p.id,
      'reschedule_reminder',
      case when p.locale = 'pt'
        then 'Seu prazo para responder está terminando'
        else 'Se te vence el plazo para contestar' end,
      coalesce(v_row.order_number, '') || ' · ' ||
      case when p.locale = 'pt'
        then 'Confirme se continua neste trabalho.'
        else 'Confirmá si seguís en este trabajo.' end,
      jsonb_build_object(
        'url', '/tasks/' || v_row.order_id,
        'order_id', v_row.order_id,
        'reschedule_id', v_row.id,
        'company_id', v_row.company_id,
        'locale', p.locale
      )
    from public.profiles p
    where p.id = v_row.installer_id;

    update public.order_reschedules
    set reminder_sent_at = now()
    where id = v_row.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.emit_reschedule_reminders() from public;

comment on function public.emit_reschedule_reminders() is
  'Recordatorio en el último día hábil del plazo. Idempotente por reminder_sent_at: correrla dos veces no manda dos avisos. No correrla a horario atrasa el aviso pero no rompe el vencimiento, que se deriva.';

-- Una sola entrada para el agendado, así el cron tiene una línea y no dos que
-- puedan quedar desincronizadas.
create or replace function public.run_reliability_jobs()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'reminders', public.emit_reschedule_reminders(),
    'timeouts', public.emit_reschedule_timeouts(),
    'ran_at', now()
  );
$$;

revoke all on function public.run_reliability_jobs() from public;

comment on function public.run_reliability_jobs() is
  'Punto de entrada del agendado. Se llama desde pg_cron en producción; NO se instala la extensión desde una migración para que CI no tenga que levantarla en cada corrida desde cero.';

-- Fase 5: los avisos agendados.
--
-- Todo este archivo existe para probar una sola propiedad: **el scheduler no
-- puede cambiar el resultado.**
--
-- Correr los jobs dos veces no manda dos recordatorios ni penaliza dos veces;
-- no correrlos a horario atrasa el aviso pero no rompe el vencimiento, que se
-- deriva al leer. Por eso el test corre `run_reliability_jobs()` DOS veces y
-- después cuenta: si la idempotencia se rompiera, los números se duplicarían.
--
-- Y prueba la ventana del recordatorio, que es la parte fácil de arruinar:
-- avisar demasiado pronto es ruido, y avisar después del vencimiento no sirve
-- para lo que el requisito quiere — evitar que a alguien se le pase el plazo
-- sin darse cuenta.

-- NOTA SOBRE LAS FECHAS: se usa el día en hora de Buenos Aires y NO
-- `current_date`, que es UTC.
--
-- Las funciones del módulo calculan "hoy" con `now() at time zone <tz>`, así
-- que un fixture armado sobre `current_date` coincide sólo mientras el test
-- corra de día en Argentina. Entre las 00:00 y las 03:00 UTC las dos fechas
-- difieren en un día, y una orden pensada como "fuera de plazo" queda dentro.
-- CI lo destapó corriendo a la 01:04 UTC.

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

insert into public.companies (id, name, country, order_prefix)
values ('c5000000-0000-0000-0000-000000000001', 'Empresa Fase5', 'AR', 'EF5');

insert into auth.users (id, email, raw_user_meta_data) values
  ('c5000000-0000-0000-0000-000000000011', 'gerente.f5@test.dev',
   '{"role":"company_manager","company_id":"c5000000-0000-0000-0000-000000000001"}'::jsonb),
  ('c5000000-0000-0000-0000-000000000012', 'instalador.f5@test.dev',
   '{"role":"installer"}'::jsonb);

insert into public.installers (id, zones)
values ('c5000000-0000-0000-0000-000000000012', array['AR-BA-AMBA'])
on conflict (id) do nothing;

insert into public.company_installers (company_id, installer_id, role, status, joined_at)
values ('c5000000-0000-0000-0000-000000000001',
        'c5000000-0000-0000-0000-000000000012', 'installer', 'active', now());

insert into public.projects (id, company_id, name)
values ('c5000000-0000-0000-0000-000000000021',
        'c5000000-0000-0000-0000-000000000001', 'Proyecto Fase5');

insert into public.sites (id, project_id, company_id, name)
values ('c5000000-0000-0000-0000-000000000031',
        'c5000000-0000-0000-0000-000000000021',
        'c5000000-0000-0000-0000-000000000001', 'Punto Fase5');

insert into public.work_orders (
  id, company_id, project_id, site_id, order_number, title,
  assigned_installer_id, scheduled_date, status
)
select
  ('c5000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  'c5000000-0000-0000-0000-000000000001',
  'c5000000-0000-0000-0000-000000000021',
  'c5000000-0000-0000-0000-000000000031',
  'EF5-' || n, 'Orden ' || n,
  'c5000000-0000-0000-0000-000000000012', ((now() at time zone 'America/Argentina/Buenos_Aires')::date + 60), 'planificada'
from generate_series(41, 44) as n;

-- Tres avisos con distinta antigüedad en días HÁBILES.
--
-- Las fechas de los avisos NO se calculan restando N días del calendario: si el
-- test corriera un sábado, "ayer" sería viernes y la antigüedad en días hábiles
-- daría 0 en vez de 1, y el test fallaría por el día de la semana en que corrió.
-- En vez de eso se busca la fecha cuya distancia en días HÁBILES hasta hoy es
-- exactamente la que se quiere, usando la misma función que después se prueba.
-- Se autoajusta.
insert into public.order_reschedules (
  id, company_id, order_id, installer_id, new_date,
  calendar_country, calendar_timezone, notified_at
) values
  -- 0 días hábiles: recién avisado.
  ('c5000000-0000-0000-0000-00000000005a', 'c5000000-0000-0000-0000-000000000001',
   'c5000000-0000-0000-0000-000000000041', 'c5000000-0000-0000-0000-000000000012',
   ((now() at time zone 'America/Argentina/Buenos_Aires')::date + 60), 'AR', 'America/Argentina/Buenos_Aires',
   ((now() at time zone 'America/Argentina/Buenos_Aires')::date::timestamptz + interval '12 hours')),
  -- 1 día hábil: penúltimo día del plazo.
  ('c5000000-0000-0000-0000-00000000005b', 'c5000000-0000-0000-0000-000000000001',
   'c5000000-0000-0000-0000-000000000042', 'c5000000-0000-0000-0000-000000000012',
   ((now() at time zone 'America/Argentina/Buenos_Aires')::date + 60), 'AR', 'America/Argentina/Buenos_Aires',
   ((select max(d)::date from generate_series((now() at time zone 'America/Argentina/Buenos_Aires')::date - 20, (now() at time zone 'America/Argentina/Buenos_Aires')::date, interval '1 day') d
     where public.business_days_between(d::date, (now() at time zone 'America/Argentina/Buenos_Aires')::date, 'AR', null) = 1)::timestamptz
    + interval '12 hours')),
  -- 5 días hábiles: el plazo ya venció.
  ('c5000000-0000-0000-0000-00000000005d', 'c5000000-0000-0000-0000-000000000001',
   'c5000000-0000-0000-0000-000000000044', 'c5000000-0000-0000-0000-000000000012',
   ((now() at time zone 'America/Argentina/Buenos_Aires')::date + 60), 'AR', 'America/Argentina/Buenos_Aires',
   ((select max(d)::date from generate_series((now() at time zone 'America/Argentina/Buenos_Aires')::date - 20, (now() at time zone 'America/Argentina/Buenos_Aires')::date, interval '1 day') d
     where public.business_days_between(d::date, (now() at time zone 'America/Argentina/Buenos_Aires')::date, 'AR', null) = 5)::timestamptz
    + interval '12 hours'));

-- ---------------------------------------------------------------------------
-- El cálculo de antigüedad, que es de lo que dependen las dos ventanas
-- ---------------------------------------------------------------------------

select is(
  public.business_days_between(
    (select (notified_at at time zone calendar_timezone)::date
     from public.order_reschedules where id = 'c5000000-0000-0000-0000-00000000005a'),
    (now() at time zone 'America/Argentina/Buenos_Aires')::date,
    'AR', 'c5000000-0000-0000-0000-000000000001'
  ),
  0,
  'el aviso de hoy tiene cero días hábiles de antigüedad'
);

-- ---------------------------------------------------------------------------
-- Primera corrida
-- ---------------------------------------------------------------------------

select lives_ok(
  $q$select public.run_reliability_jobs()$q$,
  'los jobs corren'
);

select is(
  (
    select reminder_sent_at is null from public.order_reschedules
    where id = 'c5000000-0000-0000-0000-00000000005a'
  ),
  true,
  'al recién avisado no se le manda un recordatorio: sería ruido'
);

select is(
  (
    select reminder_sent_at is not null from public.order_reschedules
    where id = 'c5000000-0000-0000-0000-00000000005b'
  ),
  true,
  'al que está por vencer sí: es justo lo que el requisito pide'
);

select is(
  (
    select reminder_sent_at is null from public.order_reschedules
    where id = 'c5000000-0000-0000-0000-00000000005d'
  ),
  true,
  'y al que ya venció no: un recordatorio tarde no evita nada'
);

select is(
  (
    select count(*)::integer from public.installer_reliability_events
    where kind = 'reschedule_no_response'
  ),
  1,
  'el silencio vencido sí emite su evento, y sólo ése'
);

select is(
  (
    select source_id from public.installer_reliability_events
    where kind = 'reschedule_no_response'
  ),
  'c5000000-0000-0000-0000-00000000005d'::uuid,
  'y es el de la reprogramación que efectivamente venció'
);

-- ---------------------------------------------------------------------------
-- Segunda corrida: el scheduler no puede cambiar el resultado
-- ---------------------------------------------------------------------------

select lives_ok(
  $q$select public.run_reliability_jobs()$q$,
  'los jobs vuelven a correr, como pasaría con un reintento'
);

select is(
  (
    select
      (select count(*) from public.notifications where type = 'reschedule_reminder')::integer
      + (select count(*) from public.installer_reliability_events
         where kind = 'reschedule_no_response')::integer
  ),
  2,
  'y no se duplica nada: un recordatorio y un evento, como en la primera'
);

select * from finish();

rollback;

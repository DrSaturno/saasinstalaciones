-- Fase 3: el instalador pide la baja de un trabajo.
--
-- Las tres reglas que este archivo fija:
--
--   1. **Dentro del plazo no hay revisión.** El requisito es explícito: pedir
--      la baja con dos días hábiles de anticipación no penaliza. Así que se
--      autoaprueba y desvincula en el acto, sin pasar por nadie.
--   2. **Fuera del plazo tampoco hay penalización automática**, hay una
--      persona decidiendo. Queda `pending` y el instalador sigue asignado
--      hasta que el gerente resuelva.
--   3. **El cálculo del plazo lo hace el servidor.** `within_notice` dispara
--      la autoaprobación, así que si lo mandara el cliente cualquiera podría
--      saltearse la revisión. Por eso `request_order_cancellation` no lo
--      recibe: lo calcula con `business_days_between`.
--
-- Pedir la baja NO cancela la orden: el trabajo sigue haciendo falta, cambia
-- quién lo hace.

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

select plan(17);

insert into public.companies (id, name, country, order_prefix)
values ('a2000000-0000-0000-0000-000000000001', 'Empresa Fase3', 'AR', 'EF3');

insert into auth.users (id, email, raw_user_meta_data) values
  ('a2000000-0000-0000-0000-000000000011', 'gerente.f3@test.dev',
   '{"role":"company_manager","company_id":"a2000000-0000-0000-0000-000000000001"}'::jsonb),
  ('a2000000-0000-0000-0000-000000000012', 'instalador.f3@test.dev',
   '{"role":"installer"}'::jsonb),
  ('a2000000-0000-0000-0000-000000000013', 'otro.f3@test.dev',
   '{"role":"installer"}'::jsonb);

insert into public.installers (id, zones) values
  ('a2000000-0000-0000-0000-000000000012', array['AR-BA-AMBA']),
  ('a2000000-0000-0000-0000-000000000013', array['AR-BA-AMBA'])
on conflict (id) do nothing;

insert into public.company_installers (company_id, installer_id, role, status, joined_at)
values
  ('a2000000-0000-0000-0000-000000000001',
   'a2000000-0000-0000-0000-000000000012', 'installer', 'active', now()),
  ('a2000000-0000-0000-0000-000000000001',
   'a2000000-0000-0000-0000-000000000013', 'installer', 'active', now());

insert into public.projects (id, company_id, name)
values ('a2000000-0000-0000-0000-000000000021',
        'a2000000-0000-0000-0000-000000000001', 'Proyecto Fase3');

insert into public.sites (id, project_id, company_id, name)
values ('a2000000-0000-0000-0000-000000000031',
        'a2000000-0000-0000-0000-000000000021',
        'a2000000-0000-0000-0000-000000000001', 'Punto Fase3');

-- Las fechas se calculan contra hoy para que el test no caduque: una bien
-- adelante (en plazo) y una mañana (fuera de plazo).
insert into public.work_orders (
  id, company_id, project_id, site_id, order_number, title,
  assigned_installer_id, installer_accepted_at, scheduled_date, status
) values
  ('a2000000-0000-0000-0000-000000000041', 'a2000000-0000-0000-0000-000000000001',
   'a2000000-0000-0000-0000-000000000021', 'a2000000-0000-0000-0000-000000000031',
   'EF3-0001', 'En plazo',
   'a2000000-0000-0000-0000-000000000012', now(),
   ((now() at time zone 'America/Argentina/Buenos_Aires')::date + 40), 'planificada'),
  ('a2000000-0000-0000-0000-000000000042', 'a2000000-0000-0000-0000-000000000001',
   'a2000000-0000-0000-0000-000000000021', 'a2000000-0000-0000-0000-000000000031',
   'EF3-0002', 'Fuera de plazo',
   'a2000000-0000-0000-0000-000000000012', now(),
   ((now() at time zone 'America/Argentina/Buenos_Aires')::date + 1), 'planificada'),
  ('a2000000-0000-0000-0000-000000000043', 'a2000000-0000-0000-0000-000000000001',
   'a2000000-0000-0000-0000-000000000021', 'a2000000-0000-0000-0000-000000000031',
   'EF3-0003', 'Para rechazar',
   'a2000000-0000-0000-0000-000000000012', now(),
   ((now() at time zone 'America/Argentina/Buenos_Aires')::date + 1), 'planificada');

-- ---------------------------------------------------------------------------
-- El cálculo de días hábiles, que es la autoridad
-- ---------------------------------------------------------------------------

select is(
  public.business_days_between(date '2026-09-01', date '2026-09-03', 'AR', null),
  2,
  'de martes a jueves hay dos días hábiles'
);

select is(
  public.business_days_between(date '2026-08-14', date '2026-08-18', 'AR', null),
  1,
  'y el feriado del 17/08 no se cuenta: sale del calendario, no de una constante'
);

select is(
  public.business_days_between(date '2026-11-19', date '2026-11-20', 'AR', null),
  1,
  'el 20/11/2026 sí se cuenta: ese año el feriado se trasladó al lunes 23'
);

-- ---------------------------------------------------------------------------
-- Quién puede pedir la baja
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"a2000000-0000-0000-0000-000000000013","role":"authenticated"}';

select throws_ok(
  $q$select public.request_order_cancellation(
      'a2000000-0000-0000-0000-000000000041', 'health', 'no es mi trabajo')$q$,
  'P0001',
  null,
  'quien no está asignado no puede pedir la baja de una orden ajena'
);

-- ---------------------------------------------------------------------------
-- En plazo: se aprueba sola
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"a2000000-0000-0000-0000-000000000012","role":"authenticated"}';

select lives_ok(
  $q$select public.request_order_cancellation(
      'a2000000-0000-0000-0000-000000000041', 'schedule_conflict', 'me superpone')$q$,
  'el instalador pide la baja con anticipación'
);

reset role;

select is(
  (
    select status from public.order_cancellation_requests
    where order_id = 'a2000000-0000-0000-0000-000000000041'
  ),
  'auto_approved',
  'dentro del plazo no va a revisión: el requisito dice que no penaliza'
);

select is(
  (
    select within_notice from public.order_cancellation_requests
    where order_id = 'a2000000-0000-0000-0000-000000000041'
  ),
  true,
  'y queda registrado que estaba en plazo, calculado por el servidor'
);

select is(
  (
    select assigned_installer_id from public.work_orders
    where id = 'a2000000-0000-0000-0000-000000000041'
  ),
  null,
  'se desvincula en el acto: la orden queda para reasignar'
);

select is(
  (
    select status from public.work_orders
    where id = 'a2000000-0000-0000-0000-000000000041'
  ),
  'planificada',
  'pero la orden NO se cancela: el trabajo sigue haciendo falta'
);

select isnt(
  (
    select scheduled_date_at_request from public.order_cancellation_requests
    where order_id = 'a2000000-0000-0000-0000-000000000041'
  ),
  null,
  'y se guarda la fecha que tenía la orden en ese momento'
);

-- ---------------------------------------------------------------------------
-- Fuera de plazo: queda para que decida una persona
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"a2000000-0000-0000-0000-000000000012","role":"authenticated"}';

select lives_ok(
  $q$select public.request_order_cancellation(
      'a2000000-0000-0000-0000-000000000042', 'health', 'me operan mañana')$q$,
  'el instalador pide la baja sobre la hora'
);

select throws_ok(
  $q$select public.request_order_cancellation(
      'a2000000-0000-0000-0000-000000000042', 'other', 'de nuevo')$q$,
  'P0001',
  null,
  'no puede acumular dos pedidos abiertos sobre la misma orden'
);

reset role;

select is(
  (
    select status from public.order_cancellation_requests
    where order_id = 'a2000000-0000-0000-0000-000000000042'
  ),
  'pending',
  'fuera de plazo queda pendiente: nunca se penaliza automáticamente'
);

select is(
  (
    select assigned_installer_id from public.work_orders
    where id = 'a2000000-0000-0000-0000-000000000042'
  ),
  'a2000000-0000-0000-0000-000000000012'::uuid,
  'y sigue asignado hasta que alguien decida'
);

-- ---------------------------------------------------------------------------
-- La revisión es del gerente
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"a2000000-0000-0000-0000-000000000012","role":"authenticated"}';

select throws_ok(
  $q$select public.review_order_cancellation(
      (select id from public.order_cancellation_requests
       where order_id = 'a2000000-0000-0000-0000-000000000042'),
      'approved', true, 'me apruebo solo')$q$,
  'P0001',
  null,
  'el instalador no resuelve su propio pedido'
);

set local request.jwt.claims to
  '{"sub":"a2000000-0000-0000-0000-000000000011","role":"authenticated"}';

select lives_ok(
  $q$select public.review_order_cancellation(
      (select id from public.order_cancellation_requests
       where order_id = 'a2000000-0000-0000-0000-000000000042'),
      'approved', true, 'Presentó certificado médico')$q$,
  'el gerente aprueba y deja constancia de que la considera justificada'
);

reset role;

select is(
  (
    select assigned_installer_id from public.work_orders
    where id = 'a2000000-0000-0000-0000-000000000042'
  ),
  null,
  'aprobar desvincula'
);

select * from finish();

rollback;

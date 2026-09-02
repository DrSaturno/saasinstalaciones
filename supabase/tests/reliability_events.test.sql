-- Fase 4: los eventos de confiabilidad.
--
-- Lo que este archivo protege:
--
--   1. **Los eventos salen del flujo real, no de una escritura a mano.** No hay
--      política de escritura sobre la tabla: los emiten los triggers. Si
--      alguien agregara una, cualquiera podría inventarle un incumplimiento a
--      otro.
--   2. **Un hecho, un evento.** El índice único por origen hace la emisión
--      idempotente, que es lo que después permite que el job de vencimientos
--      corra dos veces sin castigar dos veces.
--   3. **Aprobada y justificada NO es lo mismo que aprobada a secas.** Es la
--      razón de ser de la revisión humana; si las dos emitieran `cancel_late`,
--      revisar no serviría para nada.
--   4. **Nada se borra: se revierte, con motivo y con autor.**

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

select plan(16);

insert into public.companies (id, name, country, order_prefix) values
  ('c4000000-0000-0000-0000-000000000001', 'Empresa F4', 'AR', 'EF4'),
  ('c4000000-0000-0000-0000-000000000002', 'Empresa Vecina F4', 'AR', 'EV4');

insert into auth.users (id, email, raw_user_meta_data) values
  ('c4000000-0000-0000-0000-000000000011', 'gerente.f4@test.dev',
   '{"role":"company_manager","company_id":"c4000000-0000-0000-0000-000000000001"}'::jsonb),
  ('c4000000-0000-0000-0000-000000000014', 'gerente.vecina@test.dev',
   '{"role":"company_manager","company_id":"c4000000-0000-0000-0000-000000000002"}'::jsonb),
  ('c4000000-0000-0000-0000-000000000012', 'instalador.f4@test.dev',
   '{"role":"installer"}'::jsonb),
  ('c4000000-0000-0000-0000-000000000013', 'otro.f4@test.dev',
   '{"role":"installer"}'::jsonb);

insert into public.installers (id, zones) values
  ('c4000000-0000-0000-0000-000000000012', array['AR-BA-AMBA']),
  ('c4000000-0000-0000-0000-000000000013', array['AR-BA-AMBA'])
on conflict (id) do nothing;

insert into public.company_installers (company_id, installer_id, role, status, joined_at)
values
  ('c4000000-0000-0000-0000-000000000001',
   'c4000000-0000-0000-0000-000000000012', 'installer', 'active', now()),
  ('c4000000-0000-0000-0000-000000000001',
   'c4000000-0000-0000-0000-000000000013', 'installer', 'active', now());

insert into public.projects (id, company_id, name)
values ('c4000000-0000-0000-0000-000000000021',
        'c4000000-0000-0000-0000-000000000001', 'Proyecto F4');

insert into public.sites (id, project_id, company_id, name)
values ('c4000000-0000-0000-0000-000000000031',
        'c4000000-0000-0000-0000-000000000021',
        'c4000000-0000-0000-0000-000000000001', 'Punto F4');

insert into public.work_orders (
  id, company_id, project_id, site_id, order_number, title,
  assigned_installer_id, scheduled_date, status
) values
  ('c4000000-0000-0000-0000-00000000004a', 'c4000000-0000-0000-0000-000000000001',
   'c4000000-0000-0000-0000-000000000021', 'c4000000-0000-0000-0000-000000000031',
   'EF4-A', 'Aceptar y completar',
   'c4000000-0000-0000-0000-000000000012', ((now() at time zone 'America/Argentina/Buenos_Aires')::date + 30), 'planificada'),
  ('c4000000-0000-0000-0000-00000000004b', 'c4000000-0000-0000-0000-000000000001',
   'c4000000-0000-0000-0000-000000000021', 'c4000000-0000-0000-0000-000000000031',
   'EF4-B', 'Baja fuera de plazo',
   'c4000000-0000-0000-0000-000000000012', ((now() at time zone 'America/Argentina/Buenos_Aires')::date + 1), 'planificada');

-- ---------------------------------------------------------------------------
-- Los hechos salen del ciclo de vida de la orden
-- ---------------------------------------------------------------------------

update public.work_orders set installer_accepted_at = now()
where id = 'c4000000-0000-0000-0000-00000000004a';

select is(
  (
    select count(*)::integer from public.installer_reliability_events
    where kind = 'order_accepted'
      and order_id = 'c4000000-0000-0000-0000-00000000004a'
  ),
  1,
  'aceptar la orden emite el hecho'
);

-- Repetir el update no puede volver a emitir: de eso depende que el job de
-- vencimientos pueda correr dos veces sin castigar dos veces.
update public.work_orders set installer_accepted_at = now()
where id = 'c4000000-0000-0000-0000-00000000004a';

select is(
  (
    select count(*)::integer from public.installer_reliability_events
    where kind = 'order_accepted'
      and order_id = 'c4000000-0000-0000-0000-00000000004a'
  ),
  1,
  'y no lo duplica si el update se repite'
);

update public.work_orders set status = 'en_proceso'
where id = 'c4000000-0000-0000-0000-00000000004a';
update public.work_orders set status = 'en_revision'
where id = 'c4000000-0000-0000-0000-00000000004a';
update public.work_orders set status = 'finalizada'
where id = 'c4000000-0000-0000-0000-00000000004a';

select is(
  (
    select count(*)::integer from public.installer_reliability_events
    where kind = 'order_completed'
  ),
  1,
  'completar emite su propio hecho'
);

-- ---------------------------------------------------------------------------
-- Fuera de plazo: nada se emite hasta que una persona decide
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"c4000000-0000-0000-0000-000000000012","role":"authenticated"}';

select public.request_order_cancellation(
  'c4000000-0000-0000-0000-00000000004b', 'health', 'me operan mañana');

reset role;

select is(
  (
    select count(*)::integer from public.installer_reliability_events
    where kind in ('cancel_late', 'cancel_in_notice', 'cancel_justified')
  ),
  0,
  'un pedido PENDIENTE no emite nada: nunca hay penalización automática'
);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"c4000000-0000-0000-0000-000000000011","role":"authenticated"}';

select public.review_order_cancellation(
  (select id from public.order_cancellation_requests
   where order_id = 'c4000000-0000-0000-0000-00000000004b'),
  'approved', true, 'Presentó certificado');

reset role;

select is(
  (
    select count(*)::integer from public.installer_reliability_events
    where kind = 'cancel_justified'
  ),
  1,
  'aprobada y justificada emite cancel_justified'
);

select is(
  (
    select count(*)::integer from public.installer_reliability_events
    where kind = 'cancel_late'
  ),
  0,
  'y NO emite cancel_late: si fueran lo mismo, revisar no serviría de nada'
);

select is(
  public.emit_reschedule_timeouts(),
  0,
  'sin reprogramaciones vencidas no se emite ningún silencio'
);

-- ---------------------------------------------------------------------------
-- Quién ve qué
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"c4000000-0000-0000-0000-000000000012","role":"authenticated"}';

select is(
  (select count(*)::integer from public.installer_reliability_events),
  3,
  'el instalador ve sus propios eventos: el requisito pide transparencia'
);

select throws_ok(
  $q$insert into public.installer_reliability_events (installer_id, company_id, kind)
     values ('c4000000-0000-0000-0000-000000000012',
             'c4000000-0000-0000-0000-000000000001', 'order_completed')$q$,
  '42501',
  null,
  'nadie inventa un evento a mano: no hay política de escritura sobre la tabla'
);

set local request.jwt.claims to
  '{"sub":"c4000000-0000-0000-0000-000000000013","role":"authenticated"}';

select is(
  (select count(*)::integer from public.installer_reliability_events),
  0,
  'otro instalador no ve el historial ajeno'
);

set local request.jwt.claims to
  '{"sub":"c4000000-0000-0000-0000-000000000014","role":"authenticated"}';

select is(
  (select count(*)::integer from public.installer_reliability_events),
  0,
  'y una empresa ajena tampoco: ADR-011, nunca historial de otra operación'
);

-- ---------------------------------------------------------------------------
-- Reversa auditada
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"c4000000-0000-0000-0000-000000000012","role":"authenticated"}';

select throws_ok(
  $q$select public.revert_reliability_event(
      (select id from public.installer_reliability_events where kind = 'cancel_justified'),
      'me conviene')$q$,
  'P0001',
  null,
  'el instalador no revierte sus propios eventos'
);

set local request.jwt.claims to
  '{"sub":"c4000000-0000-0000-0000-000000000011","role":"authenticated"}';

select throws_ok(
  $q$select public.revert_reliability_event(
      (select id from public.installer_reliability_events where kind = 'cancel_justified'),
      '   ')$q$,
  'P0001',
  null,
  'una reversa sin motivo se rechaza: la auditoría es el punto'
);

select lives_ok(
  $q$select public.revert_reliability_event(
      (select id from public.installer_reliability_events where kind = 'cancel_justified'),
      'Se cargó por error')$q$,
  'el gerente revierte dejando constancia'
);

select throws_ok(
  $q$select public.revert_reliability_event(
      (select id from public.installer_reliability_events where kind = 'cancel_justified'),
      'de nuevo')$q$,
  'P0001',
  null,
  'y no se puede revertir dos veces'
);

reset role;

select is(
  (
    select count(*)::integer from public.installer_reliability_events
    where kind = 'cancel_justified' and reverted_at is not null
  ),
  1,
  'el evento revertido sigue existiendo: se marca, no se borra'
);

select * from finish();

rollback;

-- Fase 2: el instalador contesta la reprogramación.
--
-- Las dos afirmaciones que más importan acá son opuestas entre sí, y por eso
-- conviene tenerlas juntas:
--
--   * Se rechaza responder lo que NO corresponde: por otro, sin aviso previo,
--     una pregunta ya superada, o dos veces.
--   * NO se rechaza responder tarde. El requisito no dice que una respuesta
--     fuera de plazo se descarte, dice que la FALTA de respuesta puede afectar
--     la confiabilidad. Si llegó en término se deriva de `responded_at` contra
--     el plazo, en el dominio, para no tener la regla de días hábiles escrita
--     dos veces.
--
-- Y darse de baja desvincula de verdad: desasigna la orden y avisa a la
-- empresa, que es el tiempo de reorganización que el plazo busca proteger.

begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

insert into public.companies (id, name, country, order_prefix)
values ('f1000000-0000-0000-0000-000000000001', 'Empresa Fase2', 'AR', 'EF2');

insert into auth.users (id, email, raw_user_meta_data) values
  ('f1000000-0000-0000-0000-000000000011', 'gerente.f2@test.dev',
   '{"role":"company_manager","company_id":"f1000000-0000-0000-0000-000000000001"}'::jsonb),
  ('f1000000-0000-0000-0000-000000000012', 'instalador.f2@test.dev',
   '{"role":"installer"}'::jsonb),
  ('f1000000-0000-0000-0000-000000000013', 'otro.f2@test.dev',
   '{"role":"installer"}'::jsonb);

insert into public.installers (id, zones) values
  ('f1000000-0000-0000-0000-000000000012', array['AR-BA-AMBA']),
  ('f1000000-0000-0000-0000-000000000013', array['AR-BA-AMBA'])
on conflict (id) do nothing;

insert into public.company_installers (company_id, installer_id, role, status, joined_at)
values
  ('f1000000-0000-0000-0000-000000000001',
   'f1000000-0000-0000-0000-000000000012', 'installer', 'active', now()),
  ('f1000000-0000-0000-0000-000000000001',
   'f1000000-0000-0000-0000-000000000013', 'installer', 'active', now());

insert into public.projects (id, company_id, name)
values ('f1000000-0000-0000-0000-000000000021',
        'f1000000-0000-0000-0000-000000000001', 'Proyecto Fase2');

insert into public.sites (id, project_id, company_id, name)
values ('f1000000-0000-0000-0000-000000000031',
        'f1000000-0000-0000-0000-000000000021',
        'f1000000-0000-0000-0000-000000000001', 'Punto Fase2');

-- Dos órdenes: una para aceptar, otra para darse de baja.
insert into public.work_orders (
  id, company_id, project_id, site_id, order_number, title,
  assigned_installer_id, installer_accepted_at, scheduled_date, status
) values
  ('f1000000-0000-0000-0000-000000000041', 'f1000000-0000-0000-0000-000000000001',
   'f1000000-0000-0000-0000-000000000021', 'f1000000-0000-0000-0000-000000000031',
   'EF2-0001', 'La que sigue',
   'f1000000-0000-0000-0000-000000000012', now(), '2026-08-25', 'planificada'),
  ('f1000000-0000-0000-0000-000000000042', 'f1000000-0000-0000-0000-000000000001',
   'f1000000-0000-0000-0000-000000000021', 'f1000000-0000-0000-0000-000000000031',
   'EF2-0002', 'La que se cae',
   'f1000000-0000-0000-0000-000000000012', now(), '2026-08-25', 'planificada'),
  ('f1000000-0000-0000-0000-000000000043', 'f1000000-0000-0000-0000-000000000001',
   'f1000000-0000-0000-0000-000000000021', 'f1000000-0000-0000-0000-000000000031',
   'EF2-0003', 'La que no se avisó',
   'f1000000-0000-0000-0000-000000000012', now(), '2026-08-25', 'planificada');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"f1000000-0000-0000-0000-000000000011","role":"authenticated"}';
select public.reschedule_order_with_notice(
  'f1000000-0000-0000-0000-000000000041', '2026-09-08', null, 'Cliente');
select public.reschedule_order_with_notice(
  'f1000000-0000-0000-0000-000000000042', '2026-09-08', null, 'Cliente');
reset role;

-- Una sin notificar, para probar la compuerta. Va sobre una orden que no tiene
-- ninguna reprogramación abierta: sobre las otras chocaría con el índice único
-- de "una sola pregunta abierta por orden".
insert into public.order_reschedules (
  id, company_id, order_id, installer_id, new_date, calendar_country
) values (
  'f1000000-0000-0000-0000-000000000051', 'f1000000-0000-0000-0000-000000000001',
  'f1000000-0000-0000-0000-000000000043',
  'f1000000-0000-0000-0000-000000000012', '2026-10-01', 'AR'
);

-- ---------------------------------------------------------------------------
-- Lo que no se puede responder
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"f1000000-0000-0000-0000-000000000013","role":"authenticated"}';

select throws_ok(
  $q$select public.respond_to_reschedule(
      (select id from public.order_reschedules
       where order_id = 'f1000000-0000-0000-0000-000000000041'
         and notified_at is not null),
      'accepted')$q$,
  'P0001',
  null,
  'otro instalador no puede contestar por el asignado'
);

set local request.jwt.claims to
  '{"sub":"f1000000-0000-0000-0000-000000000012","role":"authenticated"}';

select throws_ok(
  $q$select public.respond_to_reschedule(
      'f1000000-0000-0000-0000-000000000051', 'accepted')$q$,
  'P0001',
  null,
  'no se responde una reprogramación que nunca se notificó'
);

select throws_ok(
  $q$select public.respond_to_reschedule(
      (select id from public.order_reschedules
       where order_id = 'f1000000-0000-0000-0000-000000000041'
         and notified_at is not null),
      'quizas')$q$,
  'P0001',
  null,
  'la respuesta sólo puede ser aceptar o darse de baja'
);

-- ---------------------------------------------------------------------------
-- Aceptar: sigue en el trabajo
-- ---------------------------------------------------------------------------

select lives_ok(
  $q$select public.respond_to_reschedule(
      (select id from public.order_reschedules
       where order_id = 'f1000000-0000-0000-0000-000000000041'
         and notified_at is not null),
      'accepted')$q$,
  'el instalador confirma que sigue'
);

select throws_ok(
  $q$select public.respond_to_reschedule(
      (select id from public.order_reschedules
       where order_id = 'f1000000-0000-0000-0000-000000000041'
         and notified_at is not null),
      'declined')$q$,
  'P0001',
  null,
  'y no puede cambiar la respuesta después'
);

reset role;

select is(
  (
    select response from public.order_reschedules
    where order_id = 'f1000000-0000-0000-0000-000000000041'
      and notified_at is not null
  ),
  'accepted',
  'queda registrada la aceptación'
);

select isnt(
  (
    select responded_at from public.order_reschedules
    where order_id = 'f1000000-0000-0000-0000-000000000041'
      and notified_at is not null
  ),
  null,
  'con el momento en que contestó, que es lo que después dice si fue en término'
);

select is(
  (
    select assigned_installer_id from public.work_orders
    where id = 'f1000000-0000-0000-0000-000000000041'
  ),
  'f1000000-0000-0000-0000-000000000012'::uuid,
  'y sigue asignado: aceptar no cambia nada más'
);

-- ---------------------------------------------------------------------------
-- Darse de baja: se desvincula y la empresa se entera
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"f1000000-0000-0000-0000-000000000012","role":"authenticated"}';

select lives_ok(
  $q$select public.respond_to_reschedule(
      (select id from public.order_reschedules
       where order_id = 'f1000000-0000-0000-0000-000000000042'),
      'declined')$q$,
  'el instalador se da de baja por la fecha nueva'
);

reset role;

select is(
  (
    select assigned_installer_id from public.work_orders
    where id = 'f1000000-0000-0000-0000-000000000042'
  ),
  null,
  'la orden queda sin instalador, lista para reasignar'
);

select is(
  (
    select installer_accepted_at from public.work_orders
    where id = 'f1000000-0000-0000-0000-000000000042'
  ),
  null,
  'y sin la aceptación previa: ese compromiso ya no existe'
);

select is(
  (
    select status from public.work_orders
    where id = 'f1000000-0000-0000-0000-000000000042'
  ),
  'planificada',
  'el estado no se toca: cambiarlo es potestad de transitionOrder'
);

select is(
  (
    select count(*)::integer from public.notifications
    where type = 'reschedule_declined'
      and user_id = 'f1000000-0000-0000-0000-000000000011'
  ),
  1,
  'y la empresa se entera, que es el tiempo de reorganización que el plazo protege'
);

-- ---------------------------------------------------------------------------
-- Contestar tarde se acepta
-- ---------------------------------------------------------------------------

-- Se simula un aviso viejo: el plazo ya venció hace rato.
insert into public.order_reschedules (
  id, company_id, order_id, installer_id, new_date, calendar_country, notified_at
) values (
  'f1000000-0000-0000-0000-000000000052', 'f1000000-0000-0000-0000-000000000001',
  'f1000000-0000-0000-0000-000000000042',
  'f1000000-0000-0000-0000-000000000012', '2026-11-01', 'AR',
  now() - interval '30 days'
);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"f1000000-0000-0000-0000-000000000012","role":"authenticated"}';

select lives_ok(
  $q$select public.respond_to_reschedule(
      'f1000000-0000-0000-0000-000000000052', 'accepted')$q$,
  'una respuesta fuera de plazo se acepta igual: lo que penaliza es el silencio, no la demora'
);

reset role;

select * from finish();

rollback;

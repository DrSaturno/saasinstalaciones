-- Fase 1: la proyección entre actividades y órdenes.
--
-- El caso que justifica todo el archivo es **AC-07-A**: una orden cuyo único
-- trabajo es el relevamiento se cierra al aprobarse, sin pasar por
-- `planificada` ni `en_proceso`. Hasta esta fase eso era imposible — había que
-- inventarle una ejecución que nunca ocurrió.
--
-- El contraste con la orden COMBINADA es igual de importante y es fácil de
-- romper sin darse cuenta: ahí el relevamiento aprobado **habilita** la
-- ejecución, no termina la orden. Si alguien "simplifica" la proyección y saca
-- la distinción, las órdenes combinadas se cerrarían solas apenas se aprueba el
-- relevamiento, sin que nadie haya ido a hacer el trabajo.
--
-- Y se prueba que la compuerta `app.activity_sync` no quedó abierta: el
-- validador de transiciones tiene que seguir rechazando los saltos hechos a
-- mano, que es para lo que existe.

begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into public.companies (id, name, country, order_prefix)
values ('f6000000-0000-0000-0000-000000000001', 'Empresa Proyección', 'AR', 'EPR');

insert into auth.users (id, email, raw_user_meta_data) values
  ('f6000000-0000-0000-0000-000000000011', 'gerente.proj@test.dev',
   '{"role":"company_manager","company_id":"f6000000-0000-0000-0000-000000000001"}'::jsonb),
  ('f6000000-0000-0000-0000-000000000012', 'instalador.proj@test.dev',
   '{"role":"installer"}'::jsonb),
  ('f6000000-0000-0000-0000-000000000013', 'coordinador.proj@test.dev',
   '{"role":"installer"}'::jsonb);

insert into public.installers (id, zones) values
  ('f6000000-0000-0000-0000-000000000012', array['AR-BA-AMBA']),
  ('f6000000-0000-0000-0000-000000000013', array['AR-BA-AMBA'])
on conflict (id) do nothing;

insert into public.company_installers (company_id, installer_id, role, status, joined_at)
values
  ('f6000000-0000-0000-0000-000000000001',
   'f6000000-0000-0000-0000-000000000012', 'installer', 'active', now()),
  ('f6000000-0000-0000-0000-000000000001',
   'f6000000-0000-0000-0000-000000000013', 'coordinator', 'active', now());

insert into public.company_membership_roles (company_id, user_id, role) values
  ('f6000000-0000-0000-0000-000000000001',
   'f6000000-0000-0000-0000-000000000012', 'installer'),
  ('f6000000-0000-0000-0000-000000000001',
   'f6000000-0000-0000-0000-000000000013', 'coordinator')
on conflict do nothing;

insert into public.projects (id, company_id, name, coordinator_id)
values ('f6000000-0000-0000-0000-000000000021',
        'f6000000-0000-0000-0000-000000000001', 'Proyecto Proyección',
        'f6000000-0000-0000-0000-000000000013');

insert into public.sites (id, project_id, company_id, name)
values ('f6000000-0000-0000-0000-000000000031',
        'f6000000-0000-0000-0000-000000000021',
        'f6000000-0000-0000-0000-000000000001', 'Punto Proyección');

insert into public.work_orders (
  id, company_id, project_id, site_id, order_number, title,
  assigned_installer_id, status
) values
  ('f6000000-0000-0000-0000-0000000000aa', 'f6000000-0000-0000-0000-000000000001',
   'f6000000-0000-0000-0000-000000000021', 'f6000000-0000-0000-0000-000000000031',
   'EPR-SOLO', 'Sólo relevamiento',
   'f6000000-0000-0000-0000-000000000012', 'pendiente'),
  ('f6000000-0000-0000-0000-0000000000bb', 'f6000000-0000-0000-0000-000000000001',
   'f6000000-0000-0000-0000-000000000021', 'f6000000-0000-0000-0000-000000000031',
   'EPR-COMBI', 'Relevamiento y después ejecución',
   'f6000000-0000-0000-0000-000000000012', 'pendiente');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"f6000000-0000-0000-0000-000000000011","role":"authenticated"}';

select public.create_order_activities('f6000000-0000-0000-0000-0000000000aa', true, false);
select public.create_order_activities('f6000000-0000-0000-0000-0000000000bb', true, true);
select public.assign_activity(
  (select id from public.work_activities where work_order_id = 'f6000000-0000-0000-0000-0000000000aa'),
  'f6000000-0000-0000-0000-000000000012');
select public.assign_activity(
  (select id from public.work_activities
   where work_order_id = 'f6000000-0000-0000-0000-0000000000bb' and activity_type = 'survey'),
  'f6000000-0000-0000-0000-000000000012');

set local request.jwt.claims to
  '{"sub":"f6000000-0000-0000-0000-000000000012","role":"authenticated"}';
select public.submit_survey_submission(
  (select id from public.work_activities where work_order_id = 'f6000000-0000-0000-0000-0000000000aa'),
  '{"solo":1}'::jsonb);
select public.submit_survey_submission(
  (select id from public.work_activities
   where work_order_id = 'f6000000-0000-0000-0000-0000000000bb' and activity_type = 'survey'),
  '{"combi":1}'::jsonb);
reset role;

-- ---------------------------------------------------------------------------
-- Enviar el relevamiento
-- ---------------------------------------------------------------------------

select is(
  (select status from public.work_orders where id = 'f6000000-0000-0000-0000-0000000000aa'),
  'en_revision',
  'la orden de sólo relevamiento salta de pendiente a en_revision: la máquina vieja no lo permitía'
);

select is(
  (select status from public.work_orders where id = 'f6000000-0000-0000-0000-0000000000bb'),
  'pendiente',
  'la combinada no se mueve: su estado lo manda la ejecución, no el relevamiento'
);

-- ---------------------------------------------------------------------------
-- Aprobar: AC-07-A
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"f6000000-0000-0000-0000-000000000013","role":"authenticated"}';

select public.decide_survey_submission(
  gen_random_uuid(),
  (select ss.id from public.survey_submissions ss
   join public.work_activities a on a.id = ss.activity_id
   where a.work_order_id = 'f6000000-0000-0000-0000-0000000000aa'),
  'approved');

select public.decide_survey_submission(
  gen_random_uuid(),
  (select ss.id from public.survey_submissions ss
   join public.work_activities a on a.id = ss.activity_id
   where a.work_order_id = 'f6000000-0000-0000-0000-0000000000bb'),
  'approved');

reset role;

select is(
  (select status from public.work_orders where id = 'f6000000-0000-0000-0000-0000000000aa'),
  'finalizada',
  'AC-07-A: el relevamiento independiente cierra la orden sin ejecución ficticia'
);

select is(
  (select status from public.work_orders where id = 'f6000000-0000-0000-0000-0000000000bb'),
  'pendiente',
  'en la combinada, aprobar el relevamiento HABILITA la ejecución, no termina la orden'
);

select is(
  (
    select lifecycle from public.work_activities
    where work_order_id = 'f6000000-0000-0000-0000-0000000000bb'
      and activity_type = 'execution'
  ),
  'draft',
  'y la ejecución sigue sin empezar'
);

-- ---------------------------------------------------------------------------
-- La compuerta no quedó abierta
-- ---------------------------------------------------------------------------

select is(
  current_setting('app.activity_sync', true),
  'off',
  'la compuerta se cierra después de proyectar: no queda abierta para el resto de la transacción'
);

select throws_ok(
  $q$update public.work_orders set status = 'finalizada'
     where id = 'f6000000-0000-0000-0000-0000000000bb'$q$,
  'P0001',
  null,
  'y a mano el salto sigue prohibido: el validador no se convirtió en un adorno'
);

-- ---------------------------------------------------------------------------
-- Sync inverso: el camino viejo mantiene honestas a las actividades
-- ---------------------------------------------------------------------------

update public.work_orders set status = 'cancelada'
where id = 'f6000000-0000-0000-0000-0000000000bb';

select is(
  (
    select lifecycle from public.work_activities
    where work_order_id = 'f6000000-0000-0000-0000-0000000000bb'
      and activity_type = 'execution'
  ),
  'cancelled',
  'mover la orden por el camino viejo actualiza su actividad'
);

select is(
  (
    select lifecycle from public.work_activities
    where work_order_id = 'f6000000-0000-0000-0000-0000000000bb'
      and activity_type = 'survey'
  ),
  'approved',
  'pero no pisa el relevamiento: el sync inverso sólo toca la ejecución'
);

-- ---------------------------------------------------------------------------
-- El backfill no se movió solo
-- ---------------------------------------------------------------------------

select is(
  (
    select count(*)::integer from public.work_activities a
    join public.work_orders w on w.id = a.work_order_id
    where a.activity_type = 'execution'
      and w.status = 'pendiente'
      and a.lifecycle <> 'draft'
  ),
  0,
  'las actividades de las órdenes que nadie tocó siguen coherentes con su orden'
);

select is(
  (
    select count(*)::integer from public.survey_submissions ss
    join public.work_activities a on a.id = ss.activity_id
    where a.work_order_id = 'f6000000-0000-0000-0000-0000000000aa'
      and ss.status = 'approved'
  ),
  1,
  'y queda la evidencia de qué se aprobó para cerrar la orden'
);

select * from finish();

rollback;

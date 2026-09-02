-- Fase 0 de relevamiento y ejecución: los comandos que despiertan el modelo.
--
-- `work_activities`, `survey_submissions`, `survey_submission_decisions` y
-- `work_assignments` estaban en producción desde agosto con 0 filas y sin nada
-- que las moviera. Este archivo prueba los comandos que faltaban y, de paso,
-- que la maquinaria dormida —triggers de validación y de proyección— hace lo
-- que dice cuando por fin le llegan datos.
--
-- El caso más importante es el ÚLTIMO: `AC-07-C`, la autoaprobación de alguien
-- con rol dual. Es el único que no se prueba solo con un instalador raso: a un
-- instalador lo frena antes el control de operador, así que la guarda de
-- autoaprobación nunca llega a ejecutarse y uno se queda creyendo que la probó.
-- Hace falta un coordinador que releve y después intente aprobar lo suyo.

begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

insert into public.companies (id, name, country, order_prefix)
values ('e5000000-0000-0000-0000-000000000001', 'Empresa Relevamiento', 'AR', 'ERE');

insert into auth.users (id, email, raw_user_meta_data) values
  ('e5000000-0000-0000-0000-000000000011', 'gerente.rel@test.dev',
   '{"role":"company_manager","company_id":"e5000000-0000-0000-0000-000000000001"}'::jsonb),
  ('e5000000-0000-0000-0000-000000000012', 'instalador.rel@test.dev',
   '{"role":"installer"}'::jsonb),
  ('e5000000-0000-0000-0000-000000000013', 'coordinador.rel@test.dev',
   '{"role":"installer"}'::jsonb),
  ('e5000000-0000-0000-0000-000000000014', 'ajeno.rel@test.dev',
   '{"role":"installer"}'::jsonb);

insert into public.installers (id, zones) values
  ('e5000000-0000-0000-0000-000000000012', array['AR-BA-AMBA']),
  ('e5000000-0000-0000-0000-000000000013', array['AR-BA-AMBA']),
  ('e5000000-0000-0000-0000-000000000014', array['AR-BA-AMBA'])
on conflict (id) do nothing;

insert into public.company_installers (company_id, installer_id, role, status, joined_at)
values
  ('e5000000-0000-0000-0000-000000000001',
   'e5000000-0000-0000-0000-000000000012', 'installer', 'active', now()),
  ('e5000000-0000-0000-0000-000000000001',
   'e5000000-0000-0000-0000-000000000013', 'coordinator', 'active', now());

insert into public.company_membership_roles (company_id, user_id, role) values
  ('e5000000-0000-0000-0000-000000000001',
   'e5000000-0000-0000-0000-000000000012', 'installer'),
  ('e5000000-0000-0000-0000-000000000001',
   'e5000000-0000-0000-0000-000000000013', 'coordinator')
on conflict do nothing;

insert into public.projects (id, company_id, name, coordinator_id)
values ('e5000000-0000-0000-0000-000000000021',
        'e5000000-0000-0000-0000-000000000001', 'Proyecto Relevamiento',
        'e5000000-0000-0000-0000-000000000013');

insert into public.sites (id, project_id, company_id, name)
values ('e5000000-0000-0000-0000-000000000031',
        'e5000000-0000-0000-0000-000000000021',
        'e5000000-0000-0000-0000-000000000001', 'Punto Relevamiento');

insert into public.work_orders (
  id, company_id, project_id, site_id, order_number, title,
  assigned_installer_id, status
) values (
  'e5000000-0000-0000-0000-000000000041', 'e5000000-0000-0000-0000-000000000001',
  'e5000000-0000-0000-0000-000000000021', 'e5000000-0000-0000-0000-000000000031',
  'ERE-0001', 'Relevamiento y después ejecución',
  'e5000000-0000-0000-0000-000000000012', 'pendiente'
);

-- ---------------------------------------------------------------------------
-- Crear actividades
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"e5000000-0000-0000-0000-000000000012","role":"authenticated"}';

select throws_ok(
  $q$select public.create_order_activities(
      'e5000000-0000-0000-0000-000000000041', true, true)$q$,
  'P0001',
  null,
  'un instalador no arma las actividades de una orden'
);

set local request.jwt.claims to
  '{"sub":"e5000000-0000-0000-0000-000000000011","role":"authenticated"}';

select throws_ok(
  $q$select public.create_order_activities(
      'e5000000-0000-0000-0000-000000000041', false, false)$q$,
  'P0001',
  null,
  'una orden sin ninguna actividad no significa nada'
);

select lives_ok(
  $q$select public.create_order_activities(
      'e5000000-0000-0000-0000-000000000041', true, true)$q$,
  'la empresa arma relevamiento y ejecución'
);

select is(
  (
    select (public.create_order_activities(
      'e5000000-0000-0000-0000-000000000041', true, true) ->> 'created')::boolean
  ),
  false,
  'volver a pedir lo mismo devuelve lo que ya hay: la orden es la llave, no un operation_id'
);

select throws_ok(
  $q$select public.create_order_activities(
      'e5000000-0000-0000-0000-000000000041', false, true)$q$,
  'P0001',
  null,
  'pedir algo distinto falla: agregar una ejecución cambia lo que la orden ES'
);

reset role;

select ok(
  exists (
    select 1
    from public.work_activities e
    join public.work_activities s on s.id = e.prerequisite_activity_id
    where e.work_order_id = 'e5000000-0000-0000-0000-000000000041'
      and e.activity_type = 'execution'
      and s.activity_type = 'survey'
  ),
  'la ejecución declara que depende del relevamiento'
);

select is(
  (
    select schedule_precision from public.work_activities
    where work_order_id = 'e5000000-0000-0000-0000-000000000041'
      and activity_type = 'survey'
  ),
  'unknown',
  'y el relevamiento nace sin fecha, que es lo que el requisito permite'
);

-- ---------------------------------------------------------------------------
-- Asignar y relevar
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"e5000000-0000-0000-0000-000000000011","role":"authenticated"}';

select throws_ok(
  $q$select public.assign_activity(
      (select id from public.work_activities where activity_type = 'survey'),
      'e5000000-0000-0000-0000-000000000014')$q$,
  'P0001',
  null,
  'no se asigna a alguien que no está en el equipo de esa empresa'
);

select lives_ok(
  $q$select public.assign_activity(
      (select id from public.work_activities where activity_type = 'survey'),
      'e5000000-0000-0000-0000-000000000012')$q$,
  'se asigna a quien va a relevar'
);

set local request.jwt.claims to
  '{"sub":"e5000000-0000-0000-0000-000000000012","role":"authenticated"}';

select lives_ok(
  $q$select public.submit_survey_submission(
      (select id from public.work_activities where activity_type = 'survey'),
      '{"acceso":"por atrás"}'::jsonb, '{"ancho_m":3.2}'::jsonb)$q$,
  'el asignado envía el relevamiento'
);

-- El mismo contenido otra vez: un reintento offline, un doble toque.
select public.submit_survey_submission(
  (select id from public.work_activities where activity_type = 'survey'),
  '{"acceso":"por atrás"}'::jsonb, '{"ancho_m":3.2}'::jsonb);

reset role;

select is(
  (select count(*)::integer from public.survey_submissions),
  1,
  'reenviar lo mismo no crea otra versión: le haría creer al coordinador que hubo una corrección'
);

-- ---------------------------------------------------------------------------
-- El prerrequisito, que ya estaba enforced y ahora por fin se ejercita
-- ---------------------------------------------------------------------------

select throws_ok(
  $q$update public.work_activities set lifecycle = 'in_progress'
     where activity_type = 'execution'$q$,
  'P0001',
  null,
  'la ejecución no arranca mientras el relevamiento no esté aprobado'
);

-- ---------------------------------------------------------------------------
-- AC-07-C: el rol dual no puede aprobarse a sí mismo
--
-- Éste es el que hay que hacer con el COORDINADOR y no con un instalador: al
-- instalador lo frena antes el control de operador, y la guarda de
-- autoaprobación nunca llega a correr.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"e5000000-0000-0000-0000-000000000011","role":"authenticated"}';
select public.assign_activity(
  (select id from public.work_activities where activity_type = 'survey'),
  'e5000000-0000-0000-0000-000000000013');

set local request.jwt.claims to
  '{"sub":"e5000000-0000-0000-0000-000000000013","role":"authenticated"}';
select public.submit_survey_submission(
  (select id from public.work_activities where activity_type = 'survey'),
  '{"relevado":"por el coordinador"}'::jsonb);

select throws_ok(
  $q$select public.decide_survey_submission(
      gen_random_uuid(),
      (select id from public.survey_submissions order by version desc limit 1),
      'approved')$q$,
  'P0001',
  null,
  'el coordinador que relevó no puede aprobar su propia entrega, aunque tenga el permiso'
);

select throws_ok(
  $q$select public.decide_survey_submission(
      gen_random_uuid(),
      (select id from public.survey_submissions order by version desc limit 1),
      'changes_requested', '')$q$,
  'P0001',
  null,
  'y pedir cambios sin motivo se rechaza: la explicación es el punto de pedirlos'
);

reset role;

select * from finish();

rollback;

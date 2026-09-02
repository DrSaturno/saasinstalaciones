-- Fase 2: quién aprueba el relevamiento (DEC-15) y qué pasa con las versiones.
--
-- El requisito es explícito: "la aprobación del relevamiento no deberá depender
-- directamente de la empresa como instancia operativa, sino del coordinador
-- responsable". Hasta esta fase el gerente podía aprobar, así que este archivo
-- fija el comportamiento nuevo y el motivo por el que hay una excepción.
--
-- **La excepción y por qué existe.** `projects.coordinator_id` es nullable a
-- propósito, para que una empresa nueva pueda crear su primer proyecto sin
-- tener a nadie cargado. Sin fallback, un relevamiento de un proyecto sin
-- coordinador quedaría imposible de aprobar para siempre. El fallback queda
-- marcado en la decisión: una excepción que no se puede contar deja de ser una
-- excepción.
--
-- Y se cierra AC-07-B: pedir cambios conserva la versión y bloquea la
-- ejecución; la corrección entra como una versión nueva, no pisando la vieja.

begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

insert into public.companies (id, name, country, order_prefix)
values ('b8000000-0000-0000-0000-000000000001', 'Empresa DEC-15', 'AR', 'D15');

insert into auth.users (id, email, raw_user_meta_data) values
  ('b8000000-0000-0000-0000-000000000011', 'gerente.d15@test.dev',
   '{"role":"company_manager","company_id":"b8000000-0000-0000-0000-000000000001"}'::jsonb),
  ('b8000000-0000-0000-0000-000000000012', 'instalador.d15@test.dev',
   '{"role":"installer"}'::jsonb),
  ('b8000000-0000-0000-0000-000000000013', 'coordinador.d15@test.dev',
   '{"role":"installer"}'::jsonb);

insert into public.installers (id, zones) values
  ('b8000000-0000-0000-0000-000000000012', array['AR-BA-AMBA']),
  ('b8000000-0000-0000-0000-000000000013', array['AR-BA-AMBA'])
on conflict (id) do nothing;

insert into public.company_installers (company_id, installer_id, role, status, joined_at)
values
  ('b8000000-0000-0000-0000-000000000001',
   'b8000000-0000-0000-0000-000000000012', 'installer', 'active', now()),
  ('b8000000-0000-0000-0000-000000000001',
   'b8000000-0000-0000-0000-000000000013', 'coordinator', 'active', now());

insert into public.company_membership_roles (company_id, user_id, role) values
  ('b8000000-0000-0000-0000-000000000001',
   'b8000000-0000-0000-0000-000000000012', 'installer'),
  ('b8000000-0000-0000-0000-000000000001',
   'b8000000-0000-0000-0000-000000000013', 'coordinator')
on conflict do nothing;

-- Un proyecto CON coordinador y otro SIN: la diferencia es todo el punto.
insert into public.projects (id, company_id, name, coordinator_id) values
  ('b8000000-0000-0000-0000-000000000021',
   'b8000000-0000-0000-0000-000000000001', 'Con coordinador',
   'b8000000-0000-0000-0000-000000000013'),
  ('b8000000-0000-0000-0000-000000000022',
   'b8000000-0000-0000-0000-000000000001', 'Sin coordinador', null);

insert into public.sites (id, project_id, company_id, name) values
  ('b8000000-0000-0000-0000-000000000031', 'b8000000-0000-0000-0000-000000000021',
   'b8000000-0000-0000-0000-000000000001', 'Punto 1'),
  ('b8000000-0000-0000-0000-000000000032', 'b8000000-0000-0000-0000-000000000022',
   'b8000000-0000-0000-0000-000000000001', 'Punto 2');

insert into public.work_orders (
  id, company_id, project_id, site_id, order_number, title,
  assigned_installer_id, status
) values
  ('b8000000-0000-0000-0000-0000000000aa', 'b8000000-0000-0000-0000-000000000001',
   'b8000000-0000-0000-0000-000000000021', 'b8000000-0000-0000-0000-000000000031',
   'D15-0001', 'Relevamiento y ejecución',
   'b8000000-0000-0000-0000-000000000012', 'pendiente'),
  ('b8000000-0000-0000-0000-0000000000bb', 'b8000000-0000-0000-0000-000000000001',
   'b8000000-0000-0000-0000-000000000022', 'b8000000-0000-0000-0000-000000000032',
   'D15-0002', 'Sólo relevamiento, sin coordinador',
   'b8000000-0000-0000-0000-000000000012', 'pendiente');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"b8000000-0000-0000-0000-000000000011","role":"authenticated"}';
select public.create_order_activities('b8000000-0000-0000-0000-0000000000aa', true, true);
select public.create_order_activities('b8000000-0000-0000-0000-0000000000bb', true, false);
select public.assign_activity(
  (select id from public.work_activities
   where work_order_id = 'b8000000-0000-0000-0000-0000000000aa' and activity_type = 'survey'),
  'b8000000-0000-0000-0000-000000000012');
select public.assign_activity(
  (select id from public.work_activities where work_order_id = 'b8000000-0000-0000-0000-0000000000bb'),
  'b8000000-0000-0000-0000-000000000012');

set local request.jwt.claims to
  '{"sub":"b8000000-0000-0000-0000-000000000012","role":"authenticated"}';
select public.submit_survey_submission(
  (select id from public.work_activities
   where work_order_id = 'b8000000-0000-0000-0000-0000000000aa' and activity_type = 'survey'),
  '{"v":1}'::jsonb);
select public.submit_survey_submission(
  (select id from public.work_activities where work_order_id = 'b8000000-0000-0000-0000-0000000000bb'),
  '{"v":1}'::jsonb);

-- ---------------------------------------------------------------------------
-- DEC-15: la autoridad
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"b8000000-0000-0000-0000-000000000011","role":"authenticated"}';

select is(
  public.survey_decision_authority(
    (select id from public.work_activities
     where work_order_id = 'b8000000-0000-0000-0000-0000000000aa' and activity_type = 'survey')),
  null,
  'el gerente NO tiene autoridad cuando el proyecto tiene coordinador'
);

select is(
  public.survey_decision_authority(
    (select id from public.work_activities where work_order_id = 'b8000000-0000-0000-0000-0000000000bb')),
  'manager_fallback',
  'pero sí cuando el proyecto no tiene ninguno: si no, sería inaprobable para siempre'
);

select throws_ok(
  $q$select public.decide_survey_submission(
      gen_random_uuid(),
      (select ss.id from public.survey_submissions ss
       join public.work_activities a on a.id = ss.activity_id
       where a.work_order_id = 'b8000000-0000-0000-0000-0000000000aa'),
      'approved')$q$,
  'P0001',
  null,
  'y el intento se rechaza en el servidor, no se ignora en silencio'
);

set local request.jwt.claims to
  '{"sub":"b8000000-0000-0000-0000-000000000013","role":"authenticated"}';

select is(
  public.survey_decision_authority(
    (select id from public.work_activities
     where work_order_id = 'b8000000-0000-0000-0000-0000000000aa' and activity_type = 'survey')),
  'coordinator',
  'el coordinador responsable del proyecto sí decide'
);

select throws_ok(
  $q$select public.decide_survey_submission(
      gen_random_uuid(),
      (select ss.id from public.survey_submissions ss
       join public.work_activities a on a.id = ss.activity_id
       where a.work_order_id = 'b8000000-0000-0000-0000-0000000000aa'),
      'changes_requested', 'ab')$q$,
  'P0001',
  null,
  'pedir cambios con un motivo de dos letras no es pedir cambios'
);

select lives_ok(
  $q$select public.decide_survey_submission(
      gen_random_uuid(),
      (select ss.id from public.survey_submissions ss
       join public.work_activities a on a.id = ss.activity_id
       where a.work_order_id = 'b8000000-0000-0000-0000-0000000000aa'),
      'changes_requested', 'Falta la medida del alto y una foto del frente')$q$,
  'el coordinador pide cambios explicando qué falta'
);

reset role;

-- ---------------------------------------------------------------------------
-- AC-07-B
-- ---------------------------------------------------------------------------

select is(
  (
    select status from public.survey_submissions ss
    join public.work_activities a on a.id = ss.activity_id
    where a.work_order_id = 'b8000000-0000-0000-0000-0000000000aa'
  ),
  'changes_requested',
  'la versión queda marcada con cambios solicitados'
);

select is(
  (
    select lifecycle from public.work_activities
    where work_order_id = 'b8000000-0000-0000-0000-0000000000aa'
      and activity_type = 'execution'
  ),
  'draft',
  'y la ejecución sigue bloqueada mientras tanto'
);

select is(
  (select reason from public.survey_submission_decisions limit 1),
  'Falta la medida del alto y una foto del frente',
  'el motivo queda guardado: es lo que el instalador va a leer para corregir'
);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"b8000000-0000-0000-0000-000000000012","role":"authenticated"}';
select public.submit_survey_submission(
  (select id from public.work_activities
   where work_order_id = 'b8000000-0000-0000-0000-0000000000aa' and activity_type = 'survey'),
  '{"v":2}'::jsonb, '{"alto_m":2.5}'::jsonb);
reset role;

select is(
  (
    select count(*)::integer from public.survey_submissions ss
    join public.work_activities a on a.id = ss.activity_id
    where a.work_order_id = 'b8000000-0000-0000-0000-0000000000aa'
  ),
  2,
  'AC-07-B: la corrección entra como versión nueva, no pisando la anterior'
);

-- ---------------------------------------------------------------------------
-- El fallback queda contable
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"b8000000-0000-0000-0000-000000000011","role":"authenticated"}';
select public.decide_survey_submission(
  gen_random_uuid(),
  (select ss.id from public.survey_submissions ss
   join public.work_activities a on a.id = ss.activity_id
   where a.work_order_id = 'b8000000-0000-0000-0000-0000000000bb'),
  'approved');
reset role;

select is(
  (select count(*)::integer from public.survey_submission_decisions
   where used_manager_fallback),
  1,
  'cada uso del fallback queda marcado: una excepción que no se cuenta deja de serlo'
);

select is(
  (select status from public.work_orders where id = 'b8000000-0000-0000-0000-0000000000bb'),
  'finalizada',
  'y la orden de sólo relevamiento cierra igual, aprobada por el fallback'
);

select * from finish();

rollback;

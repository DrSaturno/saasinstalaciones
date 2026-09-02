-- Fase 4: dispensar el prerrequisito del relevamiento.
--
-- El caso que este archivo existe para proteger es el segundo: **el gerente no
-- puede dispensar cuando hay coordinador.** Si pudiera, DEC-15 quedaría
-- decorativa — no aprobaría el relevamiento, pero saltearía el requisito, y la
-- ejecución arrancaría igual sin que el coordinador viera nada. La puerta de
-- atrás sería más ancha que la puerta.
--
-- Y el motivo: la tabla exige entre 10 y 500 caracteres porque "ok" no explica
-- por qué se salteó un control, y dentro de seis meses alguien va a querer
-- saberlo. Volver a dispensar no falla —un reintento no puede romper— pero
-- tampoco pisa el motivo original, que es el que explica la decisión que
-- efectivamente se tomó.

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

insert into public.companies (id, name, country, order_prefix)
values ('d2000000-0000-0000-0000-000000000001', 'Empresa Dispensa', 'AR', 'EWA');

insert into auth.users (id, email, raw_user_meta_data) values
  ('d2000000-0000-0000-0000-000000000011', 'gerente.wa@test.dev',
   '{"role":"company_manager","company_id":"d2000000-0000-0000-0000-000000000001"}'::jsonb),
  ('d2000000-0000-0000-0000-000000000012', 'instalador.wa@test.dev',
   '{"role":"installer"}'::jsonb),
  ('d2000000-0000-0000-0000-000000000013', 'coordinador.wa@test.dev',
   '{"role":"installer"}'::jsonb);

insert into public.installers (id, zones) values
  ('d2000000-0000-0000-0000-000000000012', array['AR-BA-AMBA']),
  ('d2000000-0000-0000-0000-000000000013', array['AR-BA-AMBA'])
on conflict (id) do nothing;

insert into public.company_installers (company_id, installer_id, role, status, joined_at)
values
  ('d2000000-0000-0000-0000-000000000001',
   'd2000000-0000-0000-0000-000000000012', 'installer', 'active', now()),
  ('d2000000-0000-0000-0000-000000000001',
   'd2000000-0000-0000-0000-000000000013', 'coordinator', 'active', now());

insert into public.company_membership_roles (company_id, user_id, role) values
  ('d2000000-0000-0000-0000-000000000001',
   'd2000000-0000-0000-0000-000000000012', 'installer'),
  ('d2000000-0000-0000-0000-000000000001',
   'd2000000-0000-0000-0000-000000000013', 'coordinator')
on conflict do nothing;

insert into public.projects (id, company_id, name, coordinator_id)
values ('d2000000-0000-0000-0000-000000000021',
        'd2000000-0000-0000-0000-000000000001', 'Proyecto Dispensa',
        'd2000000-0000-0000-0000-000000000013');

insert into public.sites (id, project_id, company_id, name)
values ('d2000000-0000-0000-0000-000000000031',
        'd2000000-0000-0000-0000-000000000021',
        'd2000000-0000-0000-0000-000000000001', 'Punto Dispensa');

insert into public.work_orders (
  id, company_id, project_id, site_id, order_number, title,
  assigned_installer_id, status
) values (
  'd2000000-0000-0000-0000-0000000000aa', 'd2000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000021', 'd2000000-0000-0000-0000-000000000031',
  'EWA-0001', 'Relevamiento y después ejecución',
  'd2000000-0000-0000-0000-000000000012', 'pendiente'
);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"d2000000-0000-0000-0000-000000000011","role":"authenticated"}';
select public.create_order_activities('d2000000-0000-0000-0000-0000000000aa', true, true);
reset role;

select throws_ok(
  $q$update public.work_activities set lifecycle = 'in_progress'
     where activity_type = 'execution'
       and work_order_id = 'd2000000-0000-0000-0000-0000000000aa'$q$,
  'P0001',
  null,
  'la ejecución no arranca mientras el relevamiento no esté aprobado'
);

-- ---------------------------------------------------------------------------
-- Quién puede dispensar
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"d2000000-0000-0000-0000-000000000011","role":"authenticated"}';

select throws_ok(
  $q$select public.waive_activity_prerequisite(
      (select id from public.work_activities
       where activity_type = 'execution'
         and work_order_id = 'd2000000-0000-0000-0000-0000000000aa'),
      'El cliente apura y hay que arrancar ya mismo')$q$,
  'P0001',
  null,
  'el gerente NO dispensa cuando hay coordinador: sería la puerta de atrás de DEC-15'
);

set local request.jwt.claims to
  '{"sub":"d2000000-0000-0000-0000-000000000012","role":"authenticated"}';

select throws_ok(
  $q$select public.waive_activity_prerequisite(
      (select id from public.work_activities
       where activity_type = 'execution'
         and work_order_id = 'd2000000-0000-0000-0000-0000000000aa'),
      'Me dijeron que arranque igual así que arranco')$q$,
  'P0001',
  null,
  'y el instalador tampoco se dispensa a sí mismo'
);

set local request.jwt.claims to
  '{"sub":"d2000000-0000-0000-0000-000000000013","role":"authenticated"}';

select throws_ok(
  $q$select public.waive_activity_prerequisite(
      (select id from public.work_activities
       where activity_type = 'execution'
         and work_order_id = 'd2000000-0000-0000-0000-0000000000aa'),
      'ok')$q$,
  'P0001',
  null,
  'un motivo de dos letras no explica por qué se salteó un control'
);

select lives_ok(
  $q$select public.waive_activity_prerequisite(
      (select id from public.work_activities
       where activity_type = 'execution'
         and work_order_id = 'd2000000-0000-0000-0000-0000000000aa'),
      'Relevamiento hecho por teléfono con el encargado, hay fotos en el chat')$q$,
  'el coordinador dispensa explicando por qué'
);

select lives_ok(
  $q$select public.waive_activity_prerequisite(
      (select id from public.work_activities
       where activity_type = 'execution'
         and work_order_id = 'd2000000-0000-0000-0000-0000000000aa'),
      'Otro motivo distinto')$q$,
  'volver a dispensar no falla: un reintento no puede romper'
);

reset role;

select is(
  (
    select prerequisite_waived_reason from public.work_activities
    where activity_type = 'execution'
      and work_order_id = 'd2000000-0000-0000-0000-0000000000aa'
  ),
  'Relevamiento hecho por teléfono con el encargado, hay fotos en el chat',
  'pero NO se pisa el motivo original: es el que explica la decisión que se tomó'
);

select lives_ok(
  $q$update public.work_activities set lifecycle = 'in_progress'
     where activity_type = 'execution'
       and work_order_id = 'd2000000-0000-0000-0000-0000000000aa'$q$,
  'y con la dispensa asentada, ahora sí arranca'
);

select is(
  (select status from public.work_orders where id = 'd2000000-0000-0000-0000-0000000000aa'),
  'en_proceso',
  'la orden lo refleja por la proyección de la Fase 1'
);

select * from finish();

rollback;

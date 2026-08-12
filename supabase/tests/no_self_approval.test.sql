-- ADR-001 / R1: quien ejecuta la actividad no puede aprobar su propia entrega,
-- aunque también sea coordinador de ese proyecto (rol dual).

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

select has_function(
  'public',
  'validate_order_transition',
  'existe el trigger de validación de transiciones de orden'
);

insert into public.companies (id, name, country, order_prefix)
values (
  'e5000000-0000-0000-0000-000000000001',
  'Empresa autoaprobación',
  'AR',
  'SAP'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change,
  email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000',
  'e5000000-0000-0000-0000-000000000010',
  'authenticated', 'authenticated', 'manager-sap@test.invalid',
  extensions.crypt('x', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"company_manager","company_id":"e5000000-0000-0000-0000-000000000001","full_name":"Manager SAP"}',
  now(), now(), '', '', '', '', '', '', '', ''
), (
  '00000000-0000-0000-0000-000000000000',
  'e5000000-0000-0000-0000-000000000011',
  'authenticated', 'authenticated', 'dual-sap@test.invalid',
  extensions.crypt('x', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"installer","full_name":"Coordinador Instalador"}',
  now(), now(), '', '', '', '', '', '', '', ''
);

insert into public.company_installers (
  company_id, installer_id, role, status, joined_at
) values (
  'e5000000-0000-0000-0000-000000000001',
  'e5000000-0000-0000-0000-000000000011',
  'coordinator', 'active', now()
);

-- Sumamos también instalación a la misma persona: es el caso que habilita R1.
reset role;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"e5000000-0000-0000-0000-000000000010","role":"authenticated"}';
select lives_ok(
  $$select public.grant_company_member_role(
    'e5000000-0000-0000-0000-000000000011', 'installer'
  )$$,
  'el manager habilita también instalación para la misma persona'
);

reset role;
insert into public.projects (
  id, company_id, name, coordinator_id, status
) values (
  'e5000000-0000-0000-0000-000000000020',
  'e5000000-0000-0000-0000-000000000001',
  'Proyecto autoaprobación',
  'e5000000-0000-0000-0000-000000000011',
  'active'
);
insert into public.sites (id, project_id, company_id, name) values (
  'e5000000-0000-0000-0000-000000000030',
  'e5000000-0000-0000-0000-000000000020',
  'e5000000-0000-0000-0000-000000000001',
  'Sitio autoaprobación'
);
-- Insert directo en 'en_revision': el trigger sólo mira UPDATE, no INSERT.
insert into public.work_orders (
  id, order_number, site_id, project_id, company_id, title,
  assigned_installer_id, status
) values (
  'e5000000-0000-0000-0000-000000000040',
  'SAP-0001',
  'e5000000-0000-0000-0000-000000000030',
  'e5000000-0000-0000-0000-000000000020',
  'e5000000-0000-0000-0000-000000000001',
  'Orden propia en revisión',
  'e5000000-0000-0000-0000-000000000011',
  'en_revision'
);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"e5000000-0000-0000-0000-000000000011","role":"authenticated"}';

select throws_ok(
  $$update public.work_orders set status = 'finalizada'
    where id = 'e5000000-0000-0000-0000-000000000040'$$,
  'P0001',
  'No podés aprobar ni reabrir tu propia entrega',
  'el coordinador no puede finalizar su propia orden como instalador'
);
select throws_ok(
  $$update public.work_orders set status = 'en_proceso'
    where id = 'e5000000-0000-0000-0000-000000000040'$$,
  'P0001',
  'No podés aprobar ni reabrir tu propia entrega',
  'el coordinador tampoco puede reabrir su propia entrega'
);
select is(
  (select status from public.work_orders
   where id = 'e5000000-0000-0000-0000-000000000040'),
  'en_revision',
  'la orden sigue en revisión: ningún intento bloqueado la modificó'
);

reset role;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"e5000000-0000-0000-0000-000000000010","role":"authenticated"}';

select lives_ok(
  $$update public.work_orders set status = 'finalizada'
    where id = 'e5000000-0000-0000-0000-000000000040'$$,
  'un tercero (la empresa) sí puede aprobar la misma entrega'
);

select * from finish();
rollback;

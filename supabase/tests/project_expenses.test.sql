-- Bloque 6 (docs/specs/2026-09-24-resultado-economico): otros costos del
-- proyecto. Mismo permiso que ya protege lo comercial (`auth_can_see_commercials`,
-- bloques 4 y 8) — este archivo confirma que se aplica igual acá.

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

select has_table('public', 'project_expenses', 'existe la tabla de gastos de proyecto');
select is(
  (select relrowsecurity from pg_class where relname = 'project_expenses'),
  true,
  'project_expenses tiene RLS activa'
);

insert into public.companies (id, name, country, order_prefix) values
  ('f9000000-0000-0000-0000-000000000001', 'Empresa A', 'AR', 'GTA'),
  ('f9000000-0000-0000-0000-000000000002', 'Empresa B', 'AR', 'GTB');

insert into auth.users (id, email, raw_app_meta_data) values
  ('f9000000-0000-0000-0000-000000000011', 'gerente.a@test.dev',
   '{"role":"company_manager","company_id":"f9000000-0000-0000-0000-000000000001","is_owner":true}'::jsonb),
  ('f9000000-0000-0000-0000-000000000012', 'gerente.b@test.dev',
   '{"role":"company_manager","company_id":"f9000000-0000-0000-0000-000000000002","is_owner":true}'::jsonb),
  ('f9000000-0000-0000-0000-000000000013', 'coordinador.a@test.dev',
   '{"role":"installer"}'::jsonb),
  ('f9000000-0000-0000-0000-000000000014', 'instalador.a@test.dev',
   '{"role":"installer"}'::jsonb);

insert into public.company_installers (company_id, installer_id, role, status, joined_at) values
  ('f9000000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000013', 'coordinator', 'active', now()),
  ('f9000000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000014', 'installer', 'active', now());

insert into public.clients (id, company_id, name) values
  ('f9000000-0000-0000-0000-000000000021', 'f9000000-0000-0000-0000-000000000001', 'Cliente A');

insert into public.projects (id, company_id, client_id, name, country, zones, coordinator_id) values
  ('f9000000-0000-0000-0000-000000000031', 'f9000000-0000-0000-0000-000000000001',
   'f9000000-0000-0000-0000-000000000021', 'Proyecto A', 'AR', array['Buenos Aires'],
   'f9000000-0000-0000-0000-000000000013');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"f9000000-0000-0000-0000-000000000011","role":"authenticated"}';

select lives_ok(
  $$insert into public.project_expenses (company_id, project_id, concept, amount, expense_date, created_by)
    values ('f9000000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000031',
            'Materiales', 15000, '2026-09-20', 'f9000000-0000-0000-0000-000000000011')$$,
  'RESULT-R1.1: el gerente carga un gasto'
);

select is(
  (select count(*)::integer from public.project_expenses
    where project_id = 'f9000000-0000-0000-0000-000000000031'),
  1,
  'y lo ve'
);

set local request.jwt.claims to
  '{"sub":"f9000000-0000-0000-0000-000000000013","role":"authenticated"}';

select is(
  (select count(*)::integer from public.project_expenses
    where project_id = 'f9000000-0000-0000-0000-000000000031'),
  0,
  'RESULT-R1.2: el coordinador del proyecto no ve los gastos'
);

select throws_ok(
  $$insert into public.project_expenses (company_id, project_id, concept, amount, expense_date, created_by)
    values ('f9000000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000031',
            'Viáticos', 500, '2026-09-20', 'f9000000-0000-0000-0000-000000000013')$$,
  '42501',
  null,
  'RESULT-R1.2: el coordinador no puede cargar un gasto'
);

set local request.jwt.claims to
  '{"sub":"f9000000-0000-0000-0000-000000000014","role":"authenticated"}';

select is(
  (select count(*)::integer from public.project_expenses
    where project_id = 'f9000000-0000-0000-0000-000000000031'),
  0,
  'RESULT-R1.2: el instalador no ve los gastos'
);

set local request.jwt.claims to
  '{"sub":"f9000000-0000-0000-0000-000000000012","role":"authenticated"}';

select is(
  (select count(*)::integer from public.project_expenses
    where project_id = 'f9000000-0000-0000-0000-000000000031'),
  0,
  'RESULT-R1.3: el gerente de otra empresa no ve nada'
);

select throws_ok(
  $$insert into public.project_expenses (company_id, project_id, concept, amount, expense_date, created_by)
    values ('f9000000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000031',
            'Ajeno', 100, '2026-09-20', 'f9000000-0000-0000-0000-000000000012')$$,
  '42501',
  null,
  'RESULT-R1.3: el gerente de otra empresa no puede cargar un gasto ajeno'
);

reset role;

select * from finish();

rollback;

-- Gap de la Fase 4 de agenda: `projects` sólo tenía policies de lectura para
-- el gerente y el coordinador. Un instalador simple, asignado a una orden de
-- ese proyecto, no podía leer la fila — su propia agenda mostraba el proyecto
-- vacío aunque ya podía ver la orden, el punto y la actividad.

begin;

create extension if not exists pgtap with schema extensions;

select plan(3);

insert into public.companies (id, name, country, order_prefix)
values ('e8000000-0000-0000-0000-000000000001', 'Empresa Proyectos', 'AR', 'EPR');

insert into auth.users (id, email, raw_user_meta_data) values
  ('e8000000-0000-0000-0000-000000000011', 'gerente.epr@test.dev',
   '{"role":"company_manager","company_id":"e8000000-0000-0000-0000-000000000001"}'::jsonb),
  ('e8000000-0000-0000-0000-000000000012', 'asignado.epr@test.dev',
   '{"role":"installer"}'::jsonb),
  ('e8000000-0000-0000-0000-000000000013', 'ajeno.epr@test.dev',
   '{"role":"installer"}'::jsonb);

insert into public.company_installers (company_id, installer_id, role, status, joined_at)
values ('e8000000-0000-0000-0000-000000000001',
        'e8000000-0000-0000-0000-000000000012', 'installer', 'active', now());

insert into public.projects (id, company_id, name)
values ('e8000000-0000-0000-0000-000000000021',
        'e8000000-0000-0000-0000-000000000001', 'Proyecto Lectura');

insert into public.sites (id, project_id, company_id, name) values
  ('e8000000-0000-0000-0000-000000000031', 'e8000000-0000-0000-0000-000000000021',
   'e8000000-0000-0000-0000-000000000001', 'Punto');

insert into public.work_orders (
  id, company_id, project_id, site_id, order_number, title, status,
  assigned_installer_id
) values (
  'e8000000-0000-0000-0000-0000000000a1', 'e8000000-0000-0000-0000-000000000001',
  'e8000000-0000-0000-0000-000000000021', 'e8000000-0000-0000-0000-000000000031',
  'EPR-0001', 'Orden asignada', 'planificada',
  'e8000000-0000-0000-0000-000000000012'
);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"e8000000-0000-0000-0000-000000000012","role":"authenticated"}';

select is(
  (select count(*)::integer from public.projects
    where id = 'e8000000-0000-0000-0000-000000000021'),
  1,
  'el instalador asignado a la orden lee el proyecto de esa orden'
);

set local request.jwt.claims to
  '{"sub":"e8000000-0000-0000-0000-000000000013","role":"authenticated"}';

select is(
  (select count(*)::integer from public.projects
    where id = 'e8000000-0000-0000-0000-000000000021'),
  0,
  'un instalador ajeno, sin asignación en ese proyecto, no lo ve'
);

set local request.jwt.claims to
  '{"sub":"e8000000-0000-0000-0000-000000000011","role":"authenticated"}';

select is(
  (select count(*)::integer from public.projects
    where id = 'e8000000-0000-0000-0000-000000000021'),
  1,
  'el gerente de la empresa lo sigue viendo por su propia policy'
);

select * from finish();
rollback;

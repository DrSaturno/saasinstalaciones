-- Gap de la Fase 4 de agenda: `projects` sólo tenía policies de lectura para
-- el gerente y el coordinador. Un instalador simple, asignado a una orden de
-- ese proyecto, no podía leer el nombre — su propia agenda lo mostraba
-- vacío aunque ya podía ver la orden, el punto y la actividad.
--
-- Se resuelve con una función, no una policy sobre toda la fila: el endpoint
-- de exportación de locaciones confía en RLS de `projects` como único
-- control de acceso (`app/api/projects/[id]/sites/export`), así que una
-- policy amplia habría dejado exportar el proyecto entero a cualquiera con
-- una sola orden asignada ahí. La función sólo devuelve `id`/`name`, sólo de
-- las propias asignaciones, y sólo para el propio `auth.uid()` — el
-- parámetro no alcanza para pedir los nombres de otro instalador.

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
  (select count(*)::integer from public.project_names_for_installer(
    'e8000000-0000-0000-0000-000000000012')),
  1,
  'el instalador asignado a la orden lee el nombre de ese proyecto'
);

set local request.jwt.claims to
  '{"sub":"e8000000-0000-0000-0000-000000000013","role":"authenticated"}';

select is(
  (select count(*)::integer from public.project_names_for_installer(
    'e8000000-0000-0000-0000-000000000013')),
  0,
  'un instalador ajeno, sin asignación en ese proyecto, no ve nada'
);

-- El parámetro no alcanza: pedir los nombres de OTRO instalador (el que sí
-- está asignado) devuelve vacío, porque la función exige
-- `p_installer_id = auth.uid()`.
select is(
  (select count(*)::integer from public.project_names_for_installer(
    'e8000000-0000-0000-0000-000000000012')),
  0,
  'pedir el nombre a nombre de otro instalador no funciona: sólo el propio auth.uid()'
);

select * from finish();
rollback;

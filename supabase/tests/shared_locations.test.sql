-- Locaciones reutilizables entre clientes (LOCSHARE-*, docs/specs/2026-09-24-locaciones-compartidas).
--
-- Una locación es de la EMPRESA; qué clientes la usan, y con qué código propio, vive en
-- `client_locations`. Lo que se comparte es la identidad (dirección, ubicación…); lo que NO se
-- comparte entre clientes es el código del local y lo que cada cliente guarda sobre la locación
-- (documentos, requisitos): esto último se prueba acá con el rol de un coordinador.

begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

-- ---------------------------------------------------------------------------
-- Fixture: una empresa con dos clientes (A1 y A2) y otra empresa aparte.
-- ---------------------------------------------------------------------------

insert into public.companies (id, name, country, order_prefix) values
  ('ab000000-0000-0000-0000-000000000001', 'Empresa A', 'AR', 'LSA'),
  ('ab000000-0000-0000-0000-000000000002', 'Empresa B', 'AR', 'LSB');

insert into auth.users (id, email, raw_app_meta_data) values
  ('ab000000-0000-0000-0000-000000000011', 'gerente.a@test.dev',
   '{"role":"company_manager","company_id":"ab000000-0000-0000-0000-000000000001"}'::jsonb),
  ('ab000000-0000-0000-0000-000000000012', 'gerente.b@test.dev',
   '{"role":"company_manager","company_id":"ab000000-0000-0000-0000-000000000002"}'::jsonb),
  ('ab000000-0000-0000-0000-000000000013', 'coordinador.a2@test.dev',
   '{"role":"installer"}'::jsonb);

-- El coordinador de los proyectos del cliente A2 (y sólo de esos).
insert into public.company_installers (company_id, installer_id, status, joined_at, role) values
  ('ab000000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000013', 'active', now(), 'coordinator');

insert into public.clients (id, company_id, name) values
  ('ab000000-0000-0000-0000-000000000021', 'ab000000-0000-0000-0000-000000000001', 'Cliente A1'),
  ('ab000000-0000-0000-0000-000000000022', 'ab000000-0000-0000-0000-000000000001', 'Cliente A2'),
  ('ab000000-0000-0000-0000-000000000023', 'ab000000-0000-0000-0000-000000000002', 'Cliente B1');

insert into public.projects (id, company_id, client_id, name, country, zones, coordinator_id) values
  ('ab000000-0000-0000-0000-000000000031', 'ab000000-0000-0000-0000-000000000001',
   'ab000000-0000-0000-0000-000000000021', 'Proyecto de A1', 'AR', array['Buenos Aires'], null),
  ('ab000000-0000-0000-0000-000000000032', 'ab000000-0000-0000-0000-000000000001',
   'ab000000-0000-0000-0000-000000000022', 'Proyecto de A2', 'AR', array['Buenos Aires'],
   'ab000000-0000-0000-0000-000000000013');

-- La locación la crea el cliente A1, con su código.
insert into public.locations (
  id, company_id, client_id, name, address, city, state, zone, country, external_ref, source
) values
  ('ab000000-0000-0000-0000-000000000041', 'ab000000-0000-0000-0000-000000000001',
   'ab000000-0000-0000-0000-000000000021', 'Shopping Centro', 'Av. Siempreviva 742', 'CABA',
   'Buenos Aires', 'Buenos Aires', 'AR', 'SUC-001', 'manual'),
  ('ab000000-0000-0000-0000-000000000042', 'ab000000-0000-0000-0000-000000000001',
   'ab000000-0000-0000-0000-000000000021', 'Otro local', 'Calle 2', 'CABA',
   'Buenos Aires', 'Buenos Aires', 'AR', 'SUC-002', 'manual');

-- ---------------------------------------------------------------------------
-- Compatibilidad: crear una locación crea su vínculo de origen
-- ---------------------------------------------------------------------------

select is(
  (select external_ref from public.client_locations
    where location_id = 'ab000000-0000-0000-0000-000000000041'
      and client_id = 'ab000000-0000-0000-0000-000000000021'),
  'SUC-001',
  'LOCSHARE-R5.1: la locación nueva queda vinculada a su cliente de origen, con su código'
);

-- ---------------------------------------------------------------------------
-- Una locación, dos clientes
-- ---------------------------------------------------------------------------

insert into public.project_locations (company_id, client_id, project_id, location_id, status) values
  ('ab000000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000021',
   'ab000000-0000-0000-0000-000000000031', 'ab000000-0000-0000-0000-000000000041', 'active');

insert into public.sites (id, project_id, company_id, name, location_id) values
  ('ab000000-0000-0000-0000-000000000051', 'ab000000-0000-0000-0000-000000000031',
   'ab000000-0000-0000-0000-000000000001', 'x', 'ab000000-0000-0000-0000-000000000041');

select is(
  (select external_ref from public.sites where id = 'ab000000-0000-0000-0000-000000000051'),
  'SUC-001',
  'el punto del proyecto de A1 muestra el código de A1'
);

-- El cliente A2 pasa a usar la MISMA locación, con su propio código.
select throws_ok(
  $$insert into public.sites (id, project_id, company_id, name, location_id)
    values ('ab000000-0000-0000-0000-000000000052', 'ab000000-0000-0000-0000-000000000032',
            'ab000000-0000-0000-0000-000000000001', 'x', 'ab000000-0000-0000-0000-000000000041')$$,
  'P0001',
  null,
  'LOCSHARE-R1.1: sin vínculo, la locación de A1 no entra en un proyecto de A2'
);

insert into public.client_locations (location_id, company_id, client_id, external_ref) values
  ('ab000000-0000-0000-0000-000000000041', 'ab000000-0000-0000-0000-000000000001',
   'ab000000-0000-0000-0000-000000000022', 'X-77');

insert into public.project_locations (company_id, client_id, project_id, location_id, status) values
  ('ab000000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000022',
   'ab000000-0000-0000-0000-000000000032', 'ab000000-0000-0000-0000-000000000041', 'active');

insert into public.sites (id, project_id, company_id, name, location_id) values
  ('ab000000-0000-0000-0000-000000000052', 'ab000000-0000-0000-0000-000000000032',
   'ab000000-0000-0000-0000-000000000001', 'x', 'ab000000-0000-0000-0000-000000000041');

select is(
  (select external_ref from public.sites where id = 'ab000000-0000-0000-0000-000000000052'),
  'X-77',
  'LOCSHARE-R3.3: el punto del proyecto de A2 muestra el código de A2'
);

select is(
  (select external_ref from public.sites where id = 'ab000000-0000-0000-0000-000000000051'),
  'SUC-001',
  'y el de A1 sigue mostrando el suyo'
);

-- ---------------------------------------------------------------------------
-- La identidad se edita una vez y llega a todos
-- ---------------------------------------------------------------------------

update public.locations
   set address = 'Av. Nueva 1500'
 where id = 'ab000000-0000-0000-0000-000000000041';

select is(
  (select count(*)::integer from public.sites
    where location_id = 'ab000000-0000-0000-0000-000000000041'
      and address = 'Av. Nueva 1500'),
  2,
  'LOCSHARE-R2.1: editar la ficha cambia la dirección en los puntos de los DOS clientes'
);

-- ---------------------------------------------------------------------------
-- El código es del cliente
-- ---------------------------------------------------------------------------

update public.client_locations
   set external_ref = 'X-88'
 where location_id = 'ab000000-0000-0000-0000-000000000041'
   and client_id = 'ab000000-0000-0000-0000-000000000022';

select is(
  (select external_ref from public.sites where id = 'ab000000-0000-0000-0000-000000000052'),
  'X-88',
  'cambiar el código de A2 llega al punto de A2'
);

select is(
  (select external_ref from public.sites where id = 'ab000000-0000-0000-0000-000000000051'),
  'SUC-001',
  'LOCSHARE-R3.1: y no toca el de A1'
);

update public.locations
   set external_ref = 'SUC-001B'
 where id = 'ab000000-0000-0000-0000-000000000041';

select is(
  (select external_ref from public.client_locations
    where location_id = 'ab000000-0000-0000-0000-000000000041'
      and client_id = 'ab000000-0000-0000-0000-000000000021'),
  'SUC-001B',
  'el código de la ficha (cliente de origen) mueve el vínculo de origen y no el de otros'
);

select throws_ok(
  $$insert into public.client_locations (location_id, company_id, client_id, external_ref)
    values ('ab000000-0000-0000-0000-000000000042', 'ab000000-0000-0000-0000-000000000001',
            'ab000000-0000-0000-0000-000000000022', 'x88')$$,
  '23505',
  null,
  'LOCSHARE-R3.2: el código sigue siendo único por cliente (aunque se escriba distinto)'
);

-- ---------------------------------------------------------------------------
-- Aislamiento
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.client_locations (location_id, company_id, client_id, external_ref)
    values ('ab000000-0000-0000-0000-000000000041', 'ab000000-0000-0000-0000-000000000001',
            'ab000000-0000-0000-0000-000000000023', null)$$,
  '23503',
  null,
  'LOCSHARE-R5.3: no se puede vincular una locación a un cliente de OTRA empresa'
);

select throws_ok(
  $$insert into public.project_locations (company_id, client_id, project_id, location_id, status)
    values ('ab000000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000022',
            'ab000000-0000-0000-0000-000000000032', 'ab000000-0000-0000-0000-000000000042', 'active')$$,
  '23503',
  null,
  'una locación sin vínculo con el cliente no se asocia a su proyecto'
);

-- ---------------------------------------------------------------------------
-- Documentos: por cliente
-- ---------------------------------------------------------------------------

insert into public.location_attachments (
  location_id, client_id, company_id, storage_path, file_name, mime_type, size_bytes, category, uploaded_by
) values
  ('ab000000-0000-0000-0000-000000000041', 'ab000000-0000-0000-0000-000000000021',
   'ab000000-0000-0000-0000-000000000001', 'ab/a1.pdf', 'plano-a1.pdf', 'application/pdf', 100, 'general',
   'ab000000-0000-0000-0000-000000000011'),
  ('ab000000-0000-0000-0000-000000000041', 'ab000000-0000-0000-0000-000000000022',
   'ab000000-0000-0000-0000-000000000001', 'ab/a2.pdf', 'plano-a2.pdf', 'application/pdf', 100, 'general',
   'ab000000-0000-0000-0000-000000000011');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"ab000000-0000-0000-0000-000000000011","role":"authenticated"}';

select is(
  (select count(*)::integer from public.location_attachments
    where location_id = 'ab000000-0000-0000-0000-000000000041'),
  2,
  'AC-LOCSHARE-D: el gerente ve los documentos de los DOS clientes'
);

set local request.jwt.claims to
  '{"sub":"ab000000-0000-0000-0000-000000000013","role":"authenticated"}';

select is(
  (select string_agg(file_name, ',' order by file_name) from public.location_attachments
    where location_id = 'ab000000-0000-0000-0000-000000000041'),
  'plano-a2.pdf',
  'LOCSHARE-R4.2: el coordinador del proyecto de A2 ve sólo lo de A2, no lo que subió A1'
);

select is(
  (select count(*)::integer from public.locations
    where id = 'ab000000-0000-0000-0000-000000000041'),
  1,
  'pero la ficha de la locación sí la ve: la identidad es compartida'
);

select is(
  (select count(*)::integer from public.client_locations
    where location_id = 'ab000000-0000-0000-0000-000000000041'),
  1,
  'y ve el vínculo de SU cliente, no el de A1 (con su código)'
);

select throws_ok(
  $$insert into public.client_locations (location_id, company_id, client_id, external_ref, created_by)
    values ('ab000000-0000-0000-0000-000000000042', 'ab000000-0000-0000-0000-000000000001',
            'ab000000-0000-0000-0000-000000000022', null, 'ab000000-0000-0000-0000-000000000013')$$,
  '42501',
  null,
  'el coordinador no puede vincular locaciones: es del gerente'
);

set local request.jwt.claims to
  '{"sub":"ab000000-0000-0000-0000-000000000012","role":"authenticated"}';

select is(
  (select count(*)::integer from public.client_locations)
  + (select count(*)::integer from public.location_attachments),
  0,
  'LOCSHARE-R5.3: el gerente de otra empresa no ve ningún vínculo ni documento ajeno'
);

reset role;

-- ---------------------------------------------------------------------------
-- Superficie de funciones
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.can_read_location_client(uuid, uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.can_read_location_client(uuid, uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.create_origin_client_location()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.create_origin_client_location()', 'EXECUTE'),
  'la función de lectura por cliente no es anónima; los triggers no son ejecutables por nadie'
);

select * from finish();

rollback;

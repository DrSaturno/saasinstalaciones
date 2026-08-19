-- R2-IMP-03 / R2-QA-02: el lote de importación es gestión de empresa.
--
-- Sólo el gerente, y sólo el de su propia empresa. El coordinador opera órdenes
-- y el instalador ejecuta: ninguno de los dos carga proyectos, así que ninguno
-- debe ver los lotes ni el detalle por fila, que incluye los nombres y códigos
-- de todos los puntos de un cliente.

begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

select has_table('public', 'site_import_batches', 'existe la tabla de lotes');
select has_table('public', 'site_import_rows', 'existe el detalle por fila');

select is(
  (select relrowsecurity from pg_class where relname = 'site_import_batches'),
  true,
  'los lotes tienen RLS activa'
);
select is(
  (select relrowsecurity from pg_class where relname = 'site_import_rows'),
  true,
  'el detalle por fila tiene RLS activa'
);

-- El id del lote es un checksum, no un autogenerado: reintentar el mismo
-- archivo tiene que caer en la misma fila.
select col_is_pk(
  'public',
  'site_import_batches',
  'id',
  'el import_id es la clave primaria del lote'
);
select col_is_pk(
  'public',
  'site_import_rows',
  array['batch_id', 'row_number'],
  'cada fila de la planilla aparece una sola vez por lote'
);

-- ---------------------------------------------------------------------------
-- Fixture: dos empresas, cada una con su gerente y su lote.
-- ---------------------------------------------------------------------------

insert into public.companies (id, name, country, order_prefix) values
  ('b1000000-0000-0000-0000-000000000001', 'Empresa importadora A', 'AR', 'IMA'),
  ('b1000000-0000-0000-0000-000000000002', 'Empresa importadora B', 'AR', 'IMB');

-- El perfil no se inserta a mano: lo crea `handle_new_user` a partir de los
-- metadatos del usuario. Insertarlo aparte choca con la clave primaria, y
-- corregirlo después tampoco se puede, porque `prevent_privilege_change`
-- bloquea tocar `role`/`company_id` fuera del tablero maestro.
insert into auth.users (id, email, raw_user_meta_data) values
  (
    'b1000000-0000-0000-0000-000000000011', 'gerente.a.import@test.dev',
    '{"role":"company_manager","company_id":"b1000000-0000-0000-0000-000000000001"}'::jsonb
  ),
  (
    'b1000000-0000-0000-0000-000000000012', 'gerente.b.import@test.dev',
    '{"role":"company_manager","company_id":"b1000000-0000-0000-0000-000000000002"}'::jsonb
  ),
  (
    'b1000000-0000-0000-0000-000000000013', 'instalador.import@test.dev',
    '{"role":"installer"}'::jsonb
  );

insert into public.clients (id, company_id, name) values
  ('b1000000-0000-0000-0000-000000000021', 'b1000000-0000-0000-0000-000000000001', 'Cliente A'),
  ('b1000000-0000-0000-0000-000000000022', 'b1000000-0000-0000-0000-000000000002', 'Cliente B');

insert into public.projects (id, company_id, client_id, name, country, zones) values
  ('b1000000-0000-0000-0000-000000000031', 'b1000000-0000-0000-0000-000000000001',
   'b1000000-0000-0000-0000-000000000021', 'Proyecto A', 'AR', array['Buenos Aires']),
  ('b1000000-0000-0000-0000-000000000032', 'b1000000-0000-0000-0000-000000000002',
   'b1000000-0000-0000-0000-000000000022', 'Proyecto B', 'AR', array['Buenos Aires']);

insert into public.site_import_batches (id, company_id, project_id, checksum, created_by) values
  ('b1000000-0000-0000-0000-000000000041', 'b1000000-0000-0000-0000-000000000001',
   'b1000000-0000-0000-0000-000000000031', 'aaa', 'b1000000-0000-0000-0000-000000000011'),
  ('b1000000-0000-0000-0000-000000000042', 'b1000000-0000-0000-0000-000000000002',
   'b1000000-0000-0000-0000-000000000032', 'bbb', 'b1000000-0000-0000-0000-000000000012');

insert into public.site_import_rows (batch_id, row_number, company_id, name, outcome) values
  ('b1000000-0000-0000-0000-000000000041', 2, 'b1000000-0000-0000-0000-000000000001', 'Punto A', 'imported'),
  ('b1000000-0000-0000-0000-000000000042', 2, 'b1000000-0000-0000-0000-000000000002', 'Punto B', 'imported');

-- ---------------------------------------------------------------------------
-- Gerente A: ve lo suyo y nada más.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"b1000000-0000-0000-0000-000000000011","role":"authenticated"}';

select is(
  (select count(*)::integer from public.site_import_batches),
  1,
  'el gerente A ve únicamente su propio lote'
);
select is(
  (select count(*)::integer from public.site_import_rows),
  1,
  'el gerente A ve únicamente el detalle de su lote'
);

-- ---------------------------------------------------------------------------
-- Gerente B: el lote de la otra empresa no existe para él.
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"b1000000-0000-0000-0000-000000000012","role":"authenticated"}';

select is(
  (
    select count(*)::integer from public.site_import_batches
    where id = 'b1000000-0000-0000-0000-000000000041'
  ),
  0,
  'el gerente B no alcanza el lote de la empresa A'
);
select is(
  (
    select count(*)::integer from public.site_import_rows
    where batch_id = 'b1000000-0000-0000-0000-000000000041'
  ),
  0,
  'el gerente B no alcanza el detalle de la empresa A'
);

-- ---------------------------------------------------------------------------
-- Instalador: la importación no es asunto suyo en ninguna empresa.
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"b1000000-0000-0000-0000-000000000013","role":"authenticated"}';

select is(
  (select count(*)::integer from public.site_import_batches),
  0,
  'el instalador no ve ningún lote'
);
select is(
  (select count(*)::integer from public.site_import_rows),
  0,
  'el instalador no ve el detalle de ninguna importación'
);

reset role;

select * from finish();

rollback;

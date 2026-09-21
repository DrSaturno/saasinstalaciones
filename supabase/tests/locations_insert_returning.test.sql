-- El gerente puede dar de alta un local y recibirlo de vuelta.
--
-- `createSite` hace `insert().select()` sobre `locations`, o sea `INSERT …
-- RETURNING`, y eso exige que la fila nueva pase también la política de
-- LECTURA. La lectura dependía de `can_read_location(id)`, que vuelve a buscar
-- la fila en la tabla y no la encuentra durante su propia inserción: el alta
-- manual fallaba con 42501 para todas las empresas. Ver
-- `20260921000000_locations_manager_read_inline`.
--
-- Hasta este archivo ningún test insertaba un local como gerente: el pgTAP de
-- locaciones las crea como superusuario, que saltea la RLS.

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

insert into public.companies (id, name, country, order_prefix) values
  ('e3000000-0000-0000-0000-000000000001', 'Empresa Alta A', 'AR', 'EAA'),
  ('e3000000-0000-0000-0000-000000000002', 'Empresa Alta B', 'AR', 'EAB');

insert into auth.users (id, email, raw_app_meta_data) values
  ('e3000000-0000-0000-0000-000000000011', 'alta.ger.a@test.dev',
   '{"role":"company_manager","company_id":"e3000000-0000-0000-0000-000000000001"}'::jsonb),
  ('e3000000-0000-0000-0000-000000000012', 'alta.ger.b@test.dev',
   '{"role":"company_manager","company_id":"e3000000-0000-0000-0000-000000000002"}'::jsonb),
  ('e3000000-0000-0000-0000-000000000013', 'alta.inst@test.dev',
   '{"role":"installer"}'::jsonb);

insert into public.clients (id, company_id, name) values
  ('e3000000-0000-0000-0000-000000000021', 'e3000000-0000-0000-0000-000000000001', 'Cliente A');

set local role authenticated;

-- ---------------------------------------------------------------------------
-- El caso que estaba roto
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"e3000000-0000-0000-0000-000000000011","role":"authenticated"}';

select lives_ok(
  $q$insert into public.locations (
       id, company_id, client_id, name, address, city, state, zone, country, source, created_by
     ) values (
       'e3000000-0000-0000-0000-000000000031', 'e3000000-0000-0000-0000-000000000001',
       'e3000000-0000-0000-0000-000000000021', 'Local manual', 'Calle 1', 'La Plata',
       'Buenos Aires', 'Buenos Aires', 'AR', 'manual', auth.uid()
     ) returning id$q$,
  'el gerente da de alta un local y lo recibe de vuelta (INSERT … RETURNING)'
);

select is(
  (select count(*)::int from public.locations
    where id = 'e3000000-0000-0000-0000-000000000031'),
  1,
  'y después lo sigue viendo'
);

-- ---------------------------------------------------------------------------
-- El arreglo no abre nada: quién ve qué sigue igual
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"e3000000-0000-0000-0000-000000000012","role":"authenticated"}';

select is(
  (select count(*)::int from public.locations
    where id = 'e3000000-0000-0000-0000-000000000031'),
  0,
  'el gerente de otra empresa no ve el local'
);

select throws_ok(
  $q$insert into public.locations (
       id, company_id, client_id, name, source, created_by
     ) values (
       gen_random_uuid(), 'e3000000-0000-0000-0000-000000000001',
       'e3000000-0000-0000-0000-000000000021', 'Intruso', 'manual', auth.uid()
     )$q$,
  '42501',
  null,
  'ni puede crear locales en una empresa ajena'
);

set local request.jwt.claims to
  '{"sub":"e3000000-0000-0000-0000-000000000013","role":"authenticated"}';

select is(
  (select count(*)::int from public.locations
    where id = 'e3000000-0000-0000-0000-000000000031'),
  0,
  'un instalador sin trabajo en ese local no lo ve'
);

-- La condición nueva conserva el corte por empresa suspendida que ya tenía
-- `can_read_location`.
reset role;
update public.companies set status = 'suspended'
 where id = 'e3000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"e3000000-0000-0000-0000-000000000011","role":"authenticated"}';

select is(
  (select count(*)::int from public.locations
    where id = 'e3000000-0000-0000-0000-000000000031'),
  0,
  'con la empresa suspendida, su gerente deja de verlo'
);

select * from finish();
rollback;

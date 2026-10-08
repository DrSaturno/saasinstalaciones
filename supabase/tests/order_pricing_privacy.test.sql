-- Privacidad de importes (PRIV-*, docs/specs/2026-09-24-privacidad-de-importes).
--
-- Cubre tres cosas que el 24-09-2026 estaban rotas y que el estado anterior de
-- este archivo habría detectado:
--
--   1. Un instalador leía `work_orders.amount` y `projects.contract_amount`
--      (lo que la empresa cobra al cliente). Ahora esos importes viven en
--      `work_order_pricing` / `project_pricing`, que sólo ve el gerente.
--   2. Un instalador podía ESCRIBIR `installer_amount` y `payment_status` de sus
--      propias órdenes: el UPDATE afectaba todas sus filas sin error.
--   3. El coordinador ve lo mismo que un instalador en lo comercial: nada.
--
-- Los montos están elegidos para que se note si algo se filtra.

begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

-- ---------------------------------------------------------------------------
-- Estructura
-- ---------------------------------------------------------------------------

select has_table('public', 'work_order_pricing', 'existe la tabla de precios de órdenes');
select has_table('public', 'project_pricing', 'existe la tabla de precios de proyectos');

select is(
  (select relrowsecurity from pg_class where relname = 'work_order_pricing'),
  true,
  'work_order_pricing tiene RLS activa'
);

select is(
  (select relrowsecurity from pg_class where relname = 'project_pricing'),
  true,
  'project_pricing tiene RLS activa'
);

-- ---------------------------------------------------------------------------
-- Fixture: dos empresas; en A un gerente, un instalador puro y un coordinador.
-- ---------------------------------------------------------------------------

insert into public.companies (id, name, country, order_prefix) values
  ('e1000000-0000-0000-0000-000000000001', 'Empresa A', 'AR', 'PRA'),
  ('e1000000-0000-0000-0000-000000000002', 'Empresa B', 'AR', 'PRB');

insert into auth.users (id, email, raw_app_meta_data) values
  ('e1000000-0000-0000-0000-000000000011', 'gerente.a@test.dev',
   '{"role":"company_manager","company_id":"e1000000-0000-0000-0000-000000000001"}'::jsonb),
  ('e1000000-0000-0000-0000-000000000012', 'gerente.b@test.dev',
   '{"role":"company_manager","company_id":"e1000000-0000-0000-0000-000000000002"}'::jsonb),
  ('e1000000-0000-0000-0000-000000000013', 'instalador@test.dev',
   '{"role":"installer"}'::jsonb),
  ('e1000000-0000-0000-0000-000000000014', 'coordinador@test.dev',
   '{"role":"installer"}'::jsonb);

insert into public.company_installers (company_id, installer_id, status, joined_at, role) values
  ('e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000013', 'active', now(), 'installer'),
  ('e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000014', 'active', now(), 'coordinator');

insert into public.clients (id, company_id, name) values
  ('e1000000-0000-0000-0000-000000000021', 'e1000000-0000-0000-0000-000000000001', 'Cliente A');

insert into public.projects (id, company_id, client_id, name, country, zones, contract_amount) values
  ('e1000000-0000-0000-0000-000000000031', 'e1000000-0000-0000-0000-000000000001',
   'e1000000-0000-0000-0000-000000000021', 'Proyecto A', 'AR', array['Buenos Aires'], 9000);

insert into public.sites (id, project_id, company_id, name) values
  ('e1000000-0000-0000-0000-000000000041', 'e1000000-0000-0000-0000-000000000031',
   'e1000000-0000-0000-0000-000000000001', 'Punto A');

-- La empresa cobra 500 y al instalador le paga 50. Se inserta como servicio (sin
-- sesión): el desvío de compatibilidad manda el importe a la tabla de precios.
insert into public.work_orders (
  id, site_id, project_id, company_id, title, assigned_installer_id, amount, installer_amount
) values
  ('e1000000-0000-0000-0000-000000000051', 'e1000000-0000-0000-0000-000000000041',
   'e1000000-0000-0000-0000-000000000031', 'e1000000-0000-0000-0000-000000000001',
   'Trabajo del instalador', 'e1000000-0000-0000-0000-000000000013', 500, 50);

select is(
  (select amount from public.work_order_pricing
   where order_id = 'e1000000-0000-0000-0000-000000000051'),
  500.00,
  'el importe de la orden quedó en work_order_pricing'
);

select is(
  (select amount from public.work_orders
   where id = 'e1000000-0000-0000-0000-000000000051'),
  null,
  'y la columna vieja de work_orders quedó vacía: no hay dónde filtrarlo'
);

select is(
  (select contract_amount from public.project_pricing
   where project_id = 'e1000000-0000-0000-0000-000000000031'),
  9000.00,
  'el monto de contrato del proyecto quedó en project_pricing'
);

-- ---------------------------------------------------------------------------
-- El instalador asignado
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"e1000000-0000-0000-0000-000000000013","role":"authenticated"}';

select is(
  (select count(*)::integer from public.work_order_pricing),
  0,
  'PRIV-R1.1: el instalador no ve ningún importe comercial de órdenes'
);

select is(
  (select count(*)::integer from public.project_pricing),
  0,
  'PRIV-R1.1: el instalador no ve el monto de contrato del proyecto'
);

select is(
  (select amount from public.installer_earnings
   where order_id = 'e1000000-0000-0000-0000-000000000051'),
  50.00,
  'PRIV-R1.2: sí ve su propia paga (50), no lo que cobra la empresa (500)'
);

select throws_ok(
  $$insert into public.work_order_pricing (order_id, company_id, amount)
    values ('e1000000-0000-0000-0000-000000000051',
            'e1000000-0000-0000-0000-000000000001', 1)$$,
  '42501',
  null,
  'PRIV-R2.1: el instalador no puede cargar un importe comercial'
);

select throws_ok(
  $$update public.work_orders set installer_amount = 999999
    where id = 'e1000000-0000-0000-0000-000000000051'$$,
  '42501',
  null,
  'PRIV-R2.1: el instalador no puede fijarse su propia paga'
);

select throws_ok(
  $$update public.work_orders set payment_status = 'paid'
    where id = 'e1000000-0000-0000-0000-000000000051'$$,
  '42501',
  null,
  'PRIV-R2.1: el instalador no puede marcarse como pagado'
);

select throws_ok(
  $$update public.work_orders set amount = 1
    where id = 'e1000000-0000-0000-0000-000000000051'$$,
  '42501',
  null,
  'PRIV-R2.1: el instalador no puede escribir el importe comercial'
);

select throws_ok(
  $$update public.work_orders
    set assigned_installer_id = 'e1000000-0000-0000-0000-000000000014'
    where id = 'e1000000-0000-0000-0000-000000000051'$$,
  '42501',
  null,
  'PRIV-R2.2: el instalador no puede reasignarse la orden'
);

select lives_ok(
  $$update public.work_orders set installer_accepted_at = now()
    where id = 'e1000000-0000-0000-0000-000000000051'$$,
  'PRIV-R2.2: sí puede aceptar su orden (la lista blanca no rompe el flujo de campo)'
);

-- ---------------------------------------------------------------------------
-- El coordinador (instalador con más funciones): tampoco ve lo comercial
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"e1000000-0000-0000-0000-000000000014","role":"authenticated"}';

select is(
  (select count(*)::integer from public.work_order_pricing),
  0,
  'PRIV-R1.4: el coordinador no ve importes comerciales de órdenes'
);

select is(
  (select count(*)::integer from public.project_pricing),
  0,
  'PRIV-R1.4: el coordinador no ve el monto de contrato'
);

-- ---------------------------------------------------------------------------
-- El gerente de la empresa: sigue operando igual
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"e1000000-0000-0000-0000-000000000011","role":"authenticated"}';

select is(
  (select amount from public.work_order_pricing
   where order_id = 'e1000000-0000-0000-0000-000000000051'),
  500.00,
  'PRIV-R4.1: el gerente ve el importe de sus órdenes'
);

update public.work_orders set amount = 700
where id = 'e1000000-0000-0000-0000-000000000051';

select is(
  (select amount from public.work_order_pricing
   where order_id = 'e1000000-0000-0000-0000-000000000051'),
  700.00,
  'PRIV-R4.1: el gerente edita el importe como siempre (el desvío lo guarda en la tabla)'
);

update public.work_orders set amount = null
where id = 'e1000000-0000-0000-0000-000000000051';

select is(
  (select count(*)::integer from public.work_order_pricing
   where order_id = 'e1000000-0000-0000-0000-000000000051'),
  0,
  'PRIV-R4.1: limpiar el importe borra la fila de precios'
);

select lives_ok(
  $$update public.work_orders set installer_amount = 80
    where id = 'e1000000-0000-0000-0000-000000000051'$$,
  'PRIV-R4.1: el gerente sí ajusta lo que le paga al instalador'
);

-- ---------------------------------------------------------------------------
-- El gerente de OTRA empresa: nada de lo ajeno
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"e1000000-0000-0000-0000-000000000012","role":"authenticated"}';

select is(
  (select count(*)::integer from public.work_order_pricing)
  + (select count(*)::integer from public.project_pricing),
  0,
  'RLS: el gerente de otra empresa no ve importes ajenos'
);

select throws_ok(
  $$insert into public.work_order_pricing (order_id, company_id, amount)
    values ('e1000000-0000-0000-0000-000000000051',
            'e1000000-0000-0000-0000-000000000001', 1)$$,
  '42501',
  null,
  'RLS: el gerente de otra empresa no puede escribir importes ajenos'
);

reset role;

-- ---------------------------------------------------------------------------
-- Superficie de funciones
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.divert_order_amount()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.divert_order_amount()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.divert_project_contract_amount()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.divert_project_contract_amount()', 'EXECUTE'),
  'los desvíos (security definer) no son ejecutables por anon ni authenticated'
);

select * from finish();

rollback;

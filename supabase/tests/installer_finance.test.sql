-- Finanzas: la plata de cada uno es de cada uno.
--
-- Dos reglas que se cruzan y que por eso conviene probar juntas:
--
--   1. El instalador ve lo suyo de TODAS las empresas para las que trabaja.
--      Es multiempresa a propósito — trabaja para A y para B, y quiere su
--      ingreso completo en una sola pantalla.
--   2. La empresa ve lo de SUS órdenes y nada más. Ni siquiera puede usar el
--      perfil de un instalador propio para espiar lo que ese mismo instalador
--      cobró trabajando para otra empresa.
--
-- La tentación al escribir la política del instalador es filtrarla por empresa
-- «por seguridad»; eso rompe la regla 1, porque un instalador no tiene una
-- empresa singular. El caso cruzado de abajo existe para atrapar ese error.

begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- ---------------------------------------------------------------------------
-- Estructura
-- ---------------------------------------------------------------------------

select has_table('public', 'order_payment_events', 'existe el historial de pagos');
select has_column('public', 'work_orders', 'installer_amount', 'la orden guarda el costo del instalador');
select has_column('public', 'work_orders', 'payment_status', 'la orden guarda su estado de cobro');
select has_column('public', 'company_installers', 'default_installer_rate', 'el roster guarda la tarifa sugerida');

select is(
  (select relrowsecurity from pg_class where relname = 'order_payment_events'),
  true,
  'el historial de pagos tiene RLS activa'
);

select is(
  (
    select count(*)::integer from pg_views
    where schemaname = 'public' and viewname = 'installer_earnings'
  ),
  1,
  'existe la vista de ingresos del instalador'
);

-- ---------------------------------------------------------------------------
-- Fixture: dos empresas, un instalador que trabaja para las dos, y un tercero.
-- ---------------------------------------------------------------------------

insert into public.companies (id, name, country, order_prefix) values
  ('d1000000-0000-0000-0000-000000000001', 'Empresa A', 'AR', 'EMA'),
  ('d1000000-0000-0000-0000-000000000002', 'Empresa B', 'AR', 'EMB');

-- El perfil lo crea `handle_new_user` desde los metadatos; insertarlo aparte
-- choca con la clave primaria y corregirlo después lo bloquea
-- `prevent_privilege_change`.
insert into auth.users (id, email, raw_user_meta_data) values
  ('d1000000-0000-0000-0000-000000000011', 'gerente.a@test.dev',
   '{"role":"company_manager","company_id":"d1000000-0000-0000-0000-000000000001"}'::jsonb),
  ('d1000000-0000-0000-0000-000000000012', 'gerente.b@test.dev',
   '{"role":"company_manager","company_id":"d1000000-0000-0000-0000-000000000002"}'::jsonb),
  ('d1000000-0000-0000-0000-000000000013', 'instalador.dual@test.dev',
   '{"role":"installer"}'::jsonb),
  ('d1000000-0000-0000-0000-000000000014', 'instalador.ajeno@test.dev',
   '{"role":"installer"}'::jsonb);

-- El dual está activo en las dos empresas: es la situación que el producto
-- permite y que la política tiene que respetar.
insert into public.company_installers (company_id, installer_id, status, joined_at) values
  ('d1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000013', 'active', now()),
  ('d1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000013', 'active', now()),
  ('d1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000014', 'active', now());

insert into public.clients (id, company_id, name) values
  ('d1000000-0000-0000-0000-000000000021', 'd1000000-0000-0000-0000-000000000001', 'Cliente A'),
  ('d1000000-0000-0000-0000-000000000022', 'd1000000-0000-0000-0000-000000000002', 'Cliente B');

insert into public.projects (id, company_id, client_id, name, country, zones) values
  ('d1000000-0000-0000-0000-000000000031', 'd1000000-0000-0000-0000-000000000001',
   'd1000000-0000-0000-0000-000000000021', 'Proyecto A', 'AR', array['Buenos Aires']),
  ('d1000000-0000-0000-0000-000000000032', 'd1000000-0000-0000-0000-000000000002',
   'd1000000-0000-0000-0000-000000000022', 'Proyecto B', 'AR', array['Buenos Aires']);

insert into public.sites (id, project_id, company_id, name) values
  ('d1000000-0000-0000-0000-000000000041', 'd1000000-0000-0000-0000-000000000031',
   'd1000000-0000-0000-0000-000000000001', 'Punto A'),
  ('d1000000-0000-0000-0000-000000000042', 'd1000000-0000-0000-0000-000000000032',
   'd1000000-0000-0000-0000-000000000002', 'Punto B'),
  ('d1000000-0000-0000-0000-000000000043', 'd1000000-0000-0000-0000-000000000031',
   'd1000000-0000-0000-0000-000000000001', 'Punto A2');

-- Los montos están elegidos para que se note la diferencia si algo se filtra:
-- la empresa cobra 500, al instalador le paga 50.
insert into public.work_orders (
  id, site_id, project_id, company_id, title, assigned_installer_id, amount, installer_amount
) values
  ('d1000000-0000-0000-0000-000000000051', 'd1000000-0000-0000-0000-000000000041',
   'd1000000-0000-0000-0000-000000000031', 'd1000000-0000-0000-0000-000000000001',
   'Trabajo del dual en A', 'd1000000-0000-0000-0000-000000000013', 500, 50),
  ('d1000000-0000-0000-0000-000000000052', 'd1000000-0000-0000-0000-000000000042',
   'd1000000-0000-0000-0000-000000000032', 'd1000000-0000-0000-0000-000000000002',
   'Trabajo del dual en B', 'd1000000-0000-0000-0000-000000000013', 900, 90),
  ('d1000000-0000-0000-0000-000000000053', 'd1000000-0000-0000-0000-000000000043',
   'd1000000-0000-0000-0000-000000000031', 'd1000000-0000-0000-0000-000000000001',
   'Trabajo del ajeno en A', 'd1000000-0000-0000-0000-000000000014', 700, 70);

insert into public.order_payment_events (order_id, company_id, status, note) values
  ('d1000000-0000-0000-0000-000000000051', 'd1000000-0000-0000-0000-000000000001', 'paid', 'cobrado A'),
  ('d1000000-0000-0000-0000-000000000052', 'd1000000-0000-0000-0000-000000000002', 'paid', 'cobrado B'),
  ('d1000000-0000-0000-0000-000000000053', 'd1000000-0000-0000-0000-000000000001', 'paid', 'cobrado ajeno');

-- ---------------------------------------------------------------------------
-- El instalador que trabaja para dos empresas
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"d1000000-0000-0000-0000-000000000013","role":"authenticated"}';

select is(
  (select count(*)::integer from public.order_payment_events),
  2,
  'el instalador ve sus cobros de las DOS empresas, no de una sola'
);

select is(
  (
    select count(*)::integer from public.order_payment_events
    where order_id = 'd1000000-0000-0000-0000-000000000053'
  ),
  0,
  'el instalador no ve el cobro de un trabajo de otro instalador'
);

-- Lo que ve de plata es lo suyo, nunca lo que la empresa le cobra al cliente.
select is(
  (
    select sum(amount)::integer from public.installer_earnings
    where assigned_installer_id = 'd1000000-0000-0000-0000-000000000013'
  ),
  140,
  'la vista le muestra su propio pago (50 + 90), no el ingreso de la empresa (500 + 900)'
);

select throws_ok(
  $$insert into public.order_payment_events (order_id, company_id, status)
    values ('d1000000-0000-0000-0000-000000000051',
            'd1000000-0000-0000-0000-000000000001', 'pending')$$,
  '42501',
  null,
  'el instalador no puede tocar el estado de cobro: eso lo decide la empresa'
);

-- ---------------------------------------------------------------------------
-- La empresa A: lo suyo y nada más
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"d1000000-0000-0000-0000-000000000011","role":"authenticated"}';

select is(
  (select count(*)::integer from public.order_payment_events),
  2,
  'la empresa A ve los cobros de sus dos órdenes'
);

-- El caso explícito del pedido: el mismo instalador trabaja para A y para B, y
-- A no puede usar eso como puerta para ver la plata de B.
select is(
  (
    select count(*)::integer from public.order_payment_events
    where order_id = 'd1000000-0000-0000-0000-000000000052'
  ),
  0,
  'la empresa A no ve lo que su propio instalador cobró trabajando para B'
);

set local request.jwt.claims to
  '{"sub":"d1000000-0000-0000-0000-000000000012","role":"authenticated"}';

select is(
  (
    select count(*)::integer from public.order_payment_events
    where company_id = 'd1000000-0000-0000-0000-000000000001'
  ),
  0,
  'la empresa B no alcanza ningún cobro de la empresa A'
);

-- ---------------------------------------------------------------------------
-- La tarifa sugerida es del roster de cada empresa
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"d1000000-0000-0000-0000-000000000013","role":"authenticated"}';

-- Un UPDATE que la RLS no autoriza no lanza error: simplemente no encuentra la
-- fila y afecta cero. Por eso se comprueba el efecto, no la excepción.
update public.company_installers
set default_installer_rate = 999
where installer_id = 'd1000000-0000-0000-0000-000000000013'
  and company_id = 'd1000000-0000-0000-0000-000000000001';

select is(
  (
    select default_installer_rate from public.company_installers
    where installer_id = 'd1000000-0000-0000-0000-000000000013'
      and company_id = 'd1000000-0000-0000-0000-000000000001'
  ),
  null,
  'el instalador no se fija su propia tarifa'
);

reset role;

select * from finish();

rollback;

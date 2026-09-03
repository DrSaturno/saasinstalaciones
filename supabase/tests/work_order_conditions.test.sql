-- Fase 0 de reputación: la taxonomía de condiciones.
--
-- Dos casos son los que justifican el archivo entero:
--
-- 1. **El instalador lee y no escribe.** Si pudiera declarar las condiciones de
--    su propio trabajo, el reconocimiento por "aceptó un trabajo complejo" lo
--    firmaría el mismo que lo cobra. Es el equivalente acá de la regla de no
--    autoaprobación.
-- 2. **`exterior` y `flete` no entran.** Viven en columnas de `work_orders` y
--    se derivan al leer. Si además se pudieran declarar acá, habría dos fuentes
--    de verdad para el mismo hecho y la dificultad dependería de cuál se miró.

begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

insert into public.companies (id, name, country, order_prefix) values
  ('f1000000-0000-0000-0000-000000000001', 'Empresa Condiciones', 'AR', 'ECO'),
  ('f1000000-0000-0000-0000-000000000002', 'Empresa Ajena', 'AR', 'EAJ');

insert into auth.users (id, email, raw_user_meta_data) values
  ('f1000000-0000-0000-0000-000000000011', 'gerente.cond@test.dev',
   '{"role":"company_manager","company_id":"f1000000-0000-0000-0000-000000000001"}'::jsonb),
  ('f1000000-0000-0000-0000-000000000012', 'instalador.cond@test.dev',
   '{"role":"installer"}'::jsonb),
  ('f1000000-0000-0000-0000-000000000013', 'coordinador.cond@test.dev',
   '{"role":"installer"}'::jsonb),
  ('f1000000-0000-0000-0000-000000000014', 'otro.instalador@test.dev',
   '{"role":"installer"}'::jsonb),
  ('f1000000-0000-0000-0000-000000000015', 'gerente.ajeno@test.dev',
   '{"role":"company_manager","company_id":"f1000000-0000-0000-0000-000000000002"}'::jsonb);

insert into public.installers (id, zones) values
  ('f1000000-0000-0000-0000-000000000012', array['AR-BA-AMBA']),
  ('f1000000-0000-0000-0000-000000000013', array['AR-BA-AMBA']),
  ('f1000000-0000-0000-0000-000000000014', array['AR-BA-AMBA'])
on conflict (id) do nothing;

insert into public.company_installers (company_id, installer_id, role, status, joined_at) values
  ('f1000000-0000-0000-0000-000000000001',
   'f1000000-0000-0000-0000-000000000012', 'installer', 'active', now()),
  ('f1000000-0000-0000-0000-000000000001',
   'f1000000-0000-0000-0000-000000000013', 'coordinator', 'active', now()),
  ('f1000000-0000-0000-0000-000000000001',
   'f1000000-0000-0000-0000-000000000014', 'installer', 'active', now());

insert into public.company_membership_roles (company_id, user_id, role) values
  ('f1000000-0000-0000-0000-000000000001',
   'f1000000-0000-0000-0000-000000000012', 'installer'),
  ('f1000000-0000-0000-0000-000000000001',
   'f1000000-0000-0000-0000-000000000013', 'coordinator'),
  ('f1000000-0000-0000-0000-000000000001',
   'f1000000-0000-0000-0000-000000000014', 'installer')
on conflict do nothing;

insert into public.projects (id, company_id, name, coordinator_id) values
  ('f1000000-0000-0000-0000-000000000021',
   'f1000000-0000-0000-0000-000000000001', 'Proyecto Condiciones',
   'f1000000-0000-0000-0000-000000000013');

insert into public.sites (id, project_id, company_id, name) values
  ('f1000000-0000-0000-0000-000000000031',
   'f1000000-0000-0000-0000-000000000021',
   'f1000000-0000-0000-0000-000000000001', 'Punto Condiciones');

insert into public.work_orders (
  id, company_id, project_id, site_id, order_number, title,
  assigned_installer_id, status
) values (
  'f1000000-0000-0000-0000-000000000041', 'f1000000-0000-0000-0000-000000000001',
  'f1000000-0000-0000-0000-000000000021', 'f1000000-0000-0000-0000-000000000031',
  'ECO-0001', 'Cartel en altura, de noche',
  'f1000000-0000-0000-0000-000000000012', 'pendiente'
);

-- ---------------------------------------------------------------------------
-- Qué se puede declarar
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"f1000000-0000-0000-0000-000000000011","role":"authenticated"}';

select lives_ok(
  $q$insert into public.work_order_conditions (order_id, company_id, condition)
     values ('f1000000-0000-0000-0000-000000000041',
             'f1000000-0000-0000-0000-000000000001', 'altura')$q$,
  'la empresa declara una condición de su propia orden'
);

select throws_ok(
  $q$insert into public.work_order_conditions (order_id, company_id, condition)
     values ('f1000000-0000-0000-0000-000000000041',
             'f1000000-0000-0000-0000-000000000001', 'exterior')$q$,
  '23514',
  null,
  'exterior no se declara: vive en work_orders.indoor y se deriva al leer'
);

select throws_ok(
  $q$insert into public.work_order_conditions (order_id, company_id, condition)
     values ('f1000000-0000-0000-0000-000000000041',
             'f1000000-0000-0000-0000-000000000001', 'flete')$q$,
  '23514',
  null,
  'flete tampoco: ya es requires_freight'
);

select throws_ok(
  $q$insert into public.work_order_conditions (order_id, company_id, condition)
     values ('f1000000-0000-0000-0000-000000000041',
             'f1000000-0000-0000-0000-000000000001', 'muy_dificil')$q$,
  '23514',
  null,
  'no se inventan condiciones fuera del catálogo'
);

select throws_ok(
  $q$insert into public.work_order_conditions (order_id, company_id, condition)
     values ('f1000000-0000-0000-0000-000000000041',
             'f1000000-0000-0000-0000-000000000001', 'altura')$q$,
  '23505',
  null,
  'la misma condición dos veces no infla la dificultad'
);

-- Ni siquiera la empresa MUTA una condición: se agrega o se quita.
--
-- Si pudiera, cambiaría el qué conservando el cuándo, y la Fase 1 compara esa
-- fecha con la de aceptación para reconocer a quien aceptó sabiendo. Sería
-- fabricar el reconocimiento después del hecho.
select throws_ok(
  $q$update public.work_order_conditions set condition = 'nocturno'
     where order_id = 'f1000000-0000-0000-0000-000000000041'$q$,
  '42501',
  null,
  'una condición no se transforma en otra conservando su fecha'
);

-- ---------------------------------------------------------------------------
-- La empresa de la condición no puede divergir de la de la orden
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"f1000000-0000-0000-0000-000000000015","role":"authenticated"}';

select throws_ok(
  $q$insert into public.work_order_conditions (order_id, company_id, condition)
     values ('f1000000-0000-0000-0000-000000000041',
             'f1000000-0000-0000-0000-000000000002', 'nocturno')$q$,
  '23503',
  null,
  'la FK compuesta impide colgarle una condición a la orden de otra empresa'
);

select is(
  (select count(*)::integer from public.work_order_conditions),
  0,
  'y esa empresa tampoco ve las condiciones ajenas'
);

-- ---------------------------------------------------------------------------
-- El coordinador del proyecto sí declara
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"f1000000-0000-0000-0000-000000000013","role":"authenticated"}';

select lives_ok(
  $q$insert into public.work_order_conditions (order_id, company_id, condition)
     values ('f1000000-0000-0000-0000-000000000041',
             'f1000000-0000-0000-0000-000000000001', 'nocturno')$q$,
  'el coordinador del proyecto declara condiciones'
);

-- ---------------------------------------------------------------------------
-- El instalador: lee y no escribe
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"f1000000-0000-0000-0000-000000000012","role":"authenticated"}';

select is(
  (select count(*)::integer from public.work_order_conditions
   where order_id = 'f1000000-0000-0000-0000-000000000041'),
  2,
  'el asignado ve las condiciones: aceptar sabiendo es la premisa del reconocimiento'
);

select throws_ok(
  $q$insert into public.work_order_conditions (order_id, company_id, condition)
     values ('f1000000-0000-0000-0000-000000000041',
             'f1000000-0000-0000-0000-000000000001', 'gran_formato')$q$,
  '42501',
  null,
  'pero no se declara a sí mismo un trabajo complejo'
);

set local request.jwt.claims to
  '{"sub":"f1000000-0000-0000-0000-000000000014","role":"authenticated"}';

select is(
  (select count(*)::integer from public.work_order_conditions),
  0,
  'un instalador de la empresa que no está asignado a esa orden no las ve'
);

reset role;

-- ---------------------------------------------------------------------------
-- Ciclo de vida
-- ---------------------------------------------------------------------------

delete from public.work_orders where id = 'f1000000-0000-0000-0000-000000000041';

select is(
  (select count(*)::integer from public.work_order_conditions),
  0,
  'borrada la orden, sus condiciones no quedan colgando'
);

select * from finish();

rollback;

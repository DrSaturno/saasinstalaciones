-- Bloque 5 (docs/specs/2026-09-24-multi-instalador): varios instaladores por
-- trabajo, hasta 15.
--
-- Diseño aditivo: el responsable de una orden sigue siendo exactamente
-- `work_orders.assigned_installer_id`, sin cambios. Estas pruebas cubren lo
-- nuevo — `work_order_team_members`, el gate para ayudantes, el acceso
-- extendido y la plata por persona — y confirman que una orden SIN ayudantes
-- se comporta exactamente igual que antes de este bloque.

begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

-- ---------------------------------------------------------------------------
-- Estructura
-- ---------------------------------------------------------------------------

select has_table('public', 'work_order_team_members', 'existe el plantel de ayudantes');
select is(
  (select relrowsecurity from pg_class where relname = 'work_order_team_members'),
  true,
  'work_order_team_members tiene RLS activa'
);
select has_column('public', 'work_orders', 'required_installers', 'la orden guarda cuántos instaladores necesita');
select has_column('public', 'order_payment_events', 'installer_id', 'el historial de pago distingue por instalador');

-- ---------------------------------------------------------------------------
-- Fixture: empresa A (responsable + candidatos) y empresa B (para cruces)
-- ---------------------------------------------------------------------------

insert into public.companies (id, name, country, order_prefix) values
  ('f1000000-0000-0000-0000-000000000001', 'Empresa A', 'AR', 'MIA'),
  ('f1000000-0000-0000-0000-000000000002', 'Empresa B', 'AR', 'MIB');

insert into auth.users (id, email, raw_app_meta_data) values
  ('f1000000-0000-0000-0000-000000000011', 'gerente.a@test.dev',
   '{"role":"company_manager","company_id":"f1000000-0000-0000-0000-000000000001","is_owner":true}'::jsonb),
  ('f1000000-0000-0000-0000-000000000012', 'gerente.b@test.dev',
   '{"role":"company_manager","company_id":"f1000000-0000-0000-0000-000000000002","is_owner":true}'::jsonb),
  ('f1000000-0000-0000-0000-000000000013', 'lead@test.dev', '{"role":"installer"}'::jsonb),
  ('f1000000-0000-0000-0000-000000000014', 'ayudante@test.dev', '{"role":"installer"}'::jsonb),
  ('f1000000-0000-0000-0000-000000000015', 'inelegible@test.dev', '{"role":"installer"}'::jsonb),
  ('f1000000-0000-0000-0000-000000000016', 'ocupado@test.dev', '{"role":"installer"}'::jsonb),
  ('f1000000-0000-0000-0000-000000000017', 'ajeno@test.dev', '{"role":"installer"}'::jsonb);

-- 13: lead, activo en A. 14: ayudante candidato, activo en A. 15: NO activo en
-- A (para NOT_ELIGIBLE). 16: activo en A y en B (dual, para SCHEDULE_CONFLICT
-- cruzando empresas). 17: activo en B únicamente (para "no ve nada" — nunca
-- tocó la orden de A).
insert into public.company_installers (company_id, installer_id, status, joined_at) values
  ('f1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000013', 'active', now()),
  ('f1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000014', 'active', now()),
  ('f1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000016', 'active', now()),
  ('f1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000016', 'active', now()),
  ('f1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000017', 'active', now());

insert into public.clients (id, company_id, name) values
  ('f1000000-0000-0000-0000-000000000021', 'f1000000-0000-0000-0000-000000000001', 'Cliente A'),
  ('f1000000-0000-0000-0000-000000000022', 'f1000000-0000-0000-0000-000000000002', 'Cliente B');

insert into public.projects (id, company_id, client_id, name, country, zones) values
  ('f1000000-0000-0000-0000-000000000031', 'f1000000-0000-0000-0000-000000000001',
   'f1000000-0000-0000-0000-000000000021', 'Proyecto A', 'AR', array['Buenos Aires']),
  ('f1000000-0000-0000-0000-000000000032', 'f1000000-0000-0000-0000-000000000002',
   'f1000000-0000-0000-0000-000000000022', 'Proyecto B', 'AR', array['Buenos Aires']);

insert into public.sites (id, project_id, company_id, name) values
  ('f1000000-0000-0000-0000-000000000041', 'f1000000-0000-0000-0000-000000000031',
   'f1000000-0000-0000-0000-000000000001', 'Punto A'),
  ('f1000000-0000-0000-0000-000000000042', 'f1000000-0000-0000-0000-000000000032',
   'f1000000-0000-0000-0000-000000000002', 'Punto B');

-- La orden de A ya tiene responsable (f1..13) y pide 2 instaladores. Aceptada
-- y planificada para poder probar más adelante la regla de transición.
insert into public.work_orders (
  id, site_id, project_id, company_id, title, assigned_installer_id,
  installer_amount, status, installer_accepted_at, required_installers
) values (
  'f1000000-0000-0000-0000-000000000051', 'f1000000-0000-0000-0000-000000000041',
  'f1000000-0000-0000-0000-000000000031', 'f1000000-0000-0000-0000-000000000001',
  'Trabajo en equipo', 'f1000000-0000-0000-0000-000000000013', 50,
  'planificada', now(), 2
);

-- La orden de B, con f1..16 ya trabajando ahí en un horario exacto: es lo que
-- hace que agregarlo a la orden de A choque por solapamiento.
insert into public.work_orders (
  id, site_id, project_id, company_id, title, assigned_installer_id, status
) values (
  'f1000000-0000-0000-0000-000000000052', 'f1000000-0000-0000-0000-000000000042',
  'f1000000-0000-0000-0000-000000000032', 'f1000000-0000-0000-0000-000000000002',
  'Trabajo en B', 'f1000000-0000-0000-0000-000000000016', 'planificada'
);

select public.create_order_activities('f1000000-0000-0000-0000-000000000051', false, true);
select public.create_order_activities('f1000000-0000-0000-0000-000000000052', false, true);

-- Actividad de A: horario exacto para poder chocar contra la de B.
update public.work_activities
set scheduled_start_at = '2026-10-01 09:00:00-03',
    scheduled_end_at = '2026-10-01 12:00:00-03',
    schedule_precision = 'exact',
    timezone = 'America/Argentina/Buenos_Aires'
where work_order_id = 'f1000000-0000-0000-0000-000000000051'
  and activity_type = 'execution';

update public.work_activities
set scheduled_start_at = '2026-10-01 10:00:00-03',
    scheduled_end_at = '2026-10-01 13:00:00-03',
    schedule_precision = 'exact',
    timezone = 'America/Argentina/Buenos_Aires'
where work_order_id = 'f1000000-0000-0000-0000-000000000052'
  and activity_type = 'execution';

-- La fila de agenda del responsable de A y de f1..16 en B, para que el gate
-- tenga algo contra qué comparar (en producción las crea `assign_installer_gate`;
-- acá se insertan directo porque el fixture no pasa por sesión de usuario).
insert into public.work_assignments (
  company_id, activity_id, installer_id, version, status,
  schedule_precision, scheduled_start_at, scheduled_end_at, timezone
)
select
  'f1000000-0000-0000-0000-000000000001', a.id, 'f1000000-0000-0000-0000-000000000013',
  1, 'active', a.schedule_precision, a.scheduled_start_at, a.scheduled_end_at, a.timezone
from public.work_activities a
where a.work_order_id = 'f1000000-0000-0000-0000-000000000051' and a.activity_type = 'execution';

insert into public.work_assignments (
  company_id, activity_id, installer_id, version, status,
  schedule_precision, scheduled_start_at, scheduled_end_at, timezone
)
select
  'f1000000-0000-0000-0000-000000000002', a.id, 'f1000000-0000-0000-0000-000000000016',
  1, 'active', a.schedule_precision, a.scheduled_start_at, a.scheduled_end_at, a.timezone
from public.work_activities a
where a.work_order_id = 'f1000000-0000-0000-0000-000000000052' and a.activity_type = 'execution';

-- ---------------------------------------------------------------------------
-- El gerente agrega ayudantes
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"f1000000-0000-0000-0000-000000000011","role":"authenticated"}';

select lives_ok(
  $$select public.add_order_team_member(
      'f1000000-0000-0000-0000-000000000051',
      'f1000000-0000-0000-0000-000000000014',
      gen_random_uuid())$$,
  'MULTIINST-R1.2: el gerente agrega un ayudante elegible'
);

select is(
  (
    select (public.add_order_team_member(
      'f1000000-0000-0000-0000-000000000051',
      'f1000000-0000-0000-0000-000000000015',
      gen_random_uuid()
    ) ->> 'code')
  ),
  'NOT_ELIGIBLE',
  'MULTIINST-R1.2: no se puede agregar a alguien que no está activo en la empresa'
);

select is(
  (
    select (public.add_order_team_member(
      'f1000000-0000-0000-0000-000000000051',
      'f1000000-0000-0000-0000-000000000016',
      gen_random_uuid()
    ) ->> 'code')
  ),
  'SCHEDULE_CONFLICT',
  'MULTIINST-R1.2: no se puede agregar a alguien que choca de horario en otra empresa'
);

select throws_ok(
  $$select public.add_order_team_member(
      'f1000000-0000-0000-0000-000000000051',
      'f1000000-0000-0000-0000-000000000013',
      gen_random_uuid())$$,
  'P0001',
  'TEAM_ALREADY_LEAD',
  'MULTIINST-R1.1: el responsable no se puede agregar como su propio ayudante'
);

select is(
  (
    select count(*)::integer from public.work_order_team_members
    where order_id = 'f1000000-0000-0000-0000-000000000051' and status = 'active'
  ),
  1,
  'sólo el ayudante elegible quedó activo en el plantel'
);

select is(
  (
    select count(*)::integer from public.work_assignments a
    join public.work_activities act on act.id = a.activity_id
    where act.work_order_id = 'f1000000-0000-0000-0000-000000000051'
      and a.status = 'active'
  ),
  2,
  'la agenda tiene una fila vigente por cada integrante (responsable + ayudante)'
);

-- ---------------------------------------------------------------------------
-- El ayudante: mismo acceso que el responsable, ni un byte de más
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"f1000000-0000-0000-0000-000000000014","role":"authenticated"}';

select is(
  (select count(*)::integer from public.work_orders where id = 'f1000000-0000-0000-0000-000000000051'),
  1,
  'MULTIINST-R2.1: el ayudante ve la orden'
);

update public.work_orders set status = 'en_proceso'
where id = 'f1000000-0000-0000-0000-000000000051';

select is(
  (select status from public.work_orders where id = 'f1000000-0000-0000-0000-000000000051'),
  'en_proceso',
  'MULTIINST-R2.1/R4.1: el ayudante puede avanzar el estado de la orden, no sólo el responsable'
);

select lives_ok(
  $$insert into public.order_incidents (order_id, company_id, category, severity, description, created_by)
    values ('f1000000-0000-0000-0000-000000000051', 'f1000000-0000-0000-0000-000000000001',
            'other', 'low', 'lo vio el ayudante', 'f1000000-0000-0000-0000-000000000014')$$,
  'MULTIINST-R2.1: el ayudante puede cargar una incidencia de la orden'
);

select is(
  (
    select count(*)::integer from public.order_incidents
    where order_id = 'f1000000-0000-0000-0000-000000000051'
  ),
  1,
  'MULTIINST-R2.1: el ayudante ve la incidencia que él mismo cargó'
);

-- ---------------------------------------------------------------------------
-- Quien no está en el plantel no gana nada
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"f1000000-0000-0000-0000-000000000017","role":"authenticated"}';

select is(
  (select count(*)::integer from public.work_orders where id = 'f1000000-0000-0000-0000-000000000051'),
  0,
  'MULTIINST-R2.2: alguien fuera del plantel no ve la orden'
);

select is(
  (select count(*)::integer from public.work_order_team_members where order_id = 'f1000000-0000-0000-0000-000000000051'),
  0,
  'MULTIINST-R2.2: alguien fuera del plantel no ve quiénes lo integran'
);

-- ---------------------------------------------------------------------------
-- Dinero: cada uno el suyo, nunca el de otro
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"f1000000-0000-0000-0000-000000000011","role":"authenticated"}';

select lives_ok(
  $$select public.set_team_member_amount(
      'f1000000-0000-0000-0000-000000000051',
      'f1000000-0000-0000-0000-000000000014', 30)$$,
  'MULTIINST-R3.1: el gerente fija el monto del ayudante'
);

select lives_ok(
  $$select public.set_team_member_payment_status(
      'f1000000-0000-0000-0000-000000000051',
      'f1000000-0000-0000-0000-000000000014', 'paid')$$,
  'el gerente marca pagado al ayudante'
);

set local request.jwt.claims to
  '{"sub":"f1000000-0000-0000-0000-000000000014","role":"authenticated"}';

select is(
  (
    select amount from public.installer_earnings
    where order_id = 'f1000000-0000-0000-0000-000000000051'
      and installer_id = 'f1000000-0000-0000-0000-000000000014'
  ),
  30.00,
  'MULTIINST-R3.1: el ayudante ve su propio monto (30), no el del responsable (50)'
);

select is(
  (
    select count(*)::integer from public.installer_earnings
    where order_id = 'f1000000-0000-0000-0000-000000000051'
      and installer_id = 'f1000000-0000-0000-0000-000000000013'
  ),
  0,
  'MULTIINST-R3.2: el ayudante no ve el monto del responsable en la misma orden'
);

select is(
  (
    select count(*)::integer from public.order_payment_events
    where order_id = 'f1000000-0000-0000-0000-000000000051'
  ),
  1,
  'MULTIINST-R3.2: el ayudante ve su propio evento de pago (uno), no el de nadie más'
);

set local request.jwt.claims to
  '{"sub":"f1000000-0000-0000-0000-000000000013","role":"authenticated"}';

select is(
  (
    select count(*)::integer from public.installer_earnings
    where order_id = 'f1000000-0000-0000-0000-000000000051'
      and installer_id = 'f1000000-0000-0000-0000-000000000014'
  ),
  0,
  'MULTIINST-R3.2: el responsable tampoco ve el monto del ayudante'
);

-- ---------------------------------------------------------------------------
-- Quitar a un ayudante: sin gate, y al responsable no se lo saca por acá
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"f1000000-0000-0000-0000-000000000011","role":"authenticated"}';

select throws_ok(
  $$select public.remove_order_team_member(
      'f1000000-0000-0000-0000-000000000051',
      'f1000000-0000-0000-0000-000000000013')$$,
  'P0001',
  'TEAM_MEMBER_NOT_FOUND',
  'MULTIINST-R1.3: al responsable no se lo quita por esta vía'
);

select lives_ok(
  $$select public.remove_order_team_member(
      'f1000000-0000-0000-0000-000000000051',
      'f1000000-0000-0000-0000-000000000014')$$,
  'MULTIINST-R1.3: quitar a un ayudante no pasa por el gate'
);

select is(
  (
    select count(*)::integer from public.work_order_team_members
    where order_id = 'f1000000-0000-0000-0000-000000000051' and status = 'active'
  ),
  0,
  'el ayudante quitado ya no cuenta como plantel activo'
);

select is(
  (
    select count(*)::integer from public.work_assignments a
    join public.work_activities act on act.id = a.activity_id
    where act.work_order_id = 'f1000000-0000-0000-0000-000000000051'
      and a.installer_id = 'f1000000-0000-0000-0000-000000000014'
      and a.status = 'active'
  ),
  0,
  'la fila de agenda del ayudante quitado ya no está vigente'
);

reset role;

-- ---------------------------------------------------------------------------
-- Avisos al equipo (20260925000003)
-- ---------------------------------------------------------------------------

select ok(
  exists (
    select 1 from public.notifications n
    where n.user_id = 'f1000000-0000-0000-0000-000000000014'
      and n.type = 'order_assigned'
      and n.data->>'order_id' = 'f1000000-0000-0000-0000-000000000051'
  ),
  'sumar a un ayudante le genera la notificación «orden asignada»'
);

select ok(
  not has_function_privilege('anon', 'public.notify_team_member_added()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.notify_team_member_added()', 'EXECUTE'),
  'la función del trigger de aviso no es ejecutable por anon ni por authenticated'
);

-- ---------------------------------------------------------------------------
-- Superficie de funciones: nada de esto es para `anon`
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.add_order_team_member(uuid, uuid, uuid, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.remove_order_team_member(uuid, uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.set_team_member_amount(uuid, uuid, numeric)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.set_team_member_payment_status(uuid, uuid, text, text)', 'EXECUTE'),
  'ninguna de las funciones que escriben el plantel es ejecutable por anon'
);

select * from finish();

rollback;

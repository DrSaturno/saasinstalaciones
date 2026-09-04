-- Punto 24: la máquina de estados del flujo de campo.
--
-- Dos garantías que se rompen solas en un refactor si nadie las afirma:
--
--   1. El camino corto `planificada → en_proceso` SIGUE siendo válido. Es
--      fácil "limpiar" la máquina forzando el camino largo y dejar trabadas
--      las órdenes que vienen de antes y la proyección desde actividades.
--   2. El traslado y la llegada son del instalador asignado y de nadie más.
--
-- Y un bug real que estos estados destaparon: `refresh_site_status`
-- clasificaba por listas cerradas con un `else 'pendiente'`, así que una
-- orden que avanzaba a `en_camino` hacía RETROCEDER el sitio a 'pendiente'
-- justo cuando el instalador salía para allá.

begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

insert into public.companies (id, name, country, order_prefix)
values ('d4000000-0000-0000-0000-000000000001', 'Empresa Campo', 'AR', 'ECA');

insert into auth.users (id, email, raw_user_meta_data) values
  ('d4000000-0000-0000-0000-000000000011', 'asignado.eca@test.dev',
   '{"role":"installer"}'::jsonb),
  ('d4000000-0000-0000-0000-000000000012', 'ajeno.eca@test.dev',
   '{"role":"installer"}'::jsonb);

-- `handle_new_user` ya creó el perfil con el rol del metadata al insertar en
-- `auth.users`; acá sólo falta atarlo a la empresa. Ese update lo bloquea
-- `prevent_privilege_change`, cuyo único bypass es el claim de service_role
-- (es exactamente la escalación de privilegios que el trigger existe para
-- impedir, así que la fixture la pide explícitamente en vez de esquivarla).
set local request.jwt.claim.role to 'service_role';

update public.profiles
   set company_id = 'd4000000-0000-0000-0000-000000000001',
       full_name = 'Instalador Asignado'
 where id = 'd4000000-0000-0000-0000-000000000011';
update public.profiles
   set company_id = 'd4000000-0000-0000-0000-000000000001',
       full_name = 'Instalador Ajeno'
 where id = 'd4000000-0000-0000-0000-000000000012';

reset request.jwt.claim.role;

insert into public.installers (id, zones) values
  ('d4000000-0000-0000-0000-000000000011', '{Córdoba}'),
  ('d4000000-0000-0000-0000-000000000012', '{Córdoba}')
on conflict (id) do nothing;

insert into public.projects (id, company_id, name, country, status)
values ('d4000000-0000-0000-0000-000000000021', 'd4000000-0000-0000-0000-000000000001',
        'Proyecto Campo', 'AR', 'active');

insert into public.sites (id, company_id, project_id, name, address, city, state, zone)
values ('d4000000-0000-0000-0000-000000000031', 'd4000000-0000-0000-0000-000000000001',
        'd4000000-0000-0000-0000-000000000021', 'Sitio 1', 'Calle 1', 'Córdoba',
        'Córdoba', 'Córdoba');

-- El gate de asignación del punto 21 rechaza escribir `assigned_installer_id`
-- fuera de `assign_installer_gate`. Se abre la compuerta sólo para las
-- escrituras de fixture: lo que este archivo prueba es la máquina de estados,
-- no el gate, que tiene sus propios tests.
select set_config('app.assignment_gate', 'on', true);
insert into public.work_orders (
  id, company_id, project_id, site_id, order_number, title, status,
  assigned_installer_id, installer_accepted_at, scheduled_date
) values (
  'd4000000-0000-0000-0000-000000000041', 'd4000000-0000-0000-0000-000000000001',
  'd4000000-0000-0000-0000-000000000021', 'd4000000-0000-0000-0000-000000000031',
  'ECA-0001', 'Orden de campo', 'planificada',
  'd4000000-0000-0000-0000-000000000011', now(), current_date
);
select set_config('app.assignment_gate', 'off', true);

-- ---------------------------------------------------------------------------
-- El camino largo, como el instalador asignado
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"d4000000-0000-0000-0000-000000000011","role":"authenticated"}';

update public.work_orders set status = 'en_camino'
 where id = 'd4000000-0000-0000-0000-000000000041';

select is(
  (select status from public.work_orders
    where id = 'd4000000-0000-0000-0000-000000000041'),
  'en_camino',
  'FLD-R1.1: el instalador asignado puede salir en camino'
);

-- El bug del cache del sitio: en camino todavía no es alguien interviniendo
-- el lugar, pero TAMPOCO puede hacer retroceder el punto a 'pendiente'.
select is(
  (select status from public.sites
    where id = 'd4000000-0000-0000-0000-000000000031'),
  'planificada',
  'el sitio no retrocede a pendiente cuando la orden sale en camino'
);

update public.work_orders set status = 'en_sitio'
 where id = 'd4000000-0000-0000-0000-000000000041';

select is(
  (select status from public.sites
    where id = 'd4000000-0000-0000-0000-000000000031'),
  'en_proceso',
  'con el instalador en el punto, el sitio pasa a en proceso'
);

update public.work_orders set status = 'en_proceso'
 where id = 'd4000000-0000-0000-0000-000000000041';

select is(
  (select status from public.work_orders
    where id = 'd4000000-0000-0000-0000-000000000041'),
  'en_proceso',
  'FLD-R1.1: de la llegada se pasa al trabajo'
);

-- No se retrocede: el trabajo ya empezó.
select throws_ok(
  $$update public.work_orders set status = 'en_camino'
     where id = 'd4000000-0000-0000-0000-000000000041'$$,
  'P0001',
  null,
  'una orden en proceso no vuelve al traslado'
);

-- ---------------------------------------------------------------------------
-- El traslado y la llegada son de quien se está moviendo
-- ---------------------------------------------------------------------------

select set_config('app.assignment_gate', 'on', true);
insert into public.work_orders (
  id, company_id, project_id, site_id, order_number, title, status,
  assigned_installer_id, installer_accepted_at, scheduled_date
) values (
  'd4000000-0000-0000-0000-000000000042', 'd4000000-0000-0000-0000-000000000001',
  'd4000000-0000-0000-0000-000000000021', 'd4000000-0000-0000-0000-000000000031',
  'ECA-0002', 'Orden ajena', 'planificada',
  'd4000000-0000-0000-0000-000000000011', now(), current_date
);
select set_config('app.assignment_gate', 'off', true);

set local request.jwt.claims to
  '{"sub":"d4000000-0000-0000-0000-000000000012","role":"authenticated"}';

-- Dos capas, y hay que afirmarlas por separado.
--
-- Primera: la RLS. A quien no tiene la orden asignada no le niega sólo el
-- UPDATE — no le deja ni verla. El update afecta CERO filas sin lanzar nada,
-- así que un `throws_ok` acá pasaría a verde el día que el trigger
-- desaparezca, porque nunca lo estaba probando. Lo que se afirma es el
-- efecto, y hay que leerlo FUERA de la sesión del ajeno: desde adentro la
-- fila ni siquiera existe, y la comparación daría null contra null.
update public.work_orders set status = 'en_camino'
 where id = 'd4000000-0000-0000-0000-000000000042';

reset role;

select is(
  (select status from public.work_orders
    where id = 'd4000000-0000-0000-0000-000000000042'),
  'planificada',
  'FLD-R1.2: la RLS impide que un instalador ajeno mueva la orden'
);

-- Segunda: el trigger, que es la garantía que sobrevive a un cambio de
-- policy. Sin `role authenticated` la RLS no se aplica, así que el update
-- llega al trigger y ahí sí tiene que rechazarlo por identidad.

select throws_ok(
  $$update public.work_orders set status = 'en_camino'
     where id = 'd4000000-0000-0000-0000-000000000042'$$,
  'P0001',
  null,
  'FLD-R1.2: el trigger rechaza el traslado de un instalador ajeno'
);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- El camino corto se conserva (DEC-24-01)
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"d4000000-0000-0000-0000-000000000011","role":"authenticated"}';

update public.work_orders set status = 'en_proceso'
 where id = 'd4000000-0000-0000-0000-000000000042';

select is(
  (select status from public.work_orders
    where id = 'd4000000-0000-0000-0000-000000000042'),
  'en_proceso',
  'DEC-24-01: planificada → en_proceso sigue siendo válido sin pasar por el traslado'
);

-- ---------------------------------------------------------------------------
-- Aceptar sigue siendo precondición, también por la etapa nueva
-- ---------------------------------------------------------------------------

reset role;

select set_config('app.assignment_gate', 'on', true);
insert into public.work_orders (
  id, company_id, project_id, site_id, order_number, title, status,
  assigned_installer_id, scheduled_date
) values (
  'd4000000-0000-0000-0000-000000000043', 'd4000000-0000-0000-0000-000000000001',
  'd4000000-0000-0000-0000-000000000021', 'd4000000-0000-0000-0000-000000000031',
  'ECA-0003', 'Sin aceptar', 'planificada',
  'd4000000-0000-0000-0000-000000000011', current_date
);
select set_config('app.assignment_gate', 'off', true);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"d4000000-0000-0000-0000-000000000011","role":"authenticated"}';

-- Antes esta regla sólo miraba `planificada → en_proceso`. Salir por la etapa
-- nueva habría esquivado la aceptación, que es la etapa 1 del flujo.
select throws_ok(
  $$update public.work_orders set status = 'en_camino'
     where id = 'd4000000-0000-0000-0000-000000000043'$$,
  'P0001',
  null,
  'sin aceptar la orden no se puede salir en camino'
);

-- ---------------------------------------------------------------------------
-- La traza estructurada existe y admite el estado previo
-- ---------------------------------------------------------------------------

reset role;

insert into public.order_updates (
  id, order_id, company_id, installer_id, type, note, from_status, to_status
) values (
  'd4000000-0000-0000-0000-000000000051', 'd4000000-0000-0000-0000-000000000041',
  'd4000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000011',
  'travel', 'Salí hacia la locación', 'planificada', 'en_camino'
);

select is(
  (select from_status || '→' || to_status from public.order_updates
    where id = 'd4000000-0000-0000-0000-000000000051'),
  'planificada→en_camino',
  'FLD-R2.1: el cambio de estado queda en columnas, no en prosa traducida'
);

select * from finish();
rollback;

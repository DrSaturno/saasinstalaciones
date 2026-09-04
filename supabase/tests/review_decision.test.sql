-- Punto 24: las decisiones del coordinador sobre una entrega.
--
-- "Finalizado por el instalador" y "trabajo aprobado" ya eran estados
-- distintos antes de esta entrega, y eso estaba bien. Lo que faltaba era el
-- camino de vuelta: al instalador le reabrían el trabajo y se enteraba
-- entrando a mirar, porque `notify_order_update` sólo avisa HACIA la empresa
-- (arranca con `if new.installer_id is null then return new`).
--
-- El aviso se dispara desde la base y no desde la Server Action porque la RLS
-- de `notifications` es `user_id = auth.uid()`: el coordinador no puede
-- escribir en la bandeja de otra persona, y está bien que no pueda.

begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

insert into public.companies (id, name, country, order_prefix)
values ('d8000000-0000-0000-0000-000000000001', 'Empresa Revisión', 'AR', 'ERV');

insert into auth.users (id, email, raw_user_meta_data) values
  ('d8000000-0000-0000-0000-000000000011', 'rv.inst@test.dev',
   '{"role":"installer"}'::jsonb),
  ('d8000000-0000-0000-0000-000000000012', 'rv.ger@test.dev',
   '{"role":"company_manager","company_id":"d8000000-0000-0000-0000-000000000001"}'::jsonb);

set local request.jwt.claim.role to 'service_role';
update public.profiles set company_id = 'd8000000-0000-0000-0000-000000000001'
 where id = 'd8000000-0000-0000-0000-000000000011';
reset request.jwt.claim.role;

insert into public.installers (id, zones)
values ('d8000000-0000-0000-0000-000000000011', '{Córdoba}')
on conflict (id) do nothing;

insert into public.projects (id, company_id, name, country, status)
values ('d8000000-0000-0000-0000-000000000021', 'd8000000-0000-0000-0000-000000000001',
        'Proyecto Revisión', 'AR', 'active');

insert into public.sites (id, company_id, project_id, name, address, city, state, zone)
values ('d8000000-0000-0000-0000-000000000031', 'd8000000-0000-0000-0000-000000000001',
        'd8000000-0000-0000-0000-000000000021', 'Sitio RV', 'Calle 1', 'Córdoba',
        'Córdoba', 'Córdoba');

select set_config('app.assignment_gate', 'on', true);
insert into public.work_orders (
  id, company_id, project_id, site_id, order_number, title, status,
  assigned_installer_id, installer_accepted_at, scheduled_date
) values (
  'd8000000-0000-0000-0000-000000000041', 'd8000000-0000-0000-0000-000000000001',
  'd8000000-0000-0000-0000-000000000021', 'd8000000-0000-0000-0000-000000000031',
  'ERV-0001', 'Orden revisión', 'en_revision',
  'd8000000-0000-0000-0000-000000000011', now(), current_date
);
select set_config('app.assignment_gate', 'off', true);

-- El coordinador pide correcciones: el evento con el motivo, y la vuelta a
-- `en_proceso`. Es lo que escribe `reviewOrderDelivery`.
insert into public.order_updates (
  id, order_id, company_id, created_by, type, note, from_status, to_status
) values (
  'd8000000-0000-0000-0000-000000000061', 'd8000000-0000-0000-0000-000000000041',
  'd8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000012',
  'system', 'Se pidieron correcciones: falta sellar el borde inferior',
  'en_revision', 'en_proceso'
);

update public.work_orders set status = 'en_proceso'
 where id = 'd8000000-0000-0000-0000-000000000041';

select is(
  (select status from public.work_orders
    where id = 'd8000000-0000-0000-0000-000000000041'),
  'en_proceso',
  'FLD-R6.3: pedir correcciones devuelve el trabajo al instalador'
);

select is(
  (select type from public.notifications
    where user_id = 'd8000000-0000-0000-0000-000000000011'
      and data->>'update_id' = 'd8000000-0000-0000-0000-000000000061'),
  'delivery_returned',
  'AC-24-E: el instalador recibe el aviso de que le devolvieron la entrega'
);

-- El motivo viaja completo en el cuerpo: es exactamente lo que el instalador
-- necesita leer para saber qué corregir. Resumirlo sería perderlo.
select is(
  (select body from public.notifications
    where user_id = 'd8000000-0000-0000-0000-000000000011'
      and data->>'update_id' = 'd8000000-0000-0000-0000-000000000061'),
  'Se pidieron correcciones: falta sellar el borde inferior',
  'FLD-R6.5: el motivo llega al instalador, no sólo el hecho'
);

select is(
  (select from_status || ' -> ' || to_status from public.order_updates
    where id = 'd8000000-0000-0000-0000-000000000061'),
  'en_revision -> en_proceso',
  'FLD-R2.1: la decisión queda con estado anterior y nuevo'
);

-- ADR-001 / AC-24-F: quien ejecutó no cierra su propia entrega, aunque además
-- coordine el proyecto. Ahora cubre también la reapertura desde `finalizada`,
-- que antes ni existía como transición.
--
-- La orden vuelve a revisión, y para eso hay que cumplir la evidencia mínima
-- de la Fase 1: el trigger la exige en `en_proceso → en_revision`, así que
-- una fixture que no la cumpla no llega hasta acá.
insert into public.order_updates (
  id, order_id, company_id, installer_id, type, note, photos
) values (
  'd8000000-0000-0000-0000-000000000062', 'd8000000-0000-0000-0000-000000000041',
  'd8000000-0000-0000-0000-000000000001', 'd8000000-0000-0000-0000-000000000011',
  'done', 'Corregido', '["a.jpg","b.jpg","c.jpg"]'::jsonb
);

update public.work_orders set status = 'en_revision'
 where id = 'd8000000-0000-0000-0000-000000000041';

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"d8000000-0000-0000-0000-000000000011","role":"authenticated"}';

select throws_ok(
  $$update public.work_orders set status = 'finalizada'
     where id = 'd8000000-0000-0000-0000-000000000041'$$,
  'P0001',
  null,
  'AC-24-F: el instalador no puede aprobar su propia entrega'
);

select * from finish();
rollback;

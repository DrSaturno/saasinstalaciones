-- Punto 24: un bloqueo del campo llega a donde la empresa mira.
--
-- Antes de esta entrega había dos canales que no se tocaban: el instalador
-- escribía un `order_updates` tipo 'blocker' que quedaba en el historial, y
-- `order_incidents` —lo que alimenta el dashboard y la tasa de incidencias—
-- sólo lo escribía la empresa. Quien veía el problema no podía abrir el
-- registro que el resto consulta.
--
-- El puente vive en un TRIGGER y no en la Server Action a propósito: el área
-- installer escribe por dos caminos (la acción online y `lib/offline/sync.ts`
-- cuando drena la cola), y un bloqueo reportado sin señal —el caso más
-- probable, porque los problemas aparecen en sitios difíciles— nunca habría
-- llegado al dashboard si la regla viviera sólo en la aplicación. Estos
-- asserts insertan como lo hace la cola, sin pasar por la acción.

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

insert into public.companies (id, name, country, order_prefix)
values ('d7000000-0000-0000-0000-000000000001', 'Empresa Bloqueo', 'AR', 'EBL');

insert into auth.users (id, email, raw_user_meta_data) values
  ('d7000000-0000-0000-0000-000000000011', 'bl.inst@test.dev',
   '{"role":"installer"}'::jsonb),
  ('d7000000-0000-0000-0000-000000000012', 'bl.ger@test.dev',
   '{"role":"company_manager","company_id":"d7000000-0000-0000-0000-000000000001"}'::jsonb);

set local request.jwt.claim.role to 'service_role';
update public.profiles set company_id = 'd7000000-0000-0000-0000-000000000001'
 where id = 'd7000000-0000-0000-0000-000000000011';
reset request.jwt.claim.role;

insert into public.installers (id, zones)
values ('d7000000-0000-0000-0000-000000000011', '{Córdoba}')
on conflict (id) do nothing;

insert into public.company_installers (company_id, installer_id, status)
values ('d7000000-0000-0000-0000-000000000001',
        'd7000000-0000-0000-0000-000000000011', 'active');

insert into public.projects (id, company_id, name, country, status)
values ('d7000000-0000-0000-0000-000000000021', 'd7000000-0000-0000-0000-000000000001',
        'Proyecto Bloqueo', 'AR', 'active');

insert into public.sites (id, company_id, project_id, name, address, city, state, zone)
values ('d7000000-0000-0000-0000-000000000031', 'd7000000-0000-0000-0000-000000000001',
        'd7000000-0000-0000-0000-000000000021', 'Sitio BL', 'Calle 1', 'Córdoba',
        'Córdoba', 'Córdoba');

select set_config('app.assignment_gate', 'on', true);
insert into public.work_orders (
  id, company_id, project_id, site_id, order_number, title, status,
  assigned_installer_id, installer_accepted_at, scheduled_date
) values (
  'd7000000-0000-0000-0000-000000000041', 'd7000000-0000-0000-0000-000000000001',
  'd7000000-0000-0000-0000-000000000021', 'd7000000-0000-0000-0000-000000000031',
  'EBL-0001', 'Orden bloqueo', 'en_proceso',
  'd7000000-0000-0000-0000-000000000011', now(), current_date
);
select set_config('app.assignment_gate', 'off', true);

-- El bloqueo, escrito como lo escribe la cola offline.
insert into public.order_updates (
  id, order_id, company_id, installer_id, created_by, type, note, photos
) values (
  'd7000000-0000-0000-0000-000000000051', 'd7000000-0000-0000-0000-000000000041',
  'd7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000011',
  'd7000000-0000-0000-0000-000000000011', 'blocker',
  'La persiana está tapiada, no puedo acceder', '["b1.jpg"]'::jsonb
);

select is(
  (select category || '/' || severity from public.order_incidents
    where update_id = 'd7000000-0000-0000-0000-000000000051'),
  'technical_issue/high',
  'AC-24-D: el bloqueo abre una incidencia formal, sin pedirle al instalador que clasifique'
);

-- FLD-R5.4: una orden bloqueada sigue en proceso. El instalador puede cargar
-- avances de lo que sí pudo hacer, o cerrar si el problema se resolvió.
select is(
  (select status from public.work_orders
    where id = 'd7000000-0000-0000-0000-000000000041'),
  'en_proceso',
  'FLD-R5.4: reportar un bloqueo no cambia el estado de la orden'
);

-- El matiz que motivó la entrega: el bloqueo YA notificaba, pero con el mismo
-- título y tipo que una foto de rutina. Entre veinte avances de un día normal,
-- el que importaba se perdía.
select is(
  (select type from public.notifications
    where user_id = 'd7000000-0000-0000-0000-000000000012'
      and data->>'update_id' = 'd7000000-0000-0000-0000-000000000051'
    limit 1),
  'blocker_reported',
  'FLD-R5.3: el aviso del bloqueo se distingue del avance rutinario'
);

select is(
  (select data->>'severity' from public.notifications
    where user_id = 'd7000000-0000-0000-0000-000000000012'
      and data->>'update_id' = 'd7000000-0000-0000-0000-000000000051'
    limit 1),
  'warning',
  'el aviso lleva severidad, así la campanita lo pinta distinto'
);

-- Reintento de la cola con el mismo id de cliente.
insert into public.order_updates (
  id, order_id, company_id, installer_id, created_by, type, note, photos
) values (
  'd7000000-0000-0000-0000-000000000051', 'd7000000-0000-0000-0000-000000000041',
  'd7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000011',
  'd7000000-0000-0000-0000-000000000011', 'blocker',
  'La persiana está tapiada, no puedo acceder', '["b1.jpg"]'::jsonb
) on conflict (id) do nothing;

select is(
  (select count(*)::integer from public.order_incidents
    where order_id = 'd7000000-0000-0000-0000-000000000041'),
  1,
  'AC-24-H: el reintento de la cola no duplica la incidencia en el dashboard'
);

-- Un avance rutinario no abre nada: el puente es sólo para el bloqueo.
insert into public.order_updates (
  id, order_id, company_id, installer_id, created_by, type, note, photos
) values (
  'd7000000-0000-0000-0000-000000000052', 'd7000000-0000-0000-0000-000000000041',
  'd7000000-0000-0000-0000-000000000001', 'd7000000-0000-0000-0000-000000000011',
  'd7000000-0000-0000-0000-000000000011', 'progress',
  'Avance normal', '["p1.jpg"]'::jsonb
);

select is(
  (select count(*)::integer from public.order_incidents
    where order_id = 'd7000000-0000-0000-0000-000000000041'),
  1,
  'un avance rutinario no abre incidencia'
);

select * from finish();
rollback;

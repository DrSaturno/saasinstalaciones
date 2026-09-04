-- Punto 24: no se cierra un trabajo sin evidencia suficiente.
--
-- `AC-14-A` pide que la finalización sin fotos la rechacen "servidor y DB",
-- online y offline. La razón de que la regla viva en el trigger y no sólo en
-- la Server Action es que la cola offline escribe por su propio camino
-- cuando vuelve la señal: una validación que sólo esté en la acción se
-- saltea sola en cuanto el teléfono sincroniza.
--
-- Se cuentan las fotos de TODA la orden y no las del evento de cierre
-- (FLD-R4.3): quien documentó mientras trabajaba no tiene que volver a
-- fotografiar lo mismo para poder terminar.

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

insert into public.companies (id, name, country, order_prefix, min_completion_photos)
values ('d5000000-0000-0000-0000-000000000001', 'Empresa Evidencia', 'AR', 'EEV', 3);

insert into auth.users (id, email, raw_user_meta_data)
values ('d5000000-0000-0000-0000-000000000011', 'ev.inst@test.dev',
        '{"role":"installer"}'::jsonb);

set local request.jwt.claim.role to 'service_role';
update public.profiles set company_id = 'd5000000-0000-0000-0000-000000000001'
 where id = 'd5000000-0000-0000-0000-000000000011';
reset request.jwt.claim.role;

insert into public.installers (id, zones)
values ('d5000000-0000-0000-0000-000000000011', '{Córdoba}')
on conflict (id) do nothing;

insert into public.projects (id, company_id, name, country, status)
values ('d5000000-0000-0000-0000-000000000021', 'd5000000-0000-0000-0000-000000000001',
        'Proyecto Evidencia', 'AR', 'active');

insert into public.sites (id, company_id, project_id, name, address, city, state, zone)
values ('d5000000-0000-0000-0000-000000000031', 'd5000000-0000-0000-0000-000000000001',
        'd5000000-0000-0000-0000-000000000021', 'Sitio EV', 'Calle 1', 'Córdoba',
        'Córdoba', 'Córdoba');

-- El gate de asignación del punto 21 rechaza escribir `assigned_installer_id`
-- fuera de `assign_installer_gate`; se abre sólo para la fixture.
select set_config('app.assignment_gate', 'on', true);
insert into public.work_orders (
  id, company_id, project_id, site_id, order_number, title, status,
  assigned_installer_id, installer_accepted_at, scheduled_date
) values (
  'd5000000-0000-0000-0000-000000000041', 'd5000000-0000-0000-0000-000000000001',
  'd5000000-0000-0000-0000-000000000021', 'd5000000-0000-0000-0000-000000000031',
  'EEV-0001', 'Orden evidencia', 'en_proceso',
  'd5000000-0000-0000-0000-000000000011', now(), current_date
);
select set_config('app.assignment_gate', 'off', true);

select is(
  public.order_min_photos('d5000000-0000-0000-0000-000000000041'),
  3,
  'FLD-R4.2: sin override, manda el mínimo de la empresa'
);

-- Dos fotos, repartidas en dos eventos distintos de la ejecución.
insert into public.order_updates (id, order_id, company_id, installer_id, type, note, photos) values
  ('d5000000-0000-0000-0000-000000000051', 'd5000000-0000-0000-0000-000000000041',
   'd5000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000011',
   'checkin', 'Llegada', '["llegada.jpg"]'::jsonb),
  ('d5000000-0000-0000-0000-000000000052', 'd5000000-0000-0000-0000-000000000041',
   'd5000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000011',
   'progress', 'Avance', '["avance.jpg"]'::jsonb);

select is(
  public.order_photo_count('d5000000-0000-0000-0000-000000000041'),
  2,
  'FLD-R4.3: se cuentan las fotos de toda la orden, no las del cierre'
);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"d5000000-0000-0000-0000-000000000011","role":"authenticated"}';

select throws_ok(
  $$update public.work_orders set status = 'en_revision'
     where id = 'd5000000-0000-0000-0000-000000000041'$$,
  'P0001',
  null,
  'AC-24-B: con 2 fotos y mínimo 3, la base rechaza la finalización'
);

select is(
  (select status from public.work_orders
    where id = 'd5000000-0000-0000-0000-000000000041'),
  'en_proceso',
  'la orden rechazada se queda donde estaba'
);

-- El override del proyecto baja el mínimo a 1 (AC-24-C).
reset role;
update public.projects set min_completion_photos = 1
 where id = 'd5000000-0000-0000-0000-000000000021';

select is(
  public.order_min_photos('d5000000-0000-0000-0000-000000000041'),
  1,
  'AC-24-C: el override del proyecto manda sobre el de la empresa'
);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"d5000000-0000-0000-0000-000000000011","role":"authenticated"}';

update public.work_orders set status = 'en_revision'
 where id = 'd5000000-0000-0000-0000-000000000041';

select is(
  (select status from public.work_orders
    where id = 'd5000000-0000-0000-0000-000000000041'),
  'en_revision',
  'con el mínimo del proyecto satisfecho, la finalización pasa'
);

select * from finish();
rollback;

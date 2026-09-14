-- Auditoría del 11-09-2026 — H3: el bucle del alta masiva corre en la base.
--
-- Eran cuatro viajes de red por orden. Con los ~2000 puntos del proyecto
-- insignia son unos 8000 viajes secuenciales, que no entran en ningún límite
-- de tiempo de la plataforma; la acción se cortaba a mitad del lote y dejaba
-- órdenes sin actividad. `finish_order_batch` hace lo mismo llamando a las
-- funciones que ya existen —no las duplica— desde adentro.

begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

insert into public.companies (id, name, country, order_prefix)
values ('e2000000-0000-0000-0000-000000000001', 'Empresa Lote', 'AR', 'ELT');

insert into auth.users (id, email, raw_app_meta_data) values
  ('e2000000-0000-0000-0000-000000000011', 'lt.inst@test.dev',
   '{"role":"installer"}'::jsonb),
  ('e2000000-0000-0000-0000-000000000012', 'lt.ger@test.dev',
   '{"role":"company_manager","company_id":"e2000000-0000-0000-0000-000000000001"}'::jsonb);

set local request.jwt.claim.role to 'service_role';
update public.profiles set company_id = 'e2000000-0000-0000-0000-000000000001'
 where id = 'e2000000-0000-0000-0000-000000000011';
reset request.jwt.claim.role;

insert into public.installers (id, zones)
values ('e2000000-0000-0000-0000-000000000011', '{Córdoba}')
on conflict (id) do nothing;

insert into public.company_installers (company_id, installer_id, status)
values ('e2000000-0000-0000-0000-000000000001',
        'e2000000-0000-0000-0000-000000000011', 'active')
on conflict do nothing;

insert into public.projects (id, company_id, name, country, status)
values ('e2000000-0000-0000-0000-000000000021', 'e2000000-0000-0000-0000-000000000001',
        'Proyecto Lote', 'AR', 'active');

insert into public.sites (id, company_id, project_id, name, address, city, state, zone)
values
  ('e2000000-0000-0000-0000-000000000031', 'e2000000-0000-0000-0000-000000000001',
   'e2000000-0000-0000-0000-000000000021', 'Sitio 1', 'Calle 1', 'Córdoba', 'Córdoba', 'Córdoba'),
  ('e2000000-0000-0000-0000-000000000032', 'e2000000-0000-0000-0000-000000000001',
   'e2000000-0000-0000-0000-000000000021', 'Sitio 2', 'Calle 2', 'Córdoba', 'Córdoba', 'Córdoba'),
  ('e2000000-0000-0000-0000-000000000033', 'e2000000-0000-0000-0000-000000000001',
   'e2000000-0000-0000-0000-000000000021', 'Sitio 3', 'Calle 3', 'Córdoba', 'Córdoba', 'Córdoba');

insert into public.work_orders (
  id, company_id, project_id, site_id, order_number, title, status
) values
  ('e2000000-0000-0000-0000-0000000000a1', 'e2000000-0000-0000-0000-000000000001',
   'e2000000-0000-0000-0000-000000000021', 'e2000000-0000-0000-0000-000000000031',
   'ELT-0001', 'Orden 1', 'pendiente'),
  ('e2000000-0000-0000-0000-0000000000a2', 'e2000000-0000-0000-0000-000000000001',
   'e2000000-0000-0000-0000-000000000021', 'e2000000-0000-0000-0000-000000000032',
   'ELT-0002', 'Orden 2', 'pendiente'),
  ('e2000000-0000-0000-0000-0000000000a3', 'e2000000-0000-0000-0000-000000000001',
   'e2000000-0000-0000-0000-000000000021', 'e2000000-0000-0000-0000-000000000033',
   'ELT-0003', 'Orden 3', 'pendiente');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"e2000000-0000-0000-0000-000000000012","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- El caso limpio
-- ---------------------------------------------------------------------------

select is(
  (public.finish_order_batch(
     array['e2000000-0000-0000-0000-0000000000a1',
           'e2000000-0000-0000-0000-0000000000a2']::uuid[],
     false, true, current_date) ->> 'processed')::int,
  2,
  'procesa la tanda entera en una sola llamada'
);

select is(
  (select count(*)::int from public.work_activities
    where work_order_id in ('e2000000-0000-0000-0000-0000000000a1',
                            'e2000000-0000-0000-0000-0000000000a2')
      and activity_type = 'execution'),
  2,
  'cada orden quedó con su actividad de ejecución'
);

-- Que la fecha viaje importa: es lo que hace que la orden aparezca en la
-- agenda. Sin esto, `finish_order_batch` habría "terminado" órdenes que en la
-- práctica siguen sin compromiso.
select is(
  (select count(*)::int from public.work_activities
    where work_order_id = 'e2000000-0000-0000-0000-0000000000a1'
      and activity_type = 'execution'
      and (legacy_scheduled_date = current_date
           or scheduled_start_at::date = current_date)),
  1,
  'y con su horario: la fecha del formulario llegó a la actividad'
);

-- ---------------------------------------------------------------------------
-- Reanudable: repetir una tanda no duplica nada
-- ---------------------------------------------------------------------------

select is(
  (public.finish_order_batch(
     array['e2000000-0000-0000-0000-0000000000a1',
           'e2000000-0000-0000-0000-0000000000a2']::uuid[],
     false, true, current_date) ->> 'processed')::int,
  2,
  'repetir la misma tanda no lanza'
);

select is(
  (select count(*)::int from public.work_activities
    where work_order_id in ('e2000000-0000-0000-0000-0000000000a1',
                            'e2000000-0000-0000-0000-0000000000a2')),
  2,
  'y no duplica actividades: es lo que vuelve reanudable al alta masiva'
);

-- ---------------------------------------------------------------------------
-- Bordes
-- ---------------------------------------------------------------------------

select is(
  (public.finish_order_batch(array[]::uuid[], false, true) ->> 'processed')::int,
  0,
  'una tanda vacía no es un error'
);

-- El techo existe para no perder la transacción entera contra el
-- `statement_timeout`: es mejor decir que la tanda es grande que commitear nada.
select throws_ok(
  $q$select public.finish_order_batch(
       (select array_agg(gen_random_uuid()) from generate_series(1, 501)),
       false, true)$q$,
  '22023',
  null,
  'una tanda por encima del techo se rechaza antes de empezar'
);

select * from finish();
rollback;

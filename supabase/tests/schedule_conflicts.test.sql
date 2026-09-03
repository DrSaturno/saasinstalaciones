-- Fase 2 de agenda: detectar el conflicto.
--
-- **El cerrojo es lo más importante de este archivo.** El backlog daba por
-- hecho que `work_assignments` tenía exclusión por GiST; no la tenía, sólo un
-- índice. La diferencia es que un índice acelera buscar solapamientos y una
-- restricción los impide. Si alguien la saca creyendo que el gate alcanza, este
-- test falla y explica por qué el gate solo no alcanza: basta una vía que lo
-- esquive para que dos asignaciones superpuestas entren sin protestar.
--
-- **Y la distinción que sostiene todo el punto:** «no puedo verificarlo» no es
-- «está bien». Un trabajo vecino sin coordenadas devuelve `NO_COORDINATES`, no
-- `feasible: true` (AG-R10).

begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into public.companies (id, name, country, order_prefix)
values ('f6000000-0000-0000-0000-000000000001', 'Empresa Conflictos', 'AR', 'ECF');

insert into auth.users (id, email, raw_user_meta_data)
values ('f6000000-0000-0000-0000-000000000012', 'instalador.cf@test.dev',
        '{"role":"installer"}'::jsonb);

insert into public.installers (id, zones)
values ('f6000000-0000-0000-0000-000000000012', array['AR-BA-AMBA'])
on conflict (id) do nothing;

insert into public.company_installers (company_id, installer_id, role, status, joined_at)
values ('f6000000-0000-0000-0000-000000000001',
        'f6000000-0000-0000-0000-000000000012', 'installer', 'active', now());

insert into public.projects (id, company_id, name)
values ('f6000000-0000-0000-0000-000000000021',
        'f6000000-0000-0000-0000-000000000001', 'Proyecto Conflictos');

-- Dos puntos reales a 1,5 km: el Obelisco y una esquina cercana.
insert into public.sites (id, project_id, company_id, name, lat, lng) values
  ('f6000000-0000-0000-0000-000000000031', 'f6000000-0000-0000-0000-000000000021',
   'f6000000-0000-0000-0000-000000000001', 'Sitio A', -34.6037, -58.3816),
  ('f6000000-0000-0000-0000-000000000032', 'f6000000-0000-0000-0000-000000000021',
   'f6000000-0000-0000-0000-000000000001', 'Sitio B', -34.6158, -58.3731),
  -- Y uno sin coordenadas, que es el caso de 13 de las 30 locaciones reales.
  ('f6000000-0000-0000-0000-000000000033', 'f6000000-0000-0000-0000-000000000021',
   'f6000000-0000-0000-0000-000000000001', 'Sitio sin ubicar', null, null);

insert into public.work_orders (
  id, company_id, project_id, site_id, order_number, title, status
) values
  ('f6000000-0000-0000-0000-0000000000aa', 'f6000000-0000-0000-0000-000000000001',
   'f6000000-0000-0000-0000-000000000021', 'f6000000-0000-0000-0000-000000000031',
   'ECF-0001', 'Trabajo A', 'pendiente'),
  ('f6000000-0000-0000-0000-0000000000bb', 'f6000000-0000-0000-0000-000000000001',
   'f6000000-0000-0000-0000-000000000021', 'f6000000-0000-0000-0000-000000000032',
   'ECF-0002', 'Trabajo B', 'pendiente');

insert into public.work_activities (
  id, company_id, work_order_id, activity_type, position, lifecycle,
  schedule_precision, scheduled_start_at, scheduled_end_at
) values
  ('f6000000-0000-0000-0000-0000000000c1', 'f6000000-0000-0000-0000-000000000001',
   'f6000000-0000-0000-0000-0000000000aa', 'execution', 1, 'scheduled',
   'exact', '2026-09-10 14:00-03', '2026-09-10 18:00-03'),
  ('f6000000-0000-0000-0000-0000000000c2', 'f6000000-0000-0000-0000-000000000001',
   'f6000000-0000-0000-0000-0000000000bb', 'execution', 1, 'scheduled',
   'exact', '2026-09-10 16:00-03', '2026-09-10 20:00-03');

-- ---------------------------------------------------------------------------
-- La estimación de traslado
-- ---------------------------------------------------------------------------

select is(
  public.estimated_travel_minutes(-34.6037, -58.3816, null, null),
  null,
  'sin coordenadas no hay estimación degradada: no hay estimación'
);

select ok(
  public.estimated_travel_minutes(-34.6037, -58.3816, -34.6037, -58.3816) >= 20,
  'ir al mismo punto igual lleva el margen mínimo: hay que guardar la herramienta'
);

select ok(
  public.estimated_travel_minutes(-34.6037, -58.3816, -34.9215, -57.9545)
    > public.estimated_travel_minutes(-34.6037, -58.3816, -34.6158, -58.3731),
  'y más lejos lleva más tiempo, que es lo mínimo que se le pide'
);

-- ---------------------------------------------------------------------------
-- El cerrojo
-- ---------------------------------------------------------------------------

select lives_ok(
  $q$insert into public.work_assignments
       (activity_id, company_id, installer_id, status, version,
        schedule_precision, scheduled_start_at, scheduled_end_at)
     values ('f6000000-0000-0000-0000-0000000000c1',
             'f6000000-0000-0000-0000-000000000001',
             'f6000000-0000-0000-0000-000000000012', 'active', 1,
             'exact', '2026-09-10 14:00-03', '2026-09-10 18:00-03')$q$,
  'la primera asignación entra'
);

select throws_ok(
  $q$insert into public.work_assignments
       (activity_id, company_id, installer_id, status, version,
        schedule_precision, scheduled_start_at, scheduled_end_at)
     values ('f6000000-0000-0000-0000-0000000000c2',
             'f6000000-0000-0000-0000-000000000001',
             'f6000000-0000-0000-0000-000000000012', 'active', 1,
             'exact', '2026-09-10 16:00-03', '2026-09-10 20:00-03')$q$,
  '23P01',
  null,
  'y la que se le superpone la frena la base, no una capa de aplicación'
);

select is(
  public.installer_overlapping_assignments(
    'f6000000-0000-0000-0000-000000000012',
    tstzrange('2026-09-10 16:00-03', '2026-09-10 20:00-03', '[)')),
  1,
  'la detección encuentra el compromiso que ya existe'
);

select is(
  public.installer_overlapping_assignments(
    'f6000000-0000-0000-0000-000000000012',
    tstzrange('2026-09-11 09:00-03', '2026-09-11 13:00-03', '[)')),
  0,
  'y otro día no choca con nada'
);

select is(
  public.installer_overlapping_assignments(
    'f6000000-0000-0000-0000-000000000012',
    tstzrange('2026-09-10 16:00-03', '2026-09-10 20:00-03', '[)'),
    'f6000000-0000-0000-0000-0000000000c1'),
  0,
  'una actividad no choca consigo misma al reprogramarse'
);

-- ---------------------------------------------------------------------------
-- El traslado entre trabajos: el caso literal del pedido
-- ---------------------------------------------------------------------------

-- Termina 18:00 en el Sitio A y el siguiente empieza 18:10 en el B, a 1,5 km.
select is(
  (public.installer_travel_feasibility(
     'f6000000-0000-0000-0000-000000000012',
     tstzrange('2026-09-10 18:10-03', '2026-09-10 20:00-03', '[)'),
     -34.6158, -58.3731) ->> 'feasible')::boolean,
  false,
  'diez minutos no alcanzan para cruzar la ciudad y volver a montar'
);

select is(
  (public.installer_travel_feasibility(
     'f6000000-0000-0000-0000-000000000012',
     tstzrange('2026-09-10 19:00-03', '2026-09-10 20:00-03', '[)'),
     -34.6158, -58.3731) ->> 'feasible')::boolean,
  true,
  'con una hora de margen, sí'
);

-- El caso que más fácil se cuela como «todo bien».
select is(
  public.installer_travel_feasibility(
    'f6000000-0000-0000-0000-000000000012',
    tstzrange('2026-09-10 18:10-03', '2026-09-10 20:00-03', '[)'),
    null, null) ->> 'reason',
  'NO_COORDINATES',
  'con un vecino que no se puede medir, la respuesta es «no verificable», no «está bien»'
);

select * from finish();

rollback;

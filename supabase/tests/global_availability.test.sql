-- Fase 1 de agenda: la disponibilidad personal, que no ve ninguna empresa.
--
-- **El caso que este archivo existe para fijar** es el de la privacidad: el
-- gerente de la propia empresa del instalador tiene que ver CERO. Es lo que
-- permite que la plataforma sepa que alguien no está disponible sin contarle a
-- una empresa que otra le ocupó el martes (REQ-11.4). Si algún día alguien
-- agrega una policy "para que la empresa pueda planificar mejor", este test
-- falla y explica por qué no.
--
-- **Y una regresión real.** Hasta el 03-09-2026 ningún insert en
-- `installer_global_unavailability` funcionaba: el trigger compartido evaluaba
-- `new.timezone` —columna que esa tabla no tiene— porque PL/pgSQL no
-- cortocircuita la condición. Estuvo roto desde agosto y no lo notó nadie
-- porque ninguna pantalla usaba la tabla.

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

insert into public.companies (id, name, country, order_prefix)
values ('f5000000-0000-0000-0000-000000000001', 'Empresa Disponibilidad', 'AR', 'EDS');

insert into auth.users (id, email, raw_user_meta_data) values
  ('f5000000-0000-0000-0000-000000000011', 'gerente.ds@test.dev',
   '{"role":"company_manager","company_id":"f5000000-0000-0000-0000-000000000001"}'::jsonb),
  ('f5000000-0000-0000-0000-000000000012', 'instalador.ds@test.dev',
   '{"role":"installer"}'::jsonb),
  ('f5000000-0000-0000-0000-000000000013', 'otro.ds@test.dev',
   '{"role":"installer"}'::jsonb);

insert into public.installers (id, zones) values
  ('f5000000-0000-0000-0000-000000000012', array['AR-BA-AMBA']),
  ('f5000000-0000-0000-0000-000000000013', array['AR-BA-AMBA'])
on conflict (id) do nothing;

insert into public.company_installers (company_id, installer_id, role, status, joined_at) values
  ('f5000000-0000-0000-0000-000000000001',
   'f5000000-0000-0000-0000-000000000012', 'installer', 'active', now()),
  ('f5000000-0000-0000-0000-000000000001',
   'f5000000-0000-0000-0000-000000000013', 'installer', 'active', now());

insert into public.company_membership_roles (company_id, user_id, role) values
  ('f5000000-0000-0000-0000-000000000001',
   'f5000000-0000-0000-0000-000000000012', 'installer'),
  ('f5000000-0000-0000-0000-000000000001',
   'f5000000-0000-0000-0000-000000000013', 'installer')
on conflict do nothing;

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"f5000000-0000-0000-0000-000000000012","role":"authenticated"}';

select lives_ok(
  $q$insert into public.installer_global_weekly_availability
       (installer_id, company_id, weekday, starts_at, ends_at)
     values ('f5000000-0000-0000-0000-000000000012',
             'f5000000-0000-0000-0000-000000000001', 1, '09:00', '17:00')$q$,
  'la persona declara los días y horas en que trabaja'
);

-- La regresión: antes del 03-09-2026 esto fallaba SIEMPRE.
select lives_ok(
  $q$insert into public.installer_global_unavailability
       (installer_id, company_id, starts_at, ends_at, reason)
     values ('f5000000-0000-0000-0000-000000000012',
             'f5000000-0000-0000-0000-000000000001',
             now() + interval '5 days', now() + interval '10 days', 'Vacaciones')$q$,
  'y también un período en que no va a estar, sin pedirle permiso a nadie'
);

select throws_ok(
  $q$insert into public.installer_global_weekly_availability
       (installer_id, company_id, weekday, starts_at, ends_at, timezone)
     values ('f5000000-0000-0000-0000-000000000012',
             'f5000000-0000-0000-0000-000000000001', 2, '09:00', '17:00',
             'Marte/Olympus')$q$,
  'P0001',
  null,
  'un huso que no existe se rechaza: la validación sigue viva después del arreglo'
);

select is(
  (select count(*)::integer from public.installer_global_weekly_availability),
  1,
  've lo suyo'
);

-- ---------------------------------------------------------------------------
-- Nadie más
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"f5000000-0000-0000-0000-000000000011","role":"authenticated"}';

select is(
  (select count(*)::integer from public.installer_global_weekly_availability),
  0,
  'el GERENTE de su propia empresa no ve su disponibilidad personal'
);

select is(
  (select count(*)::integer from public.installer_global_unavailability),
  0,
  'ni sus períodos de ausencia: por eso la plataforma puede usarlos sin filtrar nada'
);

set local request.jwt.claims to
  '{"sub":"f5000000-0000-0000-0000-000000000013","role":"authenticated"}';

select is(
  (select count(*)::integer from public.installer_global_unavailability),
  0,
  'y otro instalador del mismo equipo tampoco'
);

select throws_ok(
  $q$insert into public.installer_global_unavailability
       (installer_id, company_id, starts_at, ends_at, reason)
     values ('f5000000-0000-0000-0000-000000000012',
             'f5000000-0000-0000-0000-000000000001',
             now(), now() + interval '1 day', 'ajena')$q$,
  'P0001',
  null,
  'nadie carga una ausencia en nombre de otro: el trigger frena antes que la RLS'
);

reset role;

select * from finish();

rollback;

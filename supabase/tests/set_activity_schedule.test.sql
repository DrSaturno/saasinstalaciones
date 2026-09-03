-- Fase 0 de agenda: la única puerta que puede mover un horario.
--
-- Dos casos justifican el archivo:
--
-- 1. **La puerta sigue siendo única.** Un `update` directo sobre los campos de
--    agenda tiene que seguir fallando. Si dejara de fallar, la Fase 3 podría
--    poner todos los controles que quiera adentro de la función y alguien los
--    esquivaría escribiendo por al lado (AG-R3).
-- 2. **No se inventan franjas.** Sin hora de fin la precisión llega hasta el
--    día, y sin fecha no llega a nada. Fabricar un horario para poder bloquear
--    con él es exactamente lo que AC-11-C prohíbe.

begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

insert into public.companies (id, name, country, order_prefix)
values ('f4000000-0000-0000-0000-000000000001', 'Empresa Agenda', 'AR', 'EAG');

insert into auth.users (id, email, raw_user_meta_data) values
  ('f4000000-0000-0000-0000-000000000011', 'gerente.ag@test.dev',
   '{"role":"company_manager","company_id":"f4000000-0000-0000-0000-000000000001"}'::jsonb),
  ('f4000000-0000-0000-0000-000000000012', 'instalador.ag@test.dev',
   '{"role":"installer"}'::jsonb);

insert into public.installers (id, zones)
values ('f4000000-0000-0000-0000-000000000012', array['AR-BA-AMBA'])
on conflict (id) do nothing;

insert into public.company_installers (company_id, installer_id, role, status, joined_at)
values ('f4000000-0000-0000-0000-000000000001',
        'f4000000-0000-0000-0000-000000000012', 'installer', 'active', now());

insert into public.company_membership_roles (company_id, user_id, role)
values ('f4000000-0000-0000-0000-000000000001',
        'f4000000-0000-0000-0000-000000000012', 'installer')
on conflict do nothing;

insert into public.projects (id, company_id, name)
values ('f4000000-0000-0000-0000-000000000021',
        'f4000000-0000-0000-0000-000000000001', 'Proyecto Agenda');

insert into public.sites (id, project_id, company_id, name)
values ('f4000000-0000-0000-0000-000000000031',
        'f4000000-0000-0000-0000-000000000021',
        'f4000000-0000-0000-0000-000000000001', 'Punto Agenda');

insert into public.work_orders (
  id, company_id, project_id, site_id, order_number, title, status
) values (
  'f4000000-0000-0000-0000-0000000000aa', 'f4000000-0000-0000-0000-000000000001',
  'f4000000-0000-0000-0000-000000000021', 'f4000000-0000-0000-0000-000000000031',
  'EAG-0001', 'Cartel nocturno', 'pendiente'
);

insert into public.work_activities (
  id, company_id, work_order_id, activity_type, position, lifecycle,
  schedule_precision, timezone
) values (
  'f4000000-0000-0000-0000-0000000000bb', 'f4000000-0000-0000-0000-000000000001',
  'f4000000-0000-0000-0000-0000000000aa', 'execution', 1, 'draft',
  'unknown', 'America/Argentina/Buenos_Aires'
);

-- ---------------------------------------------------------------------------
-- La puerta es única
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"f4000000-0000-0000-0000-000000000011","role":"authenticated"}';

select throws_ok(
  $q$update public.work_activities
        set scheduled_start_at = now(), scheduled_end_at = now() + interval '1 hour',
            schedule_precision = 'exact'
      where id = 'f4000000-0000-0000-0000-0000000000bb'$q$,
  'P0001',
  null,
  'un update directo no mueve la agenda: los controles de la Fase 3 no se esquivan'
);

-- ---------------------------------------------------------------------------
-- Horario exacto
-- ---------------------------------------------------------------------------

select is(
  public.set_activity_schedule(
    'f4000000-0000-0000-0000-0000000000bb', '2026-09-10', '14:00', '18:00'
  ) ->> 'schedule_precision',
  'exact',
  'con inicio y fin, la precisión es exacta'
);

select is(
  (select scheduled_start_at from public.work_activities
    where id = 'f4000000-0000-0000-0000-0000000000bb'),
  '2026-09-10 14:00'::timestamp at time zone 'America/Argentina/Buenos_Aires',
  'y el instante se arma con el huso de la actividad, no en UTC crudo'
);

select is(
  (select lifecycle from public.work_activities
    where id = 'f4000000-0000-0000-0000-0000000000bb'),
  'scheduled',
  'agendar una actividad en borrador la pone en agenda'
);

-- ---------------------------------------------------------------------------
-- Nocturno
-- ---------------------------------------------------------------------------

select public.set_activity_schedule(
  'f4000000-0000-0000-0000-0000000000bb', '2026-09-10', '22:00', '01:00');

select is(
  (select (scheduled_end_at at time zone 'America/Argentina/Buenos_Aires')::date
     from public.work_activities where id = 'f4000000-0000-0000-0000-0000000000bb'),
  '2026-09-11'::date,
  'un trabajo que empieza 22:00 y termina 01:00 cierra al día siguiente'
);

-- ---------------------------------------------------------------------------
-- Fin derivado, y lo que NO se inventa
-- ---------------------------------------------------------------------------

select is(
  public.set_activity_schedule(
    'f4000000-0000-0000-0000-0000000000bb', '2026-09-10', '09:00', null, 240
  ) ->> 'schedule_precision',
  'exact',
  'con inicio y duración, el fin se deriva'
);

select is(
  public.set_activity_schedule(
    'f4000000-0000-0000-0000-0000000000bb', '2026-09-10', '09:00', null
  ) ->> 'schedule_precision',
  'day',
  'AC-11-C: con inicio pero sin fin ni duración, la agenda llega hasta el día'
);

select is(
  (select scheduled_start_at is null from public.work_activities
    where id = 'f4000000-0000-0000-0000-0000000000bb'),
  true,
  'y no queda una franja fabricada con la que después bloquear'
);

select is(
  public.set_activity_schedule('f4000000-0000-0000-0000-0000000000bb') ->> 'schedule_precision',
  'unknown',
  'sin fecha no se sabe nada, que es una respuesta válida'
);

-- ---------------------------------------------------------------------------
-- Entradas inválidas y permisos
-- ---------------------------------------------------------------------------

select throws_ok(
  $q$select public.set_activity_schedule(
      'f4000000-0000-0000-0000-0000000000bb', '2026-09-10', '09:00', '10:00', -5)$q$,
  'P0001',
  null,
  'una duración negativa no es una duración'
);

select throws_ok(
  $q$select public.set_activity_schedule(
      'f4000000-0000-0000-0000-0000000000bb', '2026-09-10', '09:00', '10:00',
      null, 'Marte/Olympus')$q$,
  'P0001',
  null,
  'y un huso que no existe se rechaza en vez de guardarse'
);

set local request.jwt.claims to
  '{"sub":"f4000000-0000-0000-0000-000000000012","role":"authenticated"}';

select throws_ok(
  $q$select public.set_activity_schedule(
      'f4000000-0000-0000-0000-0000000000bb', '2026-09-12', '08:00', '12:00')$q$,
  'P0001',
  null,
  'el instalador no se agenda a sí mismo: agendar es de quien opera la orden'
);

reset role;

select * from finish();

rollback;

-- Fase 3 de agenda: el gate. Todas las vías de asignación pasan por acá, o no
-- pasan.
--
-- Tres casos son los que justifican el archivo entero:
--
-- 1. **La puerta es única de verdad.** Un `update` directo sobre
--    `assigned_installer_id` tiene que fallar SIEMPRE, no sólo cuando a
--    alguien se le ocurre llamar a una función de chequeo. Si este test
--    empezara a pasar, todo el resto del gate sería decorativo.
-- 2. **El override sólo existe para el traslado.** Un solapamiento no admite
--    motivo que lo salve (AG-R4); un traslado insuficiente sí, y sólo con un
--    motivo de verdad (AG-R5).
-- 3. **Una baja sobre una asignación forzada nace justificada**, sin importar
--    lo que el gerente tilde al revisarla: si la plataforma avisó y la
--    empresa asignó igual, la responsabilidad es de la empresa (AG-GATE-04).

begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

insert into public.companies (id, name, country, order_prefix)
values ('f7000000-0000-0000-0000-000000000001', 'Empresa Gate', 'AR', 'EGT');

insert into auth.users (id, email, raw_user_meta_data) values
  ('f7000000-0000-0000-0000-000000000011', 'gerente.gt@test.dev',
   '{"role":"company_manager","company_id":"f7000000-0000-0000-0000-000000000001"}'::jsonb),
  ('f7000000-0000-0000-0000-000000000012', 'instalador.gt@test.dev',
   '{"role":"installer"}'::jsonb),
  ('f7000000-0000-0000-0000-000000000013', 'ajeno.gt@test.dev',
   '{"role":"installer"}'::jsonb);

insert into public.installers (id, zones)
values ('f7000000-0000-0000-0000-000000000012', array['AR-BA-AMBA'])
on conflict (id) do nothing;

insert into public.company_installers (company_id, installer_id, role, status, joined_at)
values ('f7000000-0000-0000-0000-000000000001',
        'f7000000-0000-0000-0000-000000000012', 'installer', 'active', now());

insert into public.projects (id, company_id, name)
values ('f7000000-0000-0000-0000-000000000021',
        'f7000000-0000-0000-0000-000000000001', 'Proyecto Gate');

-- Dos puntos reales a 1,5 km, y uno cerrado.
insert into public.sites (id, project_id, company_id, name, lat, lng) values
  ('f7000000-0000-0000-0000-000000000031', 'f7000000-0000-0000-0000-000000000021',
   'f7000000-0000-0000-0000-000000000001', 'A', -34.6037, -58.3816),
  ('f7000000-0000-0000-0000-000000000032', 'f7000000-0000-0000-0000-000000000021',
   'f7000000-0000-0000-0000-000000000001', 'B', -34.6158, -58.3731);

insert into public.work_orders (
  id, company_id, project_id, site_id, order_number, title, status
) values
  ('f7000000-0000-0000-0000-0000000000a1', 'f7000000-0000-0000-0000-000000000001',
   'f7000000-0000-0000-0000-000000000021', 'f7000000-0000-0000-0000-000000000031',
   'EGT-0001', 'A', 'pendiente'),
  ('f7000000-0000-0000-0000-0000000000a2', 'f7000000-0000-0000-0000-000000000001',
   'f7000000-0000-0000-0000-000000000021', 'f7000000-0000-0000-0000-000000000032',
   'EGT-0002', 'B', 'pendiente'),
  ('f7000000-0000-0000-0000-0000000000a3', 'f7000000-0000-0000-0000-000000000001',
   'f7000000-0000-0000-0000-000000000021', 'f7000000-0000-0000-0000-000000000031',
   'EGT-0003', 'Cerrada', 'finalizada');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"f7000000-0000-0000-0000-000000000011","role":"authenticated"}';

select public.create_order_activities('f7000000-0000-0000-0000-0000000000a1', false, true);
select public.create_order_activities('f7000000-0000-0000-0000-0000000000a2', false, true);
select public.create_order_activities('f7000000-0000-0000-0000-0000000000a3', false, true);

-- ---------------------------------------------------------------------------
-- La puerta es única
-- ---------------------------------------------------------------------------

select throws_ok(
  $q$update public.work_orders
       set assigned_installer_id = 'f7000000-0000-0000-0000-000000000012'
     where id = 'f7000000-0000-0000-0000-0000000000a1'$q$,
  'P0001',
  null,
  'un update directo se rechaza: la única puerta es el gate'
);

-- ---------------------------------------------------------------------------
-- El caso limpio
-- ---------------------------------------------------------------------------

select is(
  public.assign_installer_gate(
    'f7000000-0000-0000-0000-0000000000a1',
    'f7000000-0000-0000-0000-000000000012',
    'aaaaaaaa-0000-0000-0000-000000000001') ->> 'code',
  'AVAILABLE',
  'sin ningún compromiso previo, la asignación pasa'
);

select is(
  (select assigned_installer_id from public.work_orders
    where id = 'f7000000-0000-0000-0000-0000000000a1'),
  'f7000000-0000-0000-0000-000000000012'::uuid,
  'y se proyecta al escalar legacy que el resto de la app todavía lee'
);

select is(
  (public.assign_installer_gate(
    'f7000000-0000-0000-0000-0000000000a1',
    'f7000000-0000-0000-0000-000000000012',
    'aaaaaaaa-0000-0000-0000-000000000001') ->> 'code'),
  'AVAILABLE',
  'un reintento con el mismo operation_id devuelve lo mismo, sin recalcular'
);

select is(
  (select count(*)::integer from public.work_assignments
    where activity_id = (select id from work_activities
      where work_order_id = 'f7000000-0000-0000-0000-0000000000a1')),
  1,
  'y el reintento no duplica la fila'
);

-- ---------------------------------------------------------------------------
-- Elegibilidad y estado de la orden
-- ---------------------------------------------------------------------------

select is(
  public.assign_installer_gate(
    'f7000000-0000-0000-0000-0000000000a1',
    'f7000000-0000-0000-0000-000000000013',
    'aaaaaaaa-0000-0000-0000-000000000002') ->> 'code',
  'NOT_ELIGIBLE',
  'alguien que no está en el roster de esta empresa no es asignable'
);

select is(
  public.assign_installer_gate(
    'f7000000-0000-0000-0000-0000000000a3',
    'f7000000-0000-0000-0000-000000000012',
    'aaaaaaaa-0000-0000-0000-000000000003') ->> 'code',
  'ACTIVITY_CLOSED',
  'una orden ya finalizada no recibe una asignación nueva'
);

-- ---------------------------------------------------------------------------
-- Ausencia: bloqueo duro
-- ---------------------------------------------------------------------------

select public.set_activity_schedule(
  (select id from work_activities where work_order_id = 'f7000000-0000-0000-0000-0000000000a2'),
  (now() at time zone 'America/Argentina/Buenos_Aires')::date + 5, '10:00', '14:00');

-- Se inserta ya aprobada saliendo del rol: `installer_unavailability` sólo
-- deja insertar al propio instalador (pendiente) o revisar a la empresa por
-- su RPC — ninguna de las dos arma directamente el caso "ya aprobada" que
-- este test necesita, así que se salta la RLS para el setup, no para lo que
-- se está probando.
reset role;
insert into public.installer_unavailability (
  installer_id, company_id, starts_at, ends_at, reason, status
) values (
  'f7000000-0000-0000-0000-000000000012', 'f7000000-0000-0000-0000-000000000001',
  (now() at time zone 'America/Argentina/Buenos_Aires')::date + 5,
  (now() at time zone 'America/Argentina/Buenos_Aires')::date + 6,
  'licencia', 'approved'
);
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"f7000000-0000-0000-0000-000000000011","role":"authenticated"}';

select is(
  public.assign_installer_gate(
    'f7000000-0000-0000-0000-0000000000a2',
    'f7000000-0000-0000-0000-000000000012',
    'aaaaaaaa-0000-0000-0000-000000000004') ->> 'code',
  'OUTSIDE_AVAILABILITY',
  'una ausencia aprobada bloquea, sin importar quién sea la empresa'
);

-- Mismo motivo que el insert de arriba: `installer_unavailability` no tiene
-- ninguna policy de DELETE para el manager (sólo lectura y la revisión vía
-- `w`/UPDATE) — sin este bypass el delete afecta cero filas en silencio, la
-- ausencia aprobada queda viva, y todo lo que sigue se bloquea con
-- OUTSIDE_AVAILABILITY en vez de llegar al traslado que este bloque prueba.
reset role;
delete from public.installer_unavailability
 where installer_id = 'f7000000-0000-0000-0000-000000000012';
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"f7000000-0000-0000-0000-000000000011","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- Solapamiento: bloqueo duro, sin override
-- ---------------------------------------------------------------------------

select public.set_activity_schedule(
  (select id from work_activities where work_order_id = 'f7000000-0000-0000-0000-0000000000a1'),
  (now() at time zone 'America/Argentina/Buenos_Aires')::date + 5, '12:00', '16:00');

select is(
  public.assign_installer_gate(
    'f7000000-0000-0000-0000-0000000000a2',
    'f7000000-0000-0000-0000-000000000012',
    'aaaaaaaa-0000-0000-0000-000000000005') ->> 'code',
  'SCHEDULE_CONFLICT',
  '10-14 y 12-16 se pisan: la misma persona no puede estar en los dos'
);

select is(
  (public.assign_installer_gate(
    'f7000000-0000-0000-0000-0000000000a2',
    'f7000000-0000-0000-0000-000000000012',
    'aaaaaaaa-0000-0000-0000-000000000005') ->> 'override_allowed')::boolean,
  false,
  'y no hay override que lo salve: un solapamiento es un hecho, no una estimación'
);

-- Se reprograma A lejos para que lo único que quede sea el traslado.
select public.set_activity_schedule(
  (select id from work_activities where work_order_id = 'f7000000-0000-0000-0000-0000000000a1'),
  (now() at time zone 'America/Argentina/Buenos_Aires')::date + 5, '08:00', '09:50');

-- ---------------------------------------------------------------------------
-- Traslado: bloqueo con override
-- ---------------------------------------------------------------------------

select is(
  public.assign_installer_gate(
    'f7000000-0000-0000-0000-0000000000a2',
    'f7000000-0000-0000-0000-000000000012',
    'aaaaaaaa-0000-0000-0000-000000000006') ->> 'code',
  'TRAVEL_CONFLICT',
  'diez minutos entre A y B (a 1,5 km) no alcanzan para el traslado'
);

select is(
  public.assign_installer_gate(
    'f7000000-0000-0000-0000-0000000000a2',
    'f7000000-0000-0000-0000-000000000012',
    'aaaaaaaa-0000-0000-0000-000000000007',
    'corto') ->> 'code',
  'TRAVEL_CONFLICT',
  'un motivo de seis letras no explica por qué se saltea el control'
);

select is(
  public.assign_installer_gate(
    'f7000000-0000-0000-0000-0000000000a2',
    'f7000000-0000-0000-0000-000000000012',
    'aaaaaaaa-0000-0000-0000-000000000008',
    'El cliente pidió arrancar hoy mismo, coordinamos por teléfono') ->> 'code',
  'AVAILABLE',
  'con un motivo de verdad, la empresa puede forzarlo'
);

select is(
  (select count(*)::integer from public.assignment_override_audit
    where assignment_id = (
      select assignment_id from public.assignment_command_receipts
       where operation_id = 'aaaaaaaa-0000-0000-0000-000000000008')),
  1,
  'y queda una fila auditada con el motivo — es la marca de que se forzó'
);

-- ---------------------------------------------------------------------------
-- AG-GATE-04: la baja sobre una asignación forzada nace justificada
-- ---------------------------------------------------------------------------

-- Hoy mismo, no en +5: dentro de las 48hs hábiles la baja se auto-aprueba
-- sin revisión (`cancel_in_notice`, no penaliza — es otro camino, no un
-- bug) y `review_order_cancellation` no tendría nada pendiente que resolver.
-- Este bloque prueba justo la revisión manual, así que hace falta quedar
-- fuera de plazo.
reset role;
update public.work_orders set scheduled_date =
  (now() at time zone 'America/Argentina/Buenos_Aires')::date
 where id = 'f7000000-0000-0000-0000-0000000000a2';

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"f7000000-0000-0000-0000-000000000012","role":"authenticated"}';

select ok(
  public.request_order_cancellation(
    'f7000000-0000-0000-0000-0000000000a2', 'other',
    'No llego a tiempo entre los dos trabajos'
  ) is not null,
  'el instalador pide la baja'
);

set local request.jwt.claims to
  '{"sub":"f7000000-0000-0000-0000-000000000011","role":"authenticated"}';

select public.review_order_cancellation(
  (select id from order_cancellation_requests
    where order_id = 'f7000000-0000-0000-0000-0000000000a2'),
  'approved', false, 'revisado'
);

select is(
  (select justified from order_cancellation_requests
    where order_id = 'f7000000-0000-0000-0000-0000000000a2'),
  true,
  'aunque el gerente tildó "no justificada", el sistema la fuerza igual: la responsabilidad fue de la empresa que asignó pese al aviso'
);

reset role;

select * from finish();

rollback;

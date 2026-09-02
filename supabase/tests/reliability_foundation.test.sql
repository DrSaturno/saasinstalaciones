-- Fase 0 de confiabilidad: reprogramaciones, pedidos de baja y calendario.
--
-- Lo que este archivo protege son las cuatro decisiones que hacen que el
-- sistema no penalice injustamente. Son fáciles de deshacer sin darse cuenta:
--
--   1. `notified_at` es nullable y separado de `created_at`. Es la compuerta:
--      mover la fecha no arranca ningún plazo, avisarle al instalador sí. Si
--      alguien la vuelve `not null default now()`, el plazo pasa a correr
--      desde que la empresa toca la fecha y el requisito queda roto.
--   2. No existe ninguna columna de vencimiento. El estado se deriva de
--      `notified_at` + calendario, así un job que no corre no puede penalizar
--      a nadie. Agregar una columna "vencido" reintroduce exactamente eso.
--   3. El instalador pide la baja; no se la aprueba. La política de insert le
--      exige `status = 'pending'`.
--   4. Los feriados nacionales no se editan desde la aplicación, y los días
--      de una empresa no se filtran a otra.

begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

-- ---------------------------------------------------------------------------
-- Estructura: las decisiones de diseño, afirmadas como tales
-- ---------------------------------------------------------------------------

select is(
  (
    select is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'order_reschedules'
      and column_name = 'notified_at'
  ),
  'YES',
  'notified_at es nullable: mover la fecha no arranca el plazo, avisar sí'
);

select is(
  (
    select count(*)::integer from information_schema.columns
    where table_schema = 'public' and table_name = 'order_reschedules'
      and column_name ~ 'expire|expiro|vencid|overdue'
  ),
  0,
  'no hay columna de vencimiento: el estado se deriva, no lo escribe un job'
);

select has_column(
  'public', 'order_reschedules', 'superseded_at',
  'una reprogramación puede quedar superada por otra posterior'
);

select has_column(
  'public', 'order_cancellation_requests', 'scheduled_date_at_request',
  'la baja guarda la fecha que tenía la orden en ese momento'
);

select has_column(
  'public', 'order_cancellation_requests', 'within_notice',
  'y si estaba en plazo, calculado al pedirla y no después'
);

-- ---------------------------------------------------------------------------
-- Fixture: una empresa con gerente, coordinador y dos instaladores, y una
-- orden asignada al primero. El segundo instalador existe para probar que no
-- ve ni toca lo ajeno.
-- ---------------------------------------------------------------------------

insert into public.companies (id, name, country, order_prefix)
values ('d1000000-0000-0000-0000-000000000001', 'Empresa Confiable', 'AR', 'ECO');

insert into auth.users (id, email, raw_user_meta_data) values
  ('d1000000-0000-0000-0000-000000000011', 'gerente.rel@test.dev',
   '{"role":"company_manager","company_id":"d1000000-0000-0000-0000-000000000001"}'::jsonb),
  ('d1000000-0000-0000-0000-000000000012', 'instalador.rel@test.dev',
   '{"role":"installer"}'::jsonb),
  ('d1000000-0000-0000-0000-000000000013', 'otro.rel@test.dev',
   '{"role":"installer"}'::jsonb);

insert into public.installers (id, zones) values
  ('d1000000-0000-0000-0000-000000000012', array['AR-BA-AMBA']),
  ('d1000000-0000-0000-0000-000000000013', array['AR-BA-AMBA'])
on conflict (id) do update set zones = excluded.zones;

-- Los instaladores necesitan fila en las DOS tablas de membresía: la del
-- roster es el ancla y la de roles dice qué puede hacer, y `auth_companies()`
-- exige ambas más una empresa activa.
--
-- El gerente NO va en ninguna de las dos. `company_membership_roles.role` sólo
-- admite 'installer' y 'coordinator': la pertenencia del gerente vive en su
-- perfil y se lee con `auth_role()` / `auth_company()`. Ponerlo acá no sólo
-- sobra, revienta el CHECK.
insert into public.company_installers (company_id, installer_id, role, status, joined_at)
values
  ('d1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000012',
   'installer', 'active', now()),
  ('d1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000013',
   'installer', 'active', now());

insert into public.company_membership_roles (company_id, user_id, role)
values
  ('d1000000-0000-0000-0000-000000000001',
   'd1000000-0000-0000-0000-000000000012', 'installer'),
  ('d1000000-0000-0000-0000-000000000001',
   'd1000000-0000-0000-0000-000000000013', 'installer')
on conflict do nothing;

insert into public.projects (id, company_id, name)
values ('d1000000-0000-0000-0000-000000000021',
        'd1000000-0000-0000-0000-000000000001', 'Proyecto Confiable');

insert into public.sites (id, project_id, company_id, name)
values ('d1000000-0000-0000-0000-000000000031',
        'd1000000-0000-0000-0000-000000000021',
        'd1000000-0000-0000-0000-000000000001', 'Punto 1');

insert into public.work_orders (
  id, company_id, project_id, site_id, order_number, title,
  assigned_installer_id, scheduled_date, status
) values (
  'd1000000-0000-0000-0000-000000000041',
  'd1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000021',
  'd1000000-0000-0000-0000-000000000031',
  'ECO-0001', 'Instalación de prueba',
  'd1000000-0000-0000-0000-000000000012', '2026-08-25', 'planificada'
);

-- ---------------------------------------------------------------------------
-- Reglas de integridad de la reprogramación
-- ---------------------------------------------------------------------------

select lives_ok(
  $$insert into public.order_reschedules
      (id, company_id, order_id, installer_id, previous_date, new_date, calendar_country)
    values ('d1000000-0000-0000-0000-000000000051',
            'd1000000-0000-0000-0000-000000000001',
            'd1000000-0000-0000-0000-000000000041',
            'd1000000-0000-0000-0000-000000000012',
            '2026-08-25', '2026-09-01', 'AR')$$,
  'se registra la reprogramación aunque todavía no se haya notificado'
);

select is(
  (
    select notified_at from public.order_reschedules
    where id = 'd1000000-0000-0000-0000-000000000051'
  ),
  null,
  'y nace sin notificar: el plazo del instalador todavía no empezó'
);

select throws_ok(
  $$update public.order_reschedules
    set response = 'accepted', responded_at = now()
    where id = 'd1000000-0000-0000-0000-000000000051'$$,
  '23514',
  null,
  'no se puede responder una reprogramación que nunca se notificó'
);

select throws_ok(
  $$update public.order_reschedules
    set response = 'accepted'
    where id = 'd1000000-0000-0000-0000-000000000051'$$,
  '23514',
  null,
  'ni dejar una respuesta sin el momento en que se registró'
);

select throws_ok(
  $$insert into public.order_reschedules
      (company_id, order_id, installer_id, new_date, calendar_country)
    values ('d1000000-0000-0000-0000-000000000001',
            'd1000000-0000-0000-0000-000000000041',
            'd1000000-0000-0000-0000-000000000012',
            '2026-09-10', 'AR')$$,
  '23505',
  null,
  'una sola pregunta abierta por orden: dos plazos simultáneos no tienen sentido'
);

update public.order_reschedules
set notified_at = now()
where id = 'd1000000-0000-0000-0000-000000000051';

select lives_ok(
  $$update public.order_reschedules
    set response = 'accepted', responded_at = now()
    where id = 'd1000000-0000-0000-0000-000000000051'$$,
  'notificada, ahora sí se puede responder'
);

-- Con la anterior ya respondida, entra una nueva.
select lives_ok(
  $$insert into public.order_reschedules
      (id, company_id, order_id, installer_id, new_date, calendar_country)
    values ('d1000000-0000-0000-0000-000000000052',
            'd1000000-0000-0000-0000-000000000001',
            'd1000000-0000-0000-0000-000000000041',
            'd1000000-0000-0000-0000-000000000012',
            '2026-09-10', 'AR')$$,
  'respondida la anterior, la empresa puede volver a reprogramar'
);

-- ---------------------------------------------------------------------------
-- RLS: el instalador ve lo suyo y nada más
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"d1000000-0000-0000-0000-000000000012","role":"authenticated"}';

select is(
  (select count(*)::integer from public.order_reschedules),
  2,
  'el instalador asignado ve las reprogramaciones de su orden'
);

set local request.jwt.claims to
  '{"sub":"d1000000-0000-0000-0000-000000000013","role":"authenticated"}';

select is(
  (select count(*)::integer from public.order_reschedules),
  0,
  'otro instalador de la misma empresa no ve nada: no es su trabajo'
);

-- El UPDATE no falla: la policy USING simplemente no le hace visible ninguna
-- fila, así que toca cero. Se comprueba mirando el resultado, no atrapando un
-- error — y hay que salir del rol para poder ver la fila y confirmarlo.
update public.order_reschedules
set response = 'declined', responded_at = now()
where id = 'd1000000-0000-0000-0000-000000000052';

reset role;

select is(
  (
    select response from public.order_reschedules
    where id = 'd1000000-0000-0000-0000-000000000052'
  ),
  null,
  'y no puede contestar por otro: el intento no tocó nada'
);

-- ---------------------------------------------------------------------------
-- Pedido de baja: el instalador pide, no resuelve
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"d1000000-0000-0000-0000-000000000012","role":"authenticated"}';

select lives_ok(
  $$insert into public.order_cancellation_requests
      (id, company_id, order_id, installer_id, reason_code, reason_note,
       scheduled_date_at_request, within_notice, calendar_country)
    values ('d1000000-0000-0000-0000-000000000061',
            'd1000000-0000-0000-0000-000000000001',
            'd1000000-0000-0000-0000-000000000041',
            'd1000000-0000-0000-0000-000000000012',
            'health', 'Me operan el martes', '2026-08-25', false, 'AR')$$,
  'el instalador asignado puede pedir la baja indicando el motivo'
);

-- Un INSERT que viola una policy WITH CHECK lanza 42501; no filtra la fila en
-- silencio como hace un UPDATE que no matchea el USING.
select throws_ok(
  $$insert into public.order_cancellation_requests
      (company_id, order_id, installer_id, reason_code, within_notice,
       calendar_country, status)
    values ('d1000000-0000-0000-0000-000000000001',
            'd1000000-0000-0000-0000-000000000041',
            'd1000000-0000-0000-0000-000000000012',
            'other', false, 'AR', 'approved')$$,
  '42501',
  null,
  'pero no puede aprobársela solo'
);

select throws_ok(
  $$insert into public.order_cancellation_requests
      (company_id, order_id, installer_id, reason_code, within_notice,
       calendar_country)
    values ('d1000000-0000-0000-0000-000000000001',
            'd1000000-0000-0000-0000-000000000041',
            'd1000000-0000-0000-0000-000000000013',
            'other', false, 'AR')$$,
  '42501',
  null,
  'ni pedir la baja en nombre de otro instalador'
);

set local request.jwt.claims to
  '{"sub":"d1000000-0000-0000-0000-000000000013","role":"authenticated"}';

select throws_ok(
  $$insert into public.order_cancellation_requests
      (company_id, order_id, installer_id, reason_code, within_notice,
       calendar_country)
    values ('d1000000-0000-0000-0000-000000000001',
            'd1000000-0000-0000-0000-000000000041',
            'd1000000-0000-0000-0000-000000000013',
            'other', false, 'AR')$$,
  '42501',
  null,
  'y quien no está asignado a la orden no puede pedir su baja'
);

-- ---------------------------------------------------------------------------
-- El gerente resuelve
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"d1000000-0000-0000-0000-000000000011","role":"authenticated"}';

select is(
  (select count(*)::integer from public.order_cancellation_requests),
  1,
  'el gerente ve el pedido de baja de su empresa'
);

select lives_ok(
  $$update public.order_cancellation_requests
    set status = 'approved', justified = true, reviewed_at = now(),
        reviewed_by = 'd1000000-0000-0000-0000-000000000011',
        review_note = 'Presentó certificado'
    where id = 'd1000000-0000-0000-0000-000000000061'$$,
  'y lo resuelve dejando constancia de quién y cuándo'
);

reset role;

select throws_ok(
  $$update public.order_cancellation_requests
    set status = 'rejected', reviewed_at = null
    where id = 'd1000000-0000-0000-0000-000000000061'$$,
  '23514',
  null,
  'no se puede resolver un pedido sin registrar cuándo se revisó'
);

-- ---------------------------------------------------------------------------
-- Calendario
-- ---------------------------------------------------------------------------

select is(
  (
    select count(*)::integer from public.non_working_days
    where company_id is null and country = 'AR' and day = '2026-11-23'
  ),
  1,
  'el feriado trasladable del 20/11/2026 quedó movido al lunes 23, como manda la ley'
);

select is(
  (
    select count(*)::integer from public.non_working_days
    where company_id is null and country = 'AR' and day = '2026-11-20'
  ),
  0,
  'y no quedó también en su fecha nominal, que ese año no fue feriado'
);

select is(
  (
    select count(*)::integer from public.non_working_days
    where company_id is null and country = 'BR' and day = '2026-06-04'
  ),
  1,
  'Corpus Christi 2026 en Brasil se calculó desde la Pascua'
);

select throws_ok(
  $$insert into public.non_working_days (company_id, country, day)
    values (null, 'AR', '2026-01-01')$$,
  '23505',
  null,
  'un feriado nacional no se puede duplicar'
);

-- Días propios de dos empresas distintas no se mezclan.
insert into public.companies (id, name, country, order_prefix)
values ('d1000000-0000-0000-0000-000000000002', 'Empresa Vecina', 'AR', 'EVE');

insert into public.non_working_days (company_id, country, day, name) values
  ('d1000000-0000-0000-0000-000000000001', 'AR', '2026-09-15', 'Puente propio'),
  ('d1000000-0000-0000-0000-000000000002', 'AR', '2026-09-16', 'Puente ajeno');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"d1000000-0000-0000-0000-000000000012","role":"authenticated"}';

select is(
  (
    select count(*)::integer from public.non_working_days
    where company_id = 'd1000000-0000-0000-0000-000000000002'
  ),
  0,
  'el calendario propio de otra empresa no se ve'
);

select ok(
  (
    select count(*) from public.non_working_days
    where company_id is null and country = 'AR'
  ) > 10,
  'los feriados nacionales sí: son lo que explica por qué vence cuando vence'
);

select throws_ok(
  $$insert into public.non_working_days (company_id, country, day)
    values (null, 'AR', '2026-07-04')$$,
  '42501',
  null,
  'y un instalador no puede inventarse un feriado nacional'
);

reset role;

select * from finish();

rollback;

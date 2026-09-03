-- Fase 1 de reputación: el libro de eventos.
--
-- El caso que justifica el archivo entero es `AC-20-I`: **editar las
-- condiciones de una orden después no cambia el evento ya emitido.** Es la
-- razón de ser del libro. Si la reputación se recalculara leyendo las
-- condiciones actuales, marcar una orden como "trabajo en altura" un mes
-- después le subiría la reputación a alguien por un trabajo que ya hizo — y al
-- revés, desmarcarla se la bajaría sin que hubiera pasado nada.
--
-- Los demás cubren que nadie escriba a mano (todo entra por las funciones), que
-- reintentar no duplique, y que la reversa deje el motivo en vez de borrar.

begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

insert into public.companies (id, name, country, order_prefix) values
  ('f2000000-0000-0000-0000-000000000001', 'Empresa Reputación', 'AR', 'ERP'),
  ('f2000000-0000-0000-0000-000000000002', 'Empresa Ajena Rep', 'AR', 'EAR');

insert into auth.users (id, email, raw_user_meta_data) values
  ('f2000000-0000-0000-0000-000000000011', 'gerente.rep@test.dev',
   '{"role":"company_manager","company_id":"f2000000-0000-0000-0000-000000000001"}'::jsonb),
  ('f2000000-0000-0000-0000-000000000012', 'instalador.rep@test.dev',
   '{"role":"installer"}'::jsonb),
  ('f2000000-0000-0000-0000-000000000013', 'otro.rep@test.dev',
   '{"role":"installer"}'::jsonb),
  ('f2000000-0000-0000-0000-000000000015', 'gerente.ajeno.rep@test.dev',
   '{"role":"company_manager","company_id":"f2000000-0000-0000-0000-000000000002"}'::jsonb);

insert into public.installers (id, zones) values
  ('f2000000-0000-0000-0000-000000000012', array['AR-BA-AMBA']),
  ('f2000000-0000-0000-0000-000000000013', array['AR-BA-AMBA'])
on conflict (id) do nothing;

insert into public.company_installers (company_id, installer_id, role, status, joined_at) values
  ('f2000000-0000-0000-0000-000000000001',
   'f2000000-0000-0000-0000-000000000012', 'installer', 'active', now()),
  ('f2000000-0000-0000-0000-000000000001',
   'f2000000-0000-0000-0000-000000000013', 'installer', 'active', now());

insert into public.company_membership_roles (company_id, user_id, role) values
  ('f2000000-0000-0000-0000-000000000001',
   'f2000000-0000-0000-0000-000000000012', 'installer'),
  ('f2000000-0000-0000-0000-000000000001',
   'f2000000-0000-0000-0000-000000000013', 'installer')
on conflict do nothing;

insert into public.projects (id, company_id, name) values
  ('f2000000-0000-0000-0000-000000000021',
   'f2000000-0000-0000-0000-000000000001', 'Proyecto Reputación');

insert into public.sites (id, project_id, company_id, name) values
  ('f2000000-0000-0000-0000-000000000031',
   'f2000000-0000-0000-0000-000000000021',
   'f2000000-0000-0000-0000-000000000001', 'Punto Reputación');

-- Orden A: a la intemperie, con flete y una condición declarada. La fecha se
-- fija a 10 días corridos: lo que se guarda son los HÁBILES que haya en medio,
-- así que el número no depende del día de la semana en que corra el test.
insert into public.work_orders (
  id, company_id, project_id, site_id, order_number, title,
  assigned_installer_id, scheduled_date, status, indoor, requires_freight
) values (
  'f2000000-0000-0000-0000-0000000000aa', 'f2000000-0000-0000-0000-000000000001',
  'f2000000-0000-0000-0000-000000000021', 'f2000000-0000-0000-0000-000000000031',
  'ERP-0001', 'Cartel en altura', 'f2000000-0000-0000-0000-000000000012',
  ((now() at time zone 'America/Argentina/Buenos_Aires')::date + 10),
  'pendiente', false, true
);

-- Orden B: sin fecha comprometida.
insert into public.work_orders (
  id, company_id, project_id, site_id, order_number, title,
  assigned_installer_id, status, indoor, requires_freight
) values (
  'f2000000-0000-0000-0000-0000000000bb', 'f2000000-0000-0000-0000-000000000001',
  'f2000000-0000-0000-0000-000000000021', 'f2000000-0000-0000-0000-000000000031',
  'ERP-0002', 'Sin fecha', 'f2000000-0000-0000-0000-000000000012',
  'pendiente', true, false
);

insert into public.work_order_conditions (order_id, company_id, condition) values
  ('f2000000-0000-0000-0000-0000000000aa',
   'f2000000-0000-0000-0000-000000000001', 'altura');

-- ---------------------------------------------------------------------------
-- Aceptar: la foto y la anticipación
-- ---------------------------------------------------------------------------

update public.work_orders set installer_accepted_at = now()
 where id in ('f2000000-0000-0000-0000-0000000000aa',
              'f2000000-0000-0000-0000-0000000000bb');

select is(
  (select context -> 'conditions' from public.installer_performance_events
    where order_id = 'f2000000-0000-0000-0000-0000000000aa' and kind = 'job_accepted'),
  '["altura", "exterior", "flete"]'::jsonb,
  'la foto junta lo declarado con lo que la orden ya decía (intemperie y flete)'
);

select is(
  (select (context ->> 'lead_time_business_days')::integer
     from public.installer_performance_events
    where order_id = 'f2000000-0000-0000-0000-0000000000aa' and kind = 'job_accepted'),
  public.business_days_between(
    (now() at time zone 'America/Argentina/Buenos_Aires')::date,
    ((now() at time zone 'America/Argentina/Buenos_Aires')::date + 10),
    'AR', 'f2000000-0000-0000-0000-000000000001'),
  'la anticipación queda en días hábiles, con el calendario de la empresa'
);

select is(
  (select context ->> 'lead_time_business_days'
     from public.installer_performance_events
    where order_id = 'f2000000-0000-0000-0000-0000000000bb' and kind = 'job_accepted'),
  null,
  'sin fecha comprometida no hay anticipación: null, que no es lo mismo que cero'
);

-- ---------------------------------------------------------------------------
-- AC-20-I: la foto no se retoca
-- ---------------------------------------------------------------------------

delete from public.work_order_conditions
 where order_id = 'f2000000-0000-0000-0000-0000000000aa';
update public.work_orders set indoor = true, requires_freight = false
 where id = 'f2000000-0000-0000-0000-0000000000aa';

select is(
  (select context -> 'conditions' from public.installer_performance_events
    where order_id = 'f2000000-0000-0000-0000-0000000000aa' and kind = 'job_accepted'),
  '["altura", "exterior", "flete"]'::jsonb,
  'AC-20-I: cambiar la orden después no reescribe lo que la persona aceptó'
);

-- ---------------------------------------------------------------------------
-- Idempotencia y finalización
-- ---------------------------------------------------------------------------

update public.work_orders set installer_accepted_at = now()
 where id = 'f2000000-0000-0000-0000-0000000000aa';

select is(
  (select count(*)::integer from public.installer_performance_events
    where order_id = 'f2000000-0000-0000-0000-0000000000aa' and kind = 'job_accepted'),
  1,
  'volver a disparar el trigger no duplica el hecho'
);

-- La compuerta que ya existe para las transiciones programáticas (Fase 1 del
-- punto 17): acá se usa para llevar la orden a finalizada sin pelear con la
-- máquina de estados, que no es lo que este archivo prueba.
select set_config('app.activity_sync', 'on', true);
update public.work_orders set status = 'finalizada'
 where id = 'f2000000-0000-0000-0000-0000000000aa';
select set_config('app.activity_sync', 'off', true);

select is(
  (select count(*)::integer from public.installer_performance_events
    where order_id = 'f2000000-0000-0000-0000-0000000000aa' and kind = 'job_completed'),
  1,
  'completar emite su propio evento'
);

-- ---------------------------------------------------------------------------
-- Incidencias
-- ---------------------------------------------------------------------------

insert into public.order_incidents (
  id, company_id, order_id, category, severity, description, status
) values (
  'f2000000-0000-0000-0000-0000000000c1', 'f2000000-0000-0000-0000-000000000001',
  'f2000000-0000-0000-0000-0000000000aa', 'technical_issue', 'high',
  'El tablero no tenía disyuntor', 'open'
);

select is(
  (select count(*)::integer from public.installer_performance_events
    where kind = 'incident_resolved'),
  0,
  'una incidencia abierta todavía no es nada que reconocer'
);

update public.order_incidents set status = 'resolved', resolved_at = now()
 where id = 'f2000000-0000-0000-0000-0000000000c1';

select is(
  (select context ->> 'severity' from public.installer_performance_events
    where kind = 'incident_resolved'),
  'high',
  'al resolverse queda el hecho, con su severidad, para que la fórmula decida qué vale'
);

-- ---------------------------------------------------------------------------
-- Nadie escribe a mano
-- ---------------------------------------------------------------------------

-- El id se guarda ACÁ, todavía sin RLS. Si se buscara desde la sesión de la
-- empresa ajena, la policy le devolvería cero filas y el `revert` de más abajo
-- fallaría por "evento no encontrado" — pasando el test por el motivo
-- equivocado y sin haber probado nunca la regla de autoridad.
create temporary table t_evento as
  select id from public.installer_performance_events where kind = 'job_completed';

-- La tabla temporal nace del rol de la sesión de test; sin este grant, las
-- consultas de más abajo —que corren ya como `authenticated`— fallan con
-- «permission denied» y los `throws_ok` pasarían por el error equivocado.
grant select on t_evento to authenticated;

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"f2000000-0000-0000-0000-000000000012","role":"authenticated"}';

select is(
  (select count(*)::integer from public.installer_performance_events),
  4,
  'el instalador ve sus propios eventos: el requisito pide que pueda entenderlos'
);

select throws_ok(
  $q$insert into public.installer_performance_events
       (installer_id, company_id, kind)
     values ('f2000000-0000-0000-0000-000000000012',
             'f2000000-0000-0000-0000-000000000001', 'job_completed')$q$,
  '42501',
  null,
  'y no se fabrica un logro a mano: sin política de insert, la RLS lo deniega'
);

set local request.jwt.claims to
  '{"sub":"f2000000-0000-0000-0000-000000000013","role":"authenticated"}';

select is(
  (select count(*)::integer from public.installer_performance_events),
  0,
  'otro instalador no ve el historial ajeno'
);

set local request.jwt.claims to
  '{"sub":"f2000000-0000-0000-0000-000000000015","role":"authenticated"}';

select is(
  (select count(*)::integer from public.installer_performance_events),
  0,
  'una empresa ajena tampoco: el agregado que cruza empresas llega por función, no por policy'
);

-- ---------------------------------------------------------------------------
-- Reversa
-- ---------------------------------------------------------------------------

select throws_ok(
  $q$select public.revert_performance_event(
      (select id from t_evento), 'no me gusta')$q$,
  'P0001',
  null,
  'una empresa ajena no revierte un evento que no ocurrió en su operación'
);

set local request.jwt.claims to
  '{"sub":"f2000000-0000-0000-0000-000000000011","role":"authenticated"}';

select throws_ok(
  $q$select public.revert_performance_event((select id from t_evento), '   ')$q$,
  'P0001',
  null,
  'y revertir sin motivo se rechaza: el motivo es el punto de no borrar el evento'
);

select public.revert_performance_event(
  (select id from t_evento), 'La orden se cerró por error administrativo');

reset role;

select is(
  (select revert_reason from public.installer_performance_events
    where id = (select id from t_evento)),
  'La orden se cerró por error administrativo',
  'revertido: el evento sigue estando y el motivo queda escrito, no se borra nada'
);

select * from finish();

rollback;

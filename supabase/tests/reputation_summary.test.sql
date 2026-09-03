-- Fase 2 de reputación: el cálculo.
--
-- Los dos casos que justifican el archivo:
--
-- 1. **`AC-20-B`, la racha.** Una baja EN PLAZO o JUSTIFICADA no puede cortarla.
--    Es la parte del pedido más fácil de romper sin darse cuenta, porque el
--    código que la corta y el que la respeta son la misma línea.
-- 2. **`AC-20-E`, la frontera.** El resumen cruza empresas —de eso se trata que
--    sirva para conseguir trabajo nuevo— así que lo único que impide filtrar
--    datos de terceros es la FORMA de lo que devuelve. Acá se fija esa forma:
--    si alguien le agrega una clave con el nombre de una empresa o de una
--    orden, este test falla.

begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

insert into public.companies (id, name, country, order_prefix) values
  ('f3000000-0000-0000-0000-000000000001', 'Empresa Calculo', 'AR', 'ECA'),
  ('f3000000-0000-0000-0000-000000000002', 'Empresa Que Evalua', 'AR', 'EQE');

insert into auth.users (id, email, raw_user_meta_data) values
  ('f3000000-0000-0000-0000-000000000011', 'gerente.calc@test.dev',
   '{"role":"company_manager","company_id":"f3000000-0000-0000-0000-000000000001"}'::jsonb),
  ('f3000000-0000-0000-0000-000000000012', 'instalador.calc@test.dev',
   '{"role":"installer"}'::jsonb),
  ('f3000000-0000-0000-0000-000000000013', 'curioso.calc@test.dev',
   '{"role":"installer"}'::jsonb),
  ('f3000000-0000-0000-0000-000000000015', 'gerente.evalua@test.dev',
   '{"role":"company_manager","company_id":"f3000000-0000-0000-0000-000000000002"}'::jsonb);

insert into public.installers (id, zones) values
  ('f3000000-0000-0000-0000-000000000012', array['AR-BA-AMBA']),
  ('f3000000-0000-0000-0000-000000000013', array['AR-BA-AMBA'])
on conflict (id) do nothing;

-- Confiabilidad: dos completados, una falta, y después tres más. En el medio,
-- una baja en plazo y una justificada, que NO tienen que cortar nada.
insert into public.installer_reliability_events
  (installer_id, company_id, kind, occurred_at) values
  ('f3000000-0000-0000-0000-000000000012','f3000000-0000-0000-0000-000000000001','order_completed', now() - interval '100 days'),
  ('f3000000-0000-0000-0000-000000000012','f3000000-0000-0000-0000-000000000001','order_completed', now() - interval '90 days'),
  ('f3000000-0000-0000-0000-000000000012','f3000000-0000-0000-0000-000000000001','cancel_late',      now() - interval '80 days'),
  ('f3000000-0000-0000-0000-000000000012','f3000000-0000-0000-0000-000000000001','order_completed', now() - interval '70 days'),
  ('f3000000-0000-0000-0000-000000000012','f3000000-0000-0000-0000-000000000001','cancel_in_notice', now() - interval '60 days'),
  ('f3000000-0000-0000-0000-000000000012','f3000000-0000-0000-0000-000000000001','order_completed', now() - interval '50 days'),
  ('f3000000-0000-0000-0000-000000000012','f3000000-0000-0000-0000-000000000001','cancel_justified', now() - interval '40 days'),
  ('f3000000-0000-0000-0000-000000000012','f3000000-0000-0000-0000-000000000001','order_completed', now() - interval '30 days');

select is(
  public.installer_streak('f3000000-0000-0000-0000-000000000012'),
  3,
  'AC-20-B: la racha son los completados después de la última falta'
);

select is(
  (select count(*)::integer from public.installer_reliability_events
    where installer_id = 'f3000000-0000-0000-0000-000000000012'
      and kind in ('cancel_in_notice','cancel_justified')),
  2,
  'y en el medio hubo dos bajas que no la cortaron: en plazo y justificada'
);

-- Una falta revertida deja de contar, y con eso la racha se recupera hacia
-- atrás: es lo que hace que la reversa sirva de algo.
update public.installer_reliability_events
   set reverted_at = now(), reverted_by = 'f3000000-0000-0000-0000-000000000011',
       revert_reason = 'La empresa reconoció que avisó a tiempo'
 where installer_id = 'f3000000-0000-0000-0000-000000000012'
   and kind = 'cancel_late';

select is(
  public.installer_streak('f3000000-0000-0000-0000-000000000012'),
  5,
  'revertida la falta, los completados anteriores vuelven a contar'
);

-- ---------------------------------------------------------------------------
-- El resumen
-- ---------------------------------------------------------------------------

-- Seis trabajos completados: dos con condiciones que suman por encima del
-- umbral (altura 2 + nocturno 2 = 4) y cuatro sin.
insert into public.installer_performance_events
  (installer_id, company_id, kind, context, occurred_at)
select
  'f3000000-0000-0000-0000-000000000012',
  'f3000000-0000-0000-0000-000000000001',
  'job_completed',
  case when n <= 2 then '{"conditions":["altura","nocturno"]}'::jsonb
       else '{"conditions":["exterior"]}'::jsonb end,
  now() - ((100 - n * 10) || ' days')::interval
from generate_series(1, 6) as n;

-- Tres aceptaciones: una sobre la hora, una con margen, una sin fecha.
insert into public.installer_performance_events
  (installer_id, company_id, kind, context, occurred_at) values
  ('f3000000-0000-0000-0000-000000000012','f3000000-0000-0000-0000-000000000001','job_accepted',
   '{"conditions":[],"lead_time_business_days":1}'::jsonb, now() - interval '25 days'),
  ('f3000000-0000-0000-0000-000000000012','f3000000-0000-0000-0000-000000000001','job_accepted',
   '{"conditions":[],"lead_time_business_days":9}'::jsonb, now() - interval '24 days'),
  ('f3000000-0000-0000-0000-000000000012','f3000000-0000-0000-0000-000000000001','job_accepted',
   '{"conditions":[],"lead_time_business_days":null}'::jsonb, now() - interval '23 days');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"f3000000-0000-0000-0000-000000000011","role":"authenticated"}';

select is(
  (public.reputation_summary(
     'f3000000-0000-0000-0000-000000000012', now()) ->> 'completed')::integer,
  6,
  'cuenta los trabajos completados'
);

select is(
  (public.reputation_summary(
     'f3000000-0000-0000-0000-000000000012', now()) ->> 'complex_completed')::integer,
  2,
  'y cuáles de ellos eran complejos, según la foto congelada al completarlos'
);

select is(
  (public.reputation_summary(
     'f3000000-0000-0000-0000-000000000012', now()) ->> 'short_notice_accepted')::integer,
  1,
  'sólo uno fue sobre la hora: nueve días hábiles no lo son, y sin fecha tampoco'
);

select is(
  (public.reputation_summary(
     'f3000000-0000-0000-0000-000000000012', now()) ->> 'has_enough_history')::boolean,
  true,
  'con seis completados hay historia suficiente para afirmar un número'
);

-- AC-20-A: el mismo historial y la misma versión de reglas dan exactamente lo
-- mismo. Por eso `p_as_of` es un parámetro y no `now()` adentro.
select is(
  public.reputation_summary('f3000000-0000-0000-0000-000000000012', '2026-09-01T12:00:00Z'),
  public.reputation_summary('f3000000-0000-0000-0000-000000000012', '2026-09-01T12:00:00Z'),
  'AC-20-A: recalcular con los mismos eventos da el mismo resultado'
);

select ok(
  public.reputation_summary(
    'f3000000-0000-0000-0000-000000000012', now()) -> 'badges'
    @> '["alta_dificultad"]'::jsonb,
  'el reconocimiento por trabajos complejos se deriva del propio resumen'
);

-- ---------------------------------------------------------------------------
-- AC-20-E: la forma del retorno ES la frontera de privacidad
-- ---------------------------------------------------------------------------

select is(
  (select array_agg(k order by k)
     from jsonb_object_keys(
       public.reputation_summary('f3000000-0000-0000-0000-000000000012', now())
     ) as k),
  array[
    'as_of','badges','complex_completed','completed','faults',
    'has_enough_history','incidents_resolved','rule_version','sample_size',
    'score','short_notice_accepted','streak'
  ],
  'AC-20-E: el resumen son totales. Ni empresa, ni orden, ni cliente, ni motivos'
);

-- ---------------------------------------------------------------------------
-- Quién puede preguntar
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"f3000000-0000-0000-0000-000000000015","role":"authenticated"}';

select is(
  (public.reputation_summary(
     'f3000000-0000-0000-0000-000000000012', now()) ->> 'completed')::integer,
  6,
  'una empresa que NO dio esos trabajos igual ve el agregado: para eso existe'
);

set local request.jwt.claims to
  '{"sub":"f3000000-0000-0000-0000-000000000012","role":"authenticated"}';

select is(
  (public.reputation_summary(
     'f3000000-0000-0000-0000-000000000012', now()) ->> 'streak')::integer,
  5,
  'y la persona ve la suya'
);

set local request.jwt.claims to
  '{"sub":"f3000000-0000-0000-0000-000000000013","role":"authenticated"}';

select throws_ok(
  $q$select public.reputation_summary(
      'f3000000-0000-0000-0000-000000000012', now())$q$,
  'P0001',
  null,
  'un instalador cualquiera no anda mirando la reputación de otro'
);

reset role;

select * from finish();

rollback;

-- Auditoría del 11-09-2026 — T1: el estado y su rastro se mueven juntos o nada.
--
-- `transitionOrder` y `reviewOrderDelivery` hacían dos escrituras sueltas y
-- descartaban el error de la segunda. De ese insert cuelga
-- `notify_review_decision`: sin él, el instalador nunca se enteraba de que la
-- empresa movió su orden. Estos asserts fijan lo que reemplaza a eso.

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

insert into public.companies (id, name, country, order_prefix)
values ('e1000000-0000-0000-0000-000000000001', 'Empresa Atómica', 'AR', 'EAT');

insert into auth.users (id, email, raw_app_meta_data) values
  ('e1000000-0000-0000-0000-000000000011', 'at.inst@test.dev',
   '{"role":"installer"}'::jsonb),
  ('e1000000-0000-0000-0000-000000000012', 'at.ger@test.dev',
   '{"role":"company_manager","company_id":"e1000000-0000-0000-0000-000000000001"}'::jsonb);

set local request.jwt.claim.role to 'service_role';
update public.profiles set company_id = 'e1000000-0000-0000-0000-000000000001'
 where id = 'e1000000-0000-0000-0000-000000000011';
reset request.jwt.claim.role;

insert into public.installers (id, zones)
values ('e1000000-0000-0000-0000-000000000011', '{Córdoba}')
on conflict (id) do nothing;

insert into public.projects (id, company_id, name, country, status)
values ('e1000000-0000-0000-0000-000000000021', 'e1000000-0000-0000-0000-000000000001',
        'Proyecto Atómico', 'AR', 'active');

insert into public.sites (id, company_id, project_id, name, address, city, state, zone)
values ('e1000000-0000-0000-0000-000000000031', 'e1000000-0000-0000-0000-000000000001',
        'e1000000-0000-0000-0000-000000000021', 'Sitio AT', 'Calle 1', 'Córdoba',
        'Córdoba', 'Córdoba');

select set_config('app.assignment_gate', 'on', true);
insert into public.work_orders (
  id, company_id, project_id, site_id, order_number, title, status,
  assigned_installer_id, installer_accepted_at, scheduled_date
) values (
  'e1000000-0000-0000-0000-000000000041', 'e1000000-0000-0000-0000-000000000001',
  'e1000000-0000-0000-0000-000000000021', 'e1000000-0000-0000-0000-000000000031',
  'EAT-0001', 'Orden atómica', 'en_revision',
  'e1000000-0000-0000-0000-000000000011', now(), current_date
);
select set_config('app.assignment_gate', 'off', true);

-- ---------------------------------------------------------------------------
-- El caso limpio: una llamada mueve las dos cosas
-- ---------------------------------------------------------------------------

-- El gerente de la empresa es quien decide. `set role authenticated` es lo que
-- pone la RLS en juego: sin esto la función correría como superusuario y el
-- test no probaría que un gerente común puede hacerlo.
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"e1000000-0000-0000-0000-000000000012","role":"authenticated"}';

select lives_ok(
  $q$select public.apply_order_status_change(
       'e1000000-0000-0000-0000-000000000041', 'finalizada',
       'Trabajo aprobado', 'en_revision', true)$q$,
  'aprobar una entrega no lanza'
);

select is(
  (select status from public.work_orders
    where id = 'e1000000-0000-0000-0000-000000000041'),
  'finalizada',
  'el estado se movió'
);

select is(
  (select count(*)::int from public.order_updates
    where order_id = 'e1000000-0000-0000-0000-000000000041'
      and type = 'system' and from_status = 'en_revision'
      and to_status = 'finalizada'),
  1,
  'y el rastro quedó, en la MISMA operación'
);

select is(
  (select created_by from public.order_updates
    where order_id = 'e1000000-0000-0000-0000-000000000041'
      and to_status = 'finalizada'),
  'e1000000-0000-0000-0000-000000000012'::uuid,
  'p_attribute_caller firma el rastro con quien decidió'
);

-- ---------------------------------------------------------------------------
-- Compare-and-set
-- ---------------------------------------------------------------------------

select throws_ok(
  $q$select public.apply_order_status_change(
       'e1000000-0000-0000-0000-000000000041', 'en_proceso',
       'Reapertura tardía', 'en_revision', true)$q$,
  '55000',
  null,
  'con el estado esperado ya vencido, la decisión no pisa la de otro'
);

select is(
  (select status from public.work_orders
    where id = 'e1000000-0000-0000-0000-000000000041'),
  'finalizada',
  'y no dejó nada a medias: sigue como lo dejó quien llegó primero'
);

-- ---------------------------------------------------------------------------
-- Idempotencia y orden fuera de alcance
-- ---------------------------------------------------------------------------

-- Repetir el estado que ya tiene: no es un error, pero tampoco escribe un
-- rastro nuevo. Mismo criterio que `set_order_payment_status`.
select lives_ok(
  $q$select public.apply_order_status_change(
       'e1000000-0000-0000-0000-000000000041', 'finalizada',
       'Aprobado otra vez', null, true)$q$,
  'repetir el mismo estado no lanza'
);

select is(
  (select count(*)::int from public.order_updates
    where order_id = 'e1000000-0000-0000-0000-000000000041'
      and to_status = 'finalizada'),
  1,
  'y no ensucia el historial con ruido'
);

select throws_ok(
  $q$select public.apply_order_status_change(
       'e1000000-0000-0000-0000-0000000000ff', 'finalizada', 'x', null, false)$q$,
  'P0002',
  null,
  'una orden que la RLS no deja ver no existe para esta función'
);

-- El aviso al instalador cuelga del insert del rastro: si el rastro entra, el
-- aviso existe. Es la cadena que estaba rota cuando eran dos escrituras
-- sueltas y la segunda podía fallar en silencio.
--
-- Se sale del rol `authenticated` para leerlo: la RLS de `notifications` es
-- `user_id = auth.uid()`, así que el gerente no ve la bandeja del instalador
-- —y está bien que no la vea—.
reset role;
reset request.jwt.claims;

select is(
  (select count(*)::int from public.notifications
    where user_id = 'e1000000-0000-0000-0000-000000000011'
      and type = 'delivery_approved'),
  1,
  'el instalador se entera, que es lo que se perdía al fallar el rastro'
);

select * from finish();
rollback;

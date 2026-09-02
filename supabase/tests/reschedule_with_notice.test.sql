-- Fase 1: reprogramar avisa, y el aviso queda sellado en la misma transacción.
--
-- La regla que este archivo protege es la del requisito: el plazo de dos días
-- hábiles arranca desde la notificación persistida, nunca desde el cambio de
-- fecha. De ahí salen las dos afirmaciones centrales:
--
--   * Con instalador asignado, después de reprogramar SIEMPRE existe la
--     notificación y `notified_at` quedó sellado. No puede haber uno sin el
--     otro porque los escribe la misma transacción.
--   * Sin instalador asignado no hay a quién preguntarle: la reprogramación se
--     registra para el historial pero nace sin notificar y sin plazo.

begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

insert into public.companies (id, name, country, order_prefix)
values ('e1000000-0000-0000-0000-000000000001', 'Empresa Fase1', 'AR', 'EF1');

insert into auth.users (id, email, raw_user_meta_data) values
  ('e1000000-0000-0000-0000-000000000011', 'gerente.f1@test.dev',
   '{"role":"company_manager","company_id":"e1000000-0000-0000-0000-000000000001"}'::jsonb),
  ('e1000000-0000-0000-0000-000000000012', 'instalador.f1@test.dev',
   '{"role":"installer"}'::jsonb);

insert into public.installers (id, zones)
values ('e1000000-0000-0000-0000-000000000012', array['AR-BA-AMBA'])
on conflict (id) do nothing;

insert into public.company_installers (company_id, installer_id, role, status, joined_at)
values ('e1000000-0000-0000-0000-000000000001',
        'e1000000-0000-0000-0000-000000000012', 'installer', 'active', now());

insert into public.projects (id, company_id, name)
values ('e1000000-0000-0000-0000-000000000021',
        'e1000000-0000-0000-0000-000000000001', 'Proyecto Fase1');

insert into public.sites (id, project_id, company_id, name)
values ('e1000000-0000-0000-0000-000000000031',
        'e1000000-0000-0000-0000-000000000021',
        'e1000000-0000-0000-0000-000000000001', 'Punto Fase1');

-- Una asignada y una sin asignar: la diferencia entre ellas es todo el punto.
insert into public.work_orders (
  id, company_id, project_id, site_id, order_number, title,
  assigned_installer_id, scheduled_date, status
) values
  ('e1000000-0000-0000-0000-000000000041', 'e1000000-0000-0000-0000-000000000001',
   'e1000000-0000-0000-0000-000000000021', 'e1000000-0000-0000-0000-000000000031',
   'EF1-0001', 'Con instalador',
   'e1000000-0000-0000-0000-000000000012', '2026-08-25', 'planificada'),
  ('e1000000-0000-0000-0000-000000000042', 'e1000000-0000-0000-0000-000000000001',
   'e1000000-0000-0000-0000-000000000021', 'e1000000-0000-0000-0000-000000000031',
   'EF1-0002', 'Sin instalador',
   null, '2026-08-25', 'pendiente');

-- ---------------------------------------------------------------------------
-- Quién puede reprogramar
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"e1000000-0000-0000-0000-000000000012","role":"authenticated"}';

select throws_ok(
  $q$select public.reschedule_order_with_notice(
      'e1000000-0000-0000-0000-000000000041', '2026-09-01')$q$,
  'P0001',
  null,
  'el instalador no reprograma su propio trabajo: para eso pide la baja'
);

set local request.jwt.claims to
  '{"sub":"e1000000-0000-0000-0000-000000000011","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- Validaciones antes de tocar nada
-- ---------------------------------------------------------------------------

select throws_ok(
  $q$select public.reschedule_order_with_notice(
      'e1000000-0000-0000-0000-000000000041', '2026-08-25')$q$,
  'P0001',
  null,
  'reprogramar a la misma fecha se rechaza: gastaría el plazo sin motivo'
);

select throws_ok(
  $q$select public.reschedule_order_with_notice(
      'e1000000-0000-0000-0000-000000000041', '2026-09-10', '2026-09-01')$q$,
  'P0001',
  null,
  'la fecha final no puede ser anterior al inicio'
);

-- ---------------------------------------------------------------------------
-- El caso central: mover la fecha avisa y sella
-- ---------------------------------------------------------------------------

select lives_ok(
  $q$select public.reschedule_order_with_notice(
      'e1000000-0000-0000-0000-000000000041', '2026-09-08', '2026-09-09',
      'El cliente pidió correrlo')$q$,
  'la empresa reprograma'
);

reset role;

select is(
  (
    select scheduled_date::text from public.work_orders
    where id = 'e1000000-0000-0000-0000-000000000041'
  ),
  '2026-09-08',
  'la orden quedó con la fecha nueva'
);

select is(
  (
    select previous_date::text from public.order_reschedules
    where order_id = 'e1000000-0000-0000-0000-000000000041'
  ),
  '2026-08-25',
  'y la fila guarda de qué fecha venía'
);

select isnt(
  (
    select notified_at from public.order_reschedules
    where order_id = 'e1000000-0000-0000-0000-000000000041'
  ),
  null,
  'el aviso quedó sellado: desde acá corre el plazo'
);

select is(
  (
    select count(*)::integer from public.notifications
    where type = 'order_rescheduled'
      and user_id = 'e1000000-0000-0000-0000-000000000012'
  ),
  1,
  'y existe la notificación in-app que lo justifica'
);

-- Que el sello y la notificación se refieran a lo mismo es la garantía de que
-- no puede haber plazo sin aviso.
select ok(
  exists (
    select 1
    from public.order_reschedules r
    join public.notifications n
      on (n.data->>'reschedule_id')::uuid = r.id
    where r.order_id = 'e1000000-0000-0000-0000-000000000041'
      and r.notified_at is not null
  ),
  'el sello y el aviso apuntan a la misma reprogramación'
);

select is(
  (
    select calendar_timezone from public.order_reschedules
    where order_id = 'e1000000-0000-0000-0000-000000000041'
  ),
  'America/Argentina/Buenos_Aires',
  'el calendario queda congelado en la fila, no se recalcula después'
);

select is(
  (
    select reschedule_count from public.work_orders
    where id = 'e1000000-0000-0000-0000-000000000041'
  ),
  1,
  'el contador que ya existía sigue funcionando'
);

-- ---------------------------------------------------------------------------
-- Reprogramar de nuevo supersede la pregunta anterior
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"e1000000-0000-0000-0000-000000000011","role":"authenticated"}';

select lives_ok(
  $q$select public.reschedule_order_with_notice(
      'e1000000-0000-0000-0000-000000000041', '2026-09-15')$q$,
  'la empresa vuelve a moverla antes de que conteste'
);

reset role;

select is(
  (
    select count(*)::integer from public.order_reschedules
    where order_id = 'e1000000-0000-0000-0000-000000000041'
      and response is null and superseded_at is null
  ),
  1,
  'queda una sola pregunta abierta'
);

select is(
  (
    select count(*)::integer from public.order_reschedules
    where order_id = 'e1000000-0000-0000-0000-000000000041'
      and superseded_at is not null
  ),
  1,
  'y la anterior queda superada, no borrada: el historial muestra los dos movimientos'
);

-- ---------------------------------------------------------------------------
-- Sin instalador no hay a quién preguntarle
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"e1000000-0000-0000-0000-000000000011","role":"authenticated"}';

select lives_ok(
  $q$select public.reschedule_order_with_notice(
      'e1000000-0000-0000-0000-000000000042', '2026-09-20')$q$,
  'una orden sin asignar también se puede reprogramar'
);

reset role;

select is(
  (
    select notified_at from public.order_reschedules
    where order_id = 'e1000000-0000-0000-0000-000000000042'
  ),
  null,
  'pero nace sin notificar y sin plazo: no hay a quién avisarle todavía'
);

select * from finish();

rollback;

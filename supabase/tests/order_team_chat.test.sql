-- Bloque 5 (docs/specs/2026-09-24-multi-instalador): chat grupal por orden.
--
-- La orden es el hilo y la membresía se deriva del plantel activo más quien
-- opera la orden. Estas pruebas cubren: quién lee y escribe, que un ajeno o
-- alguien quitado del equipo quede afuera, que el remitente no se pueda
-- falsificar, que el registro no se edite ni se borre, y a quién avisa.

begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------

insert into public.companies (id, name, country, order_prefix) values
  ('f2000000-0000-0000-0000-000000000001', 'Empresa A', 'AR', 'CHA'),
  ('f2000000-0000-0000-0000-000000000002', 'Empresa B', 'AR', 'CHB');

insert into auth.users (id, email, raw_app_meta_data) values
  ('f2000000-0000-0000-0000-000000000011', 'gerente.a@chat.test',
   '{"role":"company_manager","company_id":"f2000000-0000-0000-0000-000000000001","is_owner":true}'::jsonb),
  ('f2000000-0000-0000-0000-000000000012', 'gerente.b@chat.test',
   '{"role":"company_manager","company_id":"f2000000-0000-0000-0000-000000000002","is_owner":true}'::jsonb),
  ('f2000000-0000-0000-0000-000000000013', 'lead@chat.test', '{"role":"installer"}'::jsonb),
  ('f2000000-0000-0000-0000-000000000014', 'ayudante@chat.test', '{"role":"installer"}'::jsonb),
  ('f2000000-0000-0000-0000-000000000015', 'ajeno@chat.test', '{"role":"installer"}'::jsonb);

update public.profiles set full_name = 'Gerente A'
where id = 'f2000000-0000-0000-0000-000000000011';

insert into public.company_installers (company_id, installer_id, status, joined_at) values
  ('f2000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000013', 'active', now()),
  ('f2000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000014', 'active', now()),
  ('f2000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000015', 'active', now());

insert into public.clients (id, company_id, name) values
  ('f2000000-0000-0000-0000-000000000021', 'f2000000-0000-0000-0000-000000000001', 'Cliente A');

insert into public.projects (id, company_id, client_id, name, country, zones) values
  ('f2000000-0000-0000-0000-000000000031', 'f2000000-0000-0000-0000-000000000001',
   'f2000000-0000-0000-0000-000000000021', 'Proyecto A', 'AR', array['Buenos Aires']);

insert into public.sites (id, project_id, company_id, name) values
  ('f2000000-0000-0000-0000-000000000041', 'f2000000-0000-0000-0000-000000000031',
   'f2000000-0000-0000-0000-000000000001', 'Punto A');

insert into public.work_orders (
  id, site_id, project_id, company_id, title, assigned_installer_id, status,
  installer_accepted_at, required_installers
) values (
  'f2000000-0000-0000-0000-000000000051', 'f2000000-0000-0000-0000-000000000041',
  'f2000000-0000-0000-0000-000000000031', 'f2000000-0000-0000-0000-000000000001',
  'Trabajo en equipo', 'f2000000-0000-0000-0000-000000000013', 'planificada', now(), 2
);

-- 14 es ayudante activo. 15 nunca estuvo en la orden.
insert into public.work_order_team_members (company_id, order_id, installer_id, added_by) values
  ('f2000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000051',
   'f2000000-0000-0000-0000-000000000014', 'f2000000-0000-0000-0000-000000000011');

-- ---------------------------------------------------------------------------
-- Estructura
-- ---------------------------------------------------------------------------

select is(
  (select relrowsecurity from pg_class where relname = 'order_chat_messages'),
  true,
  'order_chat_messages tiene RLS activa'
);

-- ---------------------------------------------------------------------------
-- Quien opera y quienes están en el equipo escriben
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"f2000000-0000-0000-0000-000000000011","role":"authenticated"}';

select lives_ok(
  $$insert into public.order_chat_messages (id, order_id, company_id, sender_id, body)
    values ('f2000000-0000-0000-0000-0000000000a1', 'f2000000-0000-0000-0000-000000000051',
            'f2000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000011',
            '  Llegan mañana los materiales  ')$$,
  'el gerente que opera la orden escribe en el chat'
);

select is(
  (select sender_name || '|' || body from public.order_chat_messages
   where id = 'f2000000-0000-0000-0000-0000000000a1'),
  'Gerente A|Llegan mañana los materiales',
  'el nombre del remitente y el texto recortado los completa la base'
);

set local request.jwt.claims to
  '{"sub":"f2000000-0000-0000-0000-000000000013","role":"authenticated"}';

select lives_ok(
  $$insert into public.order_chat_messages (order_id, company_id, sender_id, body)
    values ('f2000000-0000-0000-0000-000000000051',
            'f2000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000013',
            'Recibido')$$,
  'el responsable escribe en el chat'
);

select is(
  public.order_team_size('f2000000-0000-0000-0000-000000000051'),
  1,
  'el responsable, que no ve las filas del plantel, sabe que hay un ayudante (y por lo tanto un chat)'
);

set local request.jwt.claims to
  '{"sub":"f2000000-0000-0000-0000-000000000014","role":"authenticated"}';

select lives_ok(
  $$insert into public.order_chat_messages (order_id, company_id, sender_id, body)
    values ('f2000000-0000-0000-0000-000000000051',
            'f2000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000014',
            'Yo llevo la escalera')$$,
  'un ayudante activo escribe en el chat'
);

select is(
  (select count(*)::integer from public.order_chat_messages),
  3,
  'el ayudante lee la conversación completa, incluidos los mensajes de los demás'
);

select throws_ok(
  $$insert into public.order_chat_messages (order_id, company_id, sender_id, body)
    values ('f2000000-0000-0000-0000-000000000051',
            'f2000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000013',
            'Me hago pasar por el responsable')$$,
  '42501',
  null,
  'no se puede escribir en nombre de otra persona'
);

-- ---------------------------------------------------------------------------
-- Quien no participa queda afuera
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"f2000000-0000-0000-0000-000000000015","role":"authenticated"}';

select is(
  (select count(*)::integer from public.order_chat_messages),
  0,
  'un instalador de la empresa que no está en esta orden no lee nada'
);

select throws_ok(
  $$insert into public.order_chat_messages (order_id, company_id, sender_id, body)
    values ('f2000000-0000-0000-0000-000000000051',
            'f2000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000015',
            'Me cuelo')$$,
  '42501',
  null,
  'ni escribe'
);

select is(
  public.order_team_size('f2000000-0000-0000-0000-000000000051'),
  0,
  'ni siquiera puede averiguar el tamaño del equipo'
);

set local request.jwt.claims to
  '{"sub":"f2000000-0000-0000-0000-000000000012","role":"authenticated"}';

select is(
  (select count(*)::integer from public.order_chat_messages),
  0,
  'el gerente de OTRA empresa no lee nada'
);

-- ---------------------------------------------------------------------------
-- El chat es un registro: no se edita ni se borra
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"f2000000-0000-0000-0000-000000000011","role":"authenticated"}';

select throws_ok(
  $$update public.order_chat_messages set body = 'editado'$$,
  '42501',
  null,
  'los mensajes no se editan'
);

select throws_ok(
  $$delete from public.order_chat_messages$$,
  '42501',
  null,
  'los mensajes no se borran'
);

-- ---------------------------------------------------------------------------
-- Quitar a alguien del equipo lo saca del chat al instante
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select public.remove_order_team_member(
      'f2000000-0000-0000-0000-000000000051',
      'f2000000-0000-0000-0000-000000000014')$$,
  'el gerente quita al ayudante del equipo'
);

set local request.jwt.claims to
  '{"sub":"f2000000-0000-0000-0000-000000000014","role":"authenticated"}';

select is(
  (select count(*)::integer from public.order_chat_messages),
  0,
  'el ayudante quitado deja de leer el chat'
);

-- ---------------------------------------------------------------------------
-- Avisos y superficie de funciones
-- ---------------------------------------------------------------------------

reset role;
set local request.jwt.claims to '';

select is(
  (
    select count(*)::integer from public.notifications n
    where n.type = 'chat_message'
      and n.user_id = 'f2000000-0000-0000-0000-000000000014'
      and n.data->>'url' = '/tasks/f2000000-0000-0000-0000-000000000051'
  ),
  2,
  'el ayudante fue avisado de los mensajes del gerente y del responsable, y llega a la tarea, no a la pantalla de empresa'
);

select is(
  (
    select count(*)::integer from public.notifications n
    where n.type = 'chat_message'
      and n.user_id = 'f2000000-0000-0000-0000-000000000011'
      and n.data->>'url' = '/orders/f2000000-0000-0000-0000-000000000051'
  ),
  2,
  'el gerente fue avisado de los dos mensajes ajenos (responsable y ayudante) y nunca de los propios'
);

select ok(
  not has_function_privilege('anon', 'public.auth_can_use_order_chat(uuid, uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.order_team_size(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.notify_order_chat_message()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.notify_order_chat_message()', 'EXECUTE'),
  'nada del chat es ejecutable por anon, y la función del trigger tampoco por authenticated'
);

select * from finish();

rollback;

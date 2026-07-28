-- Test de fuga cruzada de la Fase 2 (coordinador/instalador multi-empresa).
--
-- A diferencia de los tests estructurales (que sólo miran el TEXTO de las
-- policies), éste simula el JWT de una persona real con doble membresía y
-- verifica, fila por fila, qué le devuelve cada tabla. Es el gate que el plan
-- pide antes de dar por buena la Fase 2: las policies PERMISSIVE se combinan
-- con OR, así que una rama floja ENSANCHA acceso en vez de acotarla, y eso
-- sólo se detecta mirando filas, no texto.
--
-- Requiere la extensión `pgtap`. Todo el fixture vive dentro de la transacción
-- y se revierte con el `rollback` final — no deja residuos aunque falle.
--
-- Nota de entorno: el SQL Editor de Supabase Studio sólo muestra el resultado
-- de la ÚLTIMA sentencia de un script, así que todos los asserts van unidos en
-- un solo SELECT al final — cada línea "ok"/"not ok" queda visible junta.
--
-- Escenario: P coordina la empresa A (proyecto A1, no A2) y además es
-- instalador en la empresa B, sin ningún rol de coordinador ahí. Q es
-- instalador simple en A. Ninguno usa `profiles.role='coordinator'`: la
-- membresía de P en A vive sólo en `company_installers`, para probar que el
-- modelo nuevo funciona solo, sin apoyarse en la rama vieja.

begin;

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
insert into public.companies (id, name, country, order_prefix) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Test Empresa A', 'AR', 'TSA'),
  ('aaaaaaaa-0000-0000-0000-00000000000b', 'Test Empresa B', 'AR', 'TSB');

-- P y Q: cuentas 'installer' a nivel global. El rol de coordinador de P vive
-- exclusivamente en company_installers, no en profiles.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change,
  email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-0000-0000-0000-0000000000f1', 'authenticated', 'authenticated',
  'test-p@fuga-cruzada.invalid', extensions.crypt('x', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}',
  '{"role":"installer","full_name":"Test P"}', now(), now(),
  '', '', '', '', '', '', '', ''
), (
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-0000-0000-0000-0000000000f2', 'authenticated', 'authenticated',
  'test-q@fuga-cruzada.invalid', extensions.crypt('x', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}',
  '{"role":"installer","full_name":"Test Q"}', now(), now(),
  '', '', '', '', '', '', '', ''
);

-- Membresías: P coordina A y además instala en B. Q sólo instala en A.
insert into public.company_installers (company_id, installer_id, role, status, joined_at) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-0000000000f1', 'coordinator', 'active', now()),
  ('aaaaaaaa-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-0000000000f1', 'installer', 'active', now()),
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-0000000000f2', 'installer', 'active', now());

-- validate_project_relations() todavía exige profiles.role='coordinator' (es
-- una de las funciones que arregla la Fase 3, no ésta). Se desactiva sólo para
-- sembrar el fixture: P coordina A1 exclusivamente vía company_installers, que
-- es justamente el escenario que la Fase 3 va a habilitar de punta a punta en
-- la app. El rollback final restaura el trigger solo.
alter table public.projects disable trigger projects_validate_relations;

-- Dos proyectos en A: sólo A1 lo coordina P. A2 es a propósito ajeno a P.
insert into public.projects (id, company_id, name, coordinator_id) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Proyecto A1 (coordina P)', 'aaaaaaaa-0000-0000-0000-0000000000f1'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Proyecto A2 (no coordina P)', null);

-- Un proyecto en B, ajeno a P (ahí sólo instala, no coordina nada).
insert into public.projects (id, company_id, name, coordinator_id) values
  ('aaaaaaaa-0000-0000-0000-0000000000b1', 'aaaaaaaa-0000-0000-0000-00000000000b', 'Proyecto B1', null);

alter table public.projects enable trigger projects_validate_relations;

insert into public.clients (id, company_id, name) values
  ('aaaaaaaa-0000-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Cliente de A'),
  ('aaaaaaaa-0000-0000-0000-0000000000c2', 'aaaaaaaa-0000-0000-0000-00000000000b', 'Cliente de B');

insert into public.sites (id, project_id, company_id, name) values
  ('aaaaaaaa-0000-0000-0000-0000000000s1', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Sitio A1'),
  ('aaaaaaaa-0000-0000-0000-0000000000s2', 'aaaaaaaa-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Sitio A2'),
  ('aaaaaaaa-0000-0000-0000-0000000000s3', 'aaaaaaaa-0000-0000-0000-0000000000b1', 'aaaaaaaa-0000-0000-0000-00000000000b', 'Sitio B1');

-- Orden en A1 (P la ve como coordinador) y en A2 (P NO la coordina).
-- Orden en B asignada a P (la ve como instalador) y otra en B ajena a P por
-- completo — ésa es el control de fuga: ninguna membresía debería mostrársela.
insert into public.work_orders (id, order_number, site_id, project_id, company_id, title, assigned_installer_id) values
  ('aaaaaaaa-0000-0000-0000-0000000000w1', 'TESTFUGA-A1', 'aaaaaaaa-0000-0000-0000-0000000000s1', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Orden A1', null),
  ('aaaaaaaa-0000-0000-0000-0000000000w2', 'TESTFUGA-A2', 'aaaaaaaa-0000-0000-0000-0000000000s2', 'aaaaaaaa-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Orden A2', null),
  ('aaaaaaaa-0000-0000-0000-0000000000w3', 'TESTFUGA-B1', 'aaaaaaaa-0000-0000-0000-0000000000s3', 'aaaaaaaa-0000-0000-0000-0000000000b1', 'aaaaaaaa-0000-0000-0000-00000000000b', 'Orden B asignada a P', 'aaaaaaaa-0000-0000-0000-0000000000f1'),
  ('aaaaaaaa-0000-0000-0000-0000000000w4', 'TESTFUGA-B2', 'aaaaaaaa-0000-0000-0000-0000000000s3', 'aaaaaaaa-0000-0000-0000-0000000000b1', 'aaaaaaaa-0000-0000-0000-00000000000b', 'Orden B ajena a P', null);

-- ---------------------------------------------------------------------------
-- Simular la sesión de P
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-0000000000f1","role":"authenticated"}';

select n, msg from (
  select 0 as n, msg from plan(8) msg

  -- 1-2. projects: ve A1 (la coordina), no ve A2 (misma empresa, no la coordina).
  union all
  select 1, msg from is(
    (select count(*)::integer from public.projects where id = 'aaaaaaaa-0000-0000-0000-0000000000a1'),
    1,
    'P ve el proyecto que coordina (A1)'
  ) msg
  union all
  select 2, msg from is(
    (select count(*)::integer from public.projects where id = 'aaaaaaaa-0000-0000-0000-0000000000a2'),
    0,
    'P NO ve el proyecto de su misma empresa que no coordina (A2)'
  ) msg

  -- 3. clients: ve el de A (coordina ahí); NO el de B (ahí sólo instala).
  union all
  select 3, msg from is(
    (select count(*)::integer from public.clients where id in (
      'aaaaaaaa-0000-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-0000000000c2'
    )),
    1,
    'P ve el cliente de la empresa que coordina y no el de la que sólo instala'
  ) msg

  -- 4-5. work_orders: ve la de A1 (coordina) y la de B asignada a él (instala);
  -- NO ve la de A2 (no la coordina) ni la de B ajena — ésta es la fuga central:
  -- que P tenga una membresía cualquiera en B no debe abrirle las demás órdenes.
  union all
  select 4, msg from is(
    (select count(*)::integer from public.work_orders where id in (
      'aaaaaaaa-0000-0000-0000-0000000000w1', 'aaaaaaaa-0000-0000-0000-0000000000w2',
      'aaaaaaaa-0000-0000-0000-0000000000w3', 'aaaaaaaa-0000-0000-0000-0000000000w4'
    )),
    2,
    'P ve exactamente las 2 órdenes que le corresponden (A1 coordinada + B1 asignada)'
  ) msg
  union all
  select 5, msg from is(
    (select count(*)::integer from public.work_orders where id = 'aaaaaaaa-0000-0000-0000-0000000000w4'),
    0,
    'P NO ve la orden de B que no le está asignada, pese a instalar ahí'
  ) msg

  -- 6-7. company_installers (patrón B): P, como coordinador de A, ve la fila de
  -- Q en el roster de A; no ve el roster de B (ahí sólo instala, no coordina).
  union all
  select 6, msg from is(
    (select count(*)::integer from public.company_installers
      where company_id = 'aaaaaaaa-0000-0000-0000-00000000000a'
        and installer_id = 'aaaaaaaa-0000-0000-0000-0000000000f2'),
    1,
    'P ve la fila de Q en el roster de la empresa que coordina'
  ) msg
  union all
  select 7, msg from is(
    (select count(*)::integer from public.company_installers
      where company_id = 'aaaaaaaa-0000-0000-0000-00000000000b'
        and installer_id <> 'aaaaaaaa-0000-0000-0000-0000000000f1'),
    0,
    'P NO ve el resto del roster de la empresa donde sólo instala'
  ) msg

  -- 8. can_operate_project: confirma en directo que la función nueva funciona
  -- para P sin depender de profiles.role='coordinator' (P es 'installer' global).
  union all
  select 8, msg from ok(
    public.can_operate_project('aaaaaaaa-0000-0000-0000-0000000000a1'),
    'can_operate_project reconoce a P como operador de A1 vía membresía, no vía profiles.role'
  ) msg

  union all
  select 9, msg from finish() msg
) results
order by n;

rollback;

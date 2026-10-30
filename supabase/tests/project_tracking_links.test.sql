-- Bloque 7 (docs/specs/2026-09-24-link-cliente): link público de
-- seguimiento. Primera superficie de la app sin sesión (aparte de
-- `invitation_preview`) — estas pruebas cubren tanto el lado empresa
-- (generar/revocar, un solo activo) como lo que ve el cliente sin login, y
-- la política de storage que firma las fotos.

begin;

create extension if not exists pgtap with schema extensions;

select plan(23);

select has_table('public', 'project_tracking_links', 'existe la tabla de links de seguimiento');
select is(
  (select relrowsecurity from pg_class where relname = 'project_tracking_links'),
  true,
  'project_tracking_links tiene RLS activa'
);

insert into public.companies (id, name, country, order_prefix) values
  ('f2000000-0000-0000-0000-000000000001', 'Empresa A', 'AR', 'LKA');

insert into auth.users (id, email, raw_app_meta_data) values
  ('f2000000-0000-0000-0000-000000000011', 'gerente.a@test.dev',
   '{"role":"company_manager","company_id":"f2000000-0000-0000-0000-000000000001","is_owner":true}'::jsonb),
  ('f2000000-0000-0000-0000-000000000012', 'coordinador.a@test.dev',
   '{"role":"installer"}'::jsonb),
  ('f2000000-0000-0000-0000-000000000013', 'ajeno@test.dev',
   '{"role":"installer"}'::jsonb);

insert into public.company_installers (company_id, installer_id, role, status, joined_at) values
  ('f2000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000012', 'coordinator', 'active', now()),
  ('f2000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000013', 'installer', 'active', now());

insert into public.clients (id, company_id, name) values
  ('f2000000-0000-0000-0000-000000000021', 'f2000000-0000-0000-0000-000000000001', 'Cliente A');

insert into public.projects (id, company_id, client_id, name, client_name, country, zones, coordinator_id) values
  ('f2000000-0000-0000-0000-000000000031', 'f2000000-0000-0000-0000-000000000001',
   'f2000000-0000-0000-0000-000000000021', 'Proyecto A', 'Cliente A', 'AR', array['Buenos Aires'],
   'f2000000-0000-0000-0000-000000000012'),
  -- Un segundo proyecto, sin ningún link, para probar que sus fotos no se filtran.
  ('f2000000-0000-0000-0000-000000000032', 'f2000000-0000-0000-0000-000000000001',
   'f2000000-0000-0000-0000-000000000021', 'Proyecto B', 'Cliente A', 'AR', array['Buenos Aires'],
   'f2000000-0000-0000-0000-000000000012');

insert into public.sites (id, project_id, company_id, name) values
  ('f2000000-0000-0000-0000-000000000041', 'f2000000-0000-0000-0000-000000000031',
   'f2000000-0000-0000-0000-000000000001', 'Sucursal Centro'),
  ('f2000000-0000-0000-0000-000000000042', 'f2000000-0000-0000-0000-000000000032',
   'f2000000-0000-0000-0000-000000000001', 'Sucursal Norte');

insert into public.work_orders (id, site_id, project_id, company_id, title, status, finalized_at) values
  ('f2000000-0000-0000-0000-000000000051', 'f2000000-0000-0000-0000-000000000041',
   'f2000000-0000-0000-0000-000000000031', 'f2000000-0000-0000-0000-000000000001',
   'Cartel frente', 'finalizada', now()),
  ('f2000000-0000-0000-0000-000000000052', 'f2000000-0000-0000-0000-000000000041',
   'f2000000-0000-0000-0000-000000000031', 'f2000000-0000-0000-0000-000000000001',
   'Cartel lateral', 'pendiente', null),
  -- Orden finalizada de OTRO proyecto, sin link: su foto no tiene que aparecer.
  ('f2000000-0000-0000-0000-000000000053', 'f2000000-0000-0000-0000-000000000042',
   'f2000000-0000-0000-0000-000000000032', 'f2000000-0000-0000-0000-000000000001',
   'Cartel B', 'finalizada', now());

insert into public.order_updates (id, order_id, company_id, installer_id, type, photos) values
  ('f2000000-0000-0000-0000-000000000061', 'f2000000-0000-0000-0000-000000000051',
   'f2000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000012',
   'progress', '["f2000000-0000-0000-0000-000000000001/f2000000-0000-0000-0000-000000000051/foto1.jpg"]'::jsonb),
  ('f2000000-0000-0000-0000-000000000062', 'f2000000-0000-0000-0000-000000000052',
   'f2000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000012',
   'progress', '["f2000000-0000-0000-0000-000000000001/f2000000-0000-0000-0000-000000000052/no-deberia-verse.jpg"]'::jsonb),
  ('f2000000-0000-0000-0000-000000000063', 'f2000000-0000-0000-0000-000000000053',
   'f2000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000012',
   'progress', '["f2000000-0000-0000-0000-000000000001/f2000000-0000-0000-0000-000000000053/foto-proyecto-b.jpg"]'::jsonb);

-- Temp table: no la protege RLS, sirve para pasar el token entre sesiones
-- dentro de la misma prueba (mismo truco que `company_staff.test.sql`).
create temp table _tokens (label text primary key, token uuid);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"f2000000-0000-0000-0000-000000000013","role":"authenticated"}';

select throws_ok(
  $$select public.rotate_project_tracking_link('f2000000-0000-0000-0000-000000000031')$$,
  'P0001',
  'ACCESS_DENIED',
  'LINKCLI-R1.1: alguien ajeno al proyecto no puede generar un link'
);

set local request.jwt.claims to
  '{"sub":"f2000000-0000-0000-0000-000000000012","role":"authenticated"}';

insert into _tokens (label, token)
select 'first', public.rotate_project_tracking_link('f2000000-0000-0000-0000-000000000031');

select is(
  (select count(*)::integer from public.project_tracking_links
    where project_id = 'f2000000-0000-0000-0000-000000000031' and revoked_at is null),
  1,
  'LINKCLI-R1.1: el coordinador del proyecto genera un link, y queda uno activo'
);

insert into _tokens (label, token)
select 'second', public.rotate_project_tracking_link('f2000000-0000-0000-0000-000000000031');

select is(
  (select count(*)::integer from public.project_tracking_links
    where project_id = 'f2000000-0000-0000-0000-000000000031' and revoked_at is null),
  1,
  'LINKCLI-R1.2: generar de nuevo revoca el anterior, sigue habiendo uno solo activo'
);

select isnt(
  (select token from _tokens where label = 'first'),
  (select token from _tokens where label = 'second'),
  'LINKCLI-R1.4: cada generación da un token distinto'
);

select is(
  (select token from _tokens where label = 'second'),
  (select token from public.project_tracking_links
    where project_id = 'f2000000-0000-0000-0000-000000000031' and revoked_at is null),
  'el token vigente es el de la segunda generación, no el de la primera'
);

reset role;

-- ---------------------------------------------------------------------------
-- Lo que ve el cliente, sin sesión (como correría la RPC desde `anon`)
-- ---------------------------------------------------------------------------

select is(
  (public.project_tracking_snapshot((select token from _tokens where label = 'second')) ->> 'valid')::boolean,
  true,
  'LINKCLI-R2.1: el token vigente es válido'
);

select is(
  (public.project_tracking_snapshot((select token from _tokens where label = 'second')) ->> 'projectName'),
  'Proyecto A',
  'LINKCLI-R2.2: trae el nombre del proyecto'
);

select is(
  (public.project_tracking_snapshot((select token from _tokens where label = 'second')) ->> 'completionPct')::integer,
  50,
  'LINKCLI-R2.2: avance = 1 finalizada de 2 vivas'
);

select is(
  jsonb_array_length(public.project_tracking_snapshot((select token from _tokens where label = 'second')) -> 'milestones'),
  2,
  'LINKCLI-R2.3: dos hitos, uno por orden viva del proyecto'
);

select is(
  jsonb_array_length(public.project_tracking_snapshot((select token from _tokens where label = 'second')) -> 'photoPaths'),
  1,
  'LINKCLI-R2.4: una sola foto — sólo la de la orden finalizada'
);

select ok(
  (public.project_tracking_snapshot((select token from _tokens where label = 'second')) -> 'photoPaths')
    ? 'f2000000-0000-0000-0000-000000000001/f2000000-0000-0000-0000-000000000051/foto1.jpg',
  'y es justo la foto de la orden finalizada'
);

select ok(
  not ((public.project_tracking_snapshot((select token from _tokens where label = 'second')) -> 'photoPaths')
    ? 'f2000000-0000-0000-0000-000000000001/f2000000-0000-0000-0000-000000000053/foto-proyecto-b.jpg'),
  'LINKCLI-R2.4: nunca trae una foto de otro proyecto'
);

select is(
  (public.project_tracking_snapshot((select token from _tokens where label = 'first')) ->> 'valid')::boolean,
  false,
  'LINKCLI-R2.6: el token viejo (revocado por la segunda generación) ya no vale'
);

select is(
  (public.project_tracking_snapshot('00000000-0000-0000-0000-000000000000') ->> 'valid')::boolean,
  false,
  'LINKCLI-R2.6: un token inexistente da la misma respuesta que uno revocado'
);

-- ---------------------------------------------------------------------------
-- La política de storage: firmar sólo lo que corresponde
-- ---------------------------------------------------------------------------

select ok(
  public.storage_path_has_active_tracking_link('f2000000-0000-0000-0000-000000000051'),
  'LINKCLI-R3.3: con el link activo, se puede firmar la foto de la orden finalizada'
);

select ok(
  not public.storage_path_has_active_tracking_link('f2000000-0000-0000-0000-000000000052'),
  'LINKCLI-R3.3: no se firma la foto de una orden todavía abierta'
);

select ok(
  not public.storage_path_has_active_tracking_link('f2000000-0000-0000-0000-000000000053'),
  'LINKCLI-R3.3: no se firma la foto de un proyecto sin ningún link'
);

-- ---------------------------------------------------------------------------
-- Revocar corta el acceso, del lado cliente Y del lado storage
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"f2000000-0000-0000-0000-000000000012","role":"authenticated"}';

select lives_ok(
  $$select public.revoke_project_tracking_link('f2000000-0000-0000-0000-000000000031')$$,
  'LINKCLI-R1.3: el coordinador revoca el link'
);

reset role;

select is(
  (public.project_tracking_snapshot((select token from _tokens where label = 'second')) ->> 'valid')::boolean,
  false,
  'LINKCLI-R2.6: revocado, el mismo token ya no vale'
);

select ok(
  not public.storage_path_has_active_tracking_link('f2000000-0000-0000-0000-000000000051'),
  'LINKCLI-R3.3: revocado, tampoco se puede firmar más la foto'
);

-- ---------------------------------------------------------------------------
-- Superficie de funciones: lo que escribe el link es sólo para `authenticated`
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.rotate_project_tracking_link(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.revoke_project_tracking_link(uuid)', 'EXECUTE'),
  'ninguna de las funciones que generan o revocan el link es ejecutable por anon'
);

select * from finish();

rollback;

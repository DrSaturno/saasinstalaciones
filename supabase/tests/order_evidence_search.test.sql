-- Chat, documentación y evidencia por Orden de Trabajo: búsqueda por orden.
--
-- Tres cosas que se cruzan y por eso conviene probar juntas:
--
--   1. Aislamiento: buscar en una orden de la Empresa A no puede devolver
--      nada de la Empresa B, ni siquiera cuando el mismo instalador trabaja
--      para las dos (el caso que Finanzas ya probó para la plata, acá se
--      repite para mensajes y adjuntos).
--   2. El coordinador ve por PROYECTO, no por empresa entera: asignado a un
--      proyecto sí, a otro de la misma empresa no.
--   3. La búsqueda funciona de verdad: encuentra "material" tanto en un
--      mensaje como en el nombre de un archivo con guiones
--      ("remito-material.pdf" — Postgres lo tokeniza como UNA palabra si no
--      se normaliza, es el bug que se encontró probando esto a mano), y
--      encuentra "daño" buscando "dano" sin ñ.

begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

-- ---------------------------------------------------------------------------
-- Estructura
-- ---------------------------------------------------------------------------

select has_column('public', 'order_updates', 'links', 'el mensaje guarda los enlaces detectados');
select has_column('public', 'order_updates', 'created_by', 'el mensaje tiene un autor generico, valido para cualquier rol');
select has_column('public', 'order_updates', 'search_vector', 'el mensaje es buscable');
select has_column('public', 'order_attachments', 'search_vector', 'el adjunto es buscable por nombre');

select is(
  (select pg_get_constraintdef(oid) like '%message%' from pg_constraint where conname = 'order_updates_type_check'),
  true,
  '''message'' es un tipo de update válido, sin perder los hitos operativos existentes'
);

select has_function('public', 'search_order_evidence', array['uuid', 'text', 'text[]'], 'existe la búsqueda unificada');

-- ---------------------------------------------------------------------------
-- Fixture: dos empresas, un instalador dual, un coordinador asignado a UN
-- solo proyecto de su empresa (no a todos), y un tercer instalador.
-- ---------------------------------------------------------------------------

insert into public.companies (id, name, country, order_prefix) values
  ('e1000000-0000-0000-0000-000000000001', 'Empresa A', 'AR', 'EVA'),
  ('e1000000-0000-0000-0000-000000000002', 'Empresa B', 'AR', 'EVB');

insert into auth.users (id, email, raw_user_meta_data) values
  ('e1000000-0000-0000-0000-000000000011', 'gerente.a@evidence.test',
   '{"role":"company_manager","company_id":"e1000000-0000-0000-0000-000000000001"}'::jsonb),
  ('e1000000-0000-0000-0000-000000000012', 'gerente.b@evidence.test',
   '{"role":"company_manager","company_id":"e1000000-0000-0000-0000-000000000002"}'::jsonb),
  ('e1000000-0000-0000-0000-000000000013', 'instalador.dual@evidence.test',
   '{"role":"installer"}'::jsonb),
  ('e1000000-0000-0000-0000-000000000014', 'instalador.ajeno@evidence.test',
   '{"role":"installer"}'::jsonb),
  ('e1000000-0000-0000-0000-000000000015', 'coordinador.a@evidence.test',
   '{"role":"coordinator","company_id":"e1000000-0000-0000-0000-000000000001"}'::jsonb);

insert into public.company_installers (company_id, installer_id, role, status, joined_at) values
  ('e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000013', 'installer', 'active', now()),
  ('e1000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000013', 'installer', 'active', now()),
  ('e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000014', 'installer', 'active', now()),
  ('e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000015', 'coordinator', 'active', now());

insert into public.clients (id, company_id, name) values
  ('e1000000-0000-0000-0000-000000000021', 'e1000000-0000-0000-0000-000000000001', 'Cliente A'),
  ('e1000000-0000-0000-0000-000000000022', 'e1000000-0000-0000-0000-000000000002', 'Cliente B');

-- Proyecto A: el coordinador SÍ está asignado. Proyecto A2: misma empresa,
-- coordinador SIN asignar — es el caso que separa "ve su proyecto" de
-- "ve toda la empresa".
insert into public.projects (id, company_id, client_id, coordinator_id, name, country, zones) values
  ('e1000000-0000-0000-0000-000000000031', 'e1000000-0000-0000-0000-000000000001',
   'e1000000-0000-0000-0000-000000000021', 'e1000000-0000-0000-0000-000000000015', 'Proyecto A', 'AR', array['Buenos Aires']),
  ('e1000000-0000-0000-0000-000000000033', 'e1000000-0000-0000-0000-000000000001',
   'e1000000-0000-0000-0000-000000000021', null, 'Proyecto A2 sin coordinador', 'AR', array['Buenos Aires']),
  ('e1000000-0000-0000-0000-000000000032', 'e1000000-0000-0000-0000-000000000002',
   'e1000000-0000-0000-0000-000000000022', null, 'Proyecto B', 'AR', array['Buenos Aires']);

insert into public.sites (id, project_id, company_id, name) values
  ('e1000000-0000-0000-0000-000000000041', 'e1000000-0000-0000-0000-000000000031',
   'e1000000-0000-0000-0000-000000000001', 'Punto A'),
  ('e1000000-0000-0000-0000-000000000044', 'e1000000-0000-0000-0000-000000000033',
   'e1000000-0000-0000-0000-000000000001', 'Punto A2'),
  ('e1000000-0000-0000-0000-000000000042', 'e1000000-0000-0000-0000-000000000032',
   'e1000000-0000-0000-0000-000000000002', 'Punto B');

insert into public.work_orders (id, site_id, project_id, company_id, title, assigned_installer_id) values
  -- Orden A: del dual, dentro del proyecto que el coordinador SÍ opera.
  ('e1000000-0000-0000-0000-000000000051', 'e1000000-0000-0000-0000-000000000041',
   'e1000000-0000-0000-0000-000000000031', 'e1000000-0000-0000-0000-000000000001',
   'Orden A', 'e1000000-0000-0000-0000-000000000013'),
  -- Orden A2: del ajeno, misma empresa, proyecto SIN coordinador asignado.
  ('e1000000-0000-0000-0000-000000000054', 'e1000000-0000-0000-0000-000000000044',
   'e1000000-0000-0000-0000-000000000033', 'e1000000-0000-0000-0000-000000000001',
   'Orden A2', 'e1000000-0000-0000-0000-000000000014'),
  -- Orden B: del dual, pero en la OTRA empresa.
  ('e1000000-0000-0000-0000-000000000052', 'e1000000-0000-0000-0000-000000000042',
   'e1000000-0000-0000-0000-000000000032', 'e1000000-0000-0000-0000-000000000002',
   'Orden B', 'e1000000-0000-0000-0000-000000000013');

-- `installer_id` referencia `installers` (no `profiles`): sirve para las
-- filas que escribe un instalador. `created_by` es el autor genérico, el que
-- expone la búsqueda — así un mensaje de gerente/coordinador (que no tiene
-- fila en `installers`) también puede identificar quién lo escribió.
insert into public.order_updates (id, order_id, company_id, installer_id, created_by, type, note) values
  ('e1000000-0000-0000-0000-000000000061', 'e1000000-0000-0000-0000-000000000051',
   'e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000013',
   'e1000000-0000-0000-0000-000000000013', 'message',
   'Material recibido en sucursal, ver https://ejemplo.com/plano.pdf'),
  ('e1000000-0000-0000-0000-000000000062', 'e1000000-0000-0000-0000-000000000052',
   'e1000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000013',
   'e1000000-0000-0000-0000-000000000013', 'message',
   'Material en sucursal B'),
  ('e1000000-0000-0000-0000-000000000063', 'e1000000-0000-0000-0000-000000000054',
   'e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000014',
   'e1000000-0000-0000-0000-000000000014', 'message',
   'Hay un daño en la fachada');

-- Un avance HISTÓRICO: `created_by` en null, como toda fila escrita antes de
-- que esa columna existiera. Sirve para dos cosas a la vez: que el autor se
-- rescate desde `installer_id`, y que el hito conserve su etiqueta de tipo.
insert into public.order_updates (id, order_id, company_id, installer_id, created_by, type, note) values
  ('e1000000-0000-0000-0000-000000000064', 'e1000000-0000-0000-0000-000000000051',
   'e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000013',
   null, 'blocker',
   'Falta la llave del tablero');

insert into public.order_attachments (order_id, company_id, storage_path, file_name, mime_type, size_bytes) values
  ('e1000000-0000-0000-0000-000000000051', 'e1000000-0000-0000-0000-000000000001',
   'test/remito-material.pdf', 'remito-material.pdf', 'application/pdf', 1000),
  ('e1000000-0000-0000-0000-000000000054', 'e1000000-0000-0000-0000-000000000001',
   'test/foto-dano.jpg', 'foto-dano.jpg', 'image/jpeg', 2000);

-- ---------------------------------------------------------------------------
-- El instalador dual
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"e1000000-0000-0000-0000-000000000013","role":"authenticated"}';

select is(
  (select count(*)::integer from public.search_order_evidence('e1000000-0000-0000-0000-000000000051', null, null)),
  3,
  'el dual ve sus dos mensajes + el adjunto de SU orden en la Empresa A'
);

select is(
  (select count(*)::integer from public.search_order_evidence('e1000000-0000-0000-0000-000000000054', null, null)),
  0,
  'el dual no ve nada de una orden asignada a otro instalador'
);

select is(
  (select count(*)::integer from public.search_order_evidence('e1000000-0000-0000-0000-000000000052', 'material', null)),
  1,
  'el dual encuentra su propio mensaje en la orden que tiene en la Empresa B'
);

-- ---------------------------------------------------------------------------
-- La empresa A: lo suyo y nada más — ni lo del mismo instalador en la B
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"e1000000-0000-0000-0000-000000000011","role":"authenticated"}';

select is(
  (select count(*)::integer from public.search_order_evidence('e1000000-0000-0000-0000-000000000051', null, null)),
  3,
  'la empresa A ve los mensajes y el adjunto de su propia orden'
);

select is(
  (select count(*)::integer from public.search_order_evidence('e1000000-0000-0000-0000-000000000052', null, null)),
  0,
  'la empresa A no ve nada de la orden en la Empresa B, aunque la haya escrito su propio instalador dual'
);

-- ---------------------------------------------------------------------------
-- Búsqueda: por texto, por nombre de archivo con guiones, sin acentos
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::integer from public.search_order_evidence('e1000000-0000-0000-0000-000000000051', 'material', null)),
  2,
  '"material" encuentra el mensaje Y el adjunto remito-material.pdf (tokenizado por guion)'
);

select is(
  (
    select links from public.search_order_evidence('e1000000-0000-0000-0000-000000000051', null, null)
    where id = 'e1000000-0000-0000-0000-000000000061'
  ),
  array['https://ejemplo.com/plano.pdf'],
  'el enlace del mensaje se extrajo solo, sin que la app tenga que mandarlo aparte'
);

select is(
  (
    select count(*)::integer from public.search_order_evidence('e1000000-0000-0000-0000-000000000051', null, array['document'])
  ),
  1,
  'filtrar por "document" deja afuera el mensaje'
);

select is(
  (
    select kind from public.search_order_evidence('e1000000-0000-0000-0000-000000000051', null, array['document'])
  ),
  'document',
  'y lo que queda es efectivamente el documento'
);

-- `installer_id` no sirve como autor genérico: referencia `installers`, no
-- `profiles`, así que un mensaje de gerente no podría guardar ahí su id.
-- `created_by` es el campo que la búsqueda expone como autor.
select is(
  (
    select author_id from public.search_order_evidence('e1000000-0000-0000-0000-000000000051', null, null)
    where id = 'e1000000-0000-0000-0000-000000000061'
  ),
  'e1000000-0000-0000-0000-000000000013'::uuid,
  'el autor del mensaje se identifica por created_by, no por installer_id'
);

-- El historial del instalador etiquetaba cada entrada por tipo. Al unificar
-- el panel eso se conservaría sólo si `subtype` viaja: sin él, un aviso de
-- bloqueo se leería igual que un comentario cualquiera.
select is(
  (
    select subtype from public.search_order_evidence('e1000000-0000-0000-0000-000000000051', null, null)
    where id = 'e1000000-0000-0000-0000-000000000064'
  ),
  'blocker',
  'un hito operativo conserva su tipo, no se aplana a "mensaje"'
);

-- Las filas anteriores a `created_by` tienen ese campo en null, pero su autor
-- se conoce: es `installer_id`. Sin el coalesce, el historial entero
-- aparecería como "alguien del equipo".
select is(
  (
    select author_id from public.search_order_evidence('e1000000-0000-0000-0000-000000000051', null, null)
    where id = 'e1000000-0000-0000-0000-000000000064'
  ),
  'e1000000-0000-0000-0000-000000000013'::uuid,
  'sin created_by, el autor se rescata desde installer_id'
);

-- ---------------------------------------------------------------------------
-- El coordinador: por proyecto, no por empresa entera
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"e1000000-0000-0000-0000-000000000015","role":"authenticated"}';

select is(
  (select count(*)::integer from public.search_order_evidence('e1000000-0000-0000-0000-000000000051', null, null)),
  3,
  'el coordinador ve la orden del proyecto que sí opera'
);

select is(
  (select count(*)::integer from public.search_order_evidence('e1000000-0000-0000-0000-000000000054', null, null)),
  0,
  'el coordinador NO ve la orden de otro proyecto de la MISMA empresa del que no es coordinador'
);

-- ---------------------------------------------------------------------------
-- El instalador ajeno: búsqueda sin acento sobre su propio mensaje y foto
-- ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub":"e1000000-0000-0000-0000-000000000014","role":"authenticated"}';

select is(
  (select count(*)::integer from public.search_order_evidence('e1000000-0000-0000-0000-000000000054', 'dano', null)),
  2,
  'buscar "dano" sin ñ encuentra el mensaje "daño" Y la foto "foto-dano.jpg"'
);

select is(
  (select count(*)::integer from public.search_order_evidence('e1000000-0000-0000-0000-000000000051', null, null)),
  0,
  'el ajeno no ve nada de la orden del dual, aunque sea la misma empresa'
);

reset role;

select * from finish();

rollback;

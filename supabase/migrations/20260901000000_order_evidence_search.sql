-- Chat, documentación y evidencia por Orden de Trabajo, con búsqueda.
--
-- **El problema.** La ficha de una orden hoy muestra tres secciones sin
-- ningún buscador: Historial (order_updates: texto + fotos), Adjuntos
-- (order_attachments: imágenes y PDFs) e Incidencias. Aparte existe un chat
-- de verdad, pero es empresa↔instalador (un canal por persona,
-- `chat_threads` tiene `unique (company_id, installer_id)`), no por orden:
-- mezcla todas las órdenes de un instalador en una sola conversación.
--
-- **La decisión.** `order_updates` ya es por orden, ya tiene RLS correcta
-- para gerente/coordinador/instalador (confirmado: `order_updates_company_insert`
-- y `order_updates_coordinator_all` ya permiten escribir — el permiso
-- existía, nunca se construyó la pantalla), y ya tiene el camino offline
-- resuelto para el instalador. Se lo extiende con un tipo de mensaje libre
-- en vez de construir un chat nuevo desde cero. El chat general no se toca:
-- resuelve un problema distinto (coordinación fuera de una orden puntual) y
-- tocar su unique constraint para forzarlo "por orden" lo rompería sin
-- necesidad.
--
-- **Búsqueda.** Config `simple` + `unaccent`, no `spanish`: el producto
-- tiene empresas en Argentina y Brasil en la misma base, y stemmear en un
-- solo idioma rompería las búsquedas del otro.

-- ---------------------------------------------------------------------------
-- 1. Mensaje libre en order_updates
-- ---------------------------------------------------------------------------

-- El check vigente hoy es ('checkin','progress','blocker','done','system',
-- 'survey') — 'survey' se sumó después de la migración inicial y es lógica
-- de negocio viva (order_rules.sql la usa para validar prerequisitos de
-- relevamiento). Se preserva tal cual; sólo se agrega 'message'.
alter table public.order_updates drop constraint order_updates_type_check;
alter table public.order_updates
  add constraint order_updates_type_check
    check (type in ('checkin', 'progress', 'blocker', 'done', 'system', 'survey', 'message'));

comment on column public.order_updates.type is
  'Hitos operativos (checkin/progress/blocker/done/survey/system) más ''message'': un mensaje libre que no mueve el estado de la orden.';

-- `installer_id` referencia `installers`, no `profiles` — nunca podría
-- guardar el id de un gerente o coordinador. Se agrega `created_by`, mismo
-- patrón que ya usa `work_orders.created_by`, para tener un autor genérico
-- que funcione para cualquier rol sin tocar el significado de `installer_id`.
alter table public.order_updates add column created_by uuid references public.profiles (id) on delete set null;

-- Enlaces: se extraen al escribir, no en cada búsqueda. Así "enlaces" es un
-- filtro barato sobre una columna indexada, en vez de un regex corriendo en
-- cada consulta.
alter table public.order_updates add column links text[] not null default '{}';

create or replace function public.extract_order_update_links()
returns trigger
language plpgsql
as $$
begin
  new.links := coalesce(
    (select array_agg(m[1]) from regexp_matches(new.note, 'https?://\S+', 'g') as m),
    '{}'
  );
  return new;
end;
$$;

create trigger order_updates_extract_links
  before insert or update of note on public.order_updates
  for each row execute function public.extract_order_update_links();

-- ---------------------------------------------------------------------------
-- 2. Búsqueda por palabra clave
-- ---------------------------------------------------------------------------

create extension if not exists unaccent with schema extensions;

-- `unaccent(text)` es STABLE, no IMMUTABLE (resuelve el diccionario en cada
-- llamada) — Postgres no lo deja usar en una columna generada. Se fija el
-- diccionario explícitamente ('unaccent', el que crea la extensión), que sí
-- es determinístico, y se envuelve en una función marcada IMMUTABLE. Patrón
-- estándar de Postgres para este caso exacto.
create or replace function public.immutable_unaccent(text)
returns text
language sql
immutable
parallel safe
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, $1);
$$;

-- Postgres tokeniza "remito-material.pdf" como UN solo lexeme (lo reconoce
-- como token tipo "file"/"host", no separa por guion/guion bajo/punto) —
-- buscar "material" no encontraría ese archivo. Se reemplaza todo lo que no
-- sea letra o número por un espacio ANTES de tokenizar, así separa en
-- "remito material pdf". Se prueba explícitamente en el test pgTAP.
create or replace function public.tokenizable_words(text)
returns text
language sql
immutable
parallel safe
as $$
  select regexp_replace($1, '[^[:alnum:]]+', ' ', 'g');
$$;

alter table public.order_updates
  add column search_vector tsvector
    generated always as (
      to_tsvector('simple', public.immutable_unaccent(public.tokenizable_words(coalesce(note, ''))))
    ) stored;
create index order_updates_search_idx on public.order_updates using gin (search_vector);

alter table public.order_attachments
  add column search_vector tsvector
    generated always as (
      to_tsvector('simple', public.immutable_unaccent(public.tokenizable_words(file_name)))
    ) stored;
create index order_attachments_search_idx on public.order_attachments using gin (search_vector);

-- ---------------------------------------------------------------------------
-- 3. Función de búsqueda unificada
-- ---------------------------------------------------------------------------

-- `security invoker`: mismo patrón que `installer_earnings` en Finanzas. La
-- función no otorga ningún acceso nuevo — la RLS de work_orders/order_updates/
-- order_attachments sigue decidiendo qué fila puede leer cada llamante,
-- exactamente como si consultara las tablas por separado.
create or replace function public.search_order_evidence(
  p_order_id uuid,
  p_query text default null,
  p_kinds text[] default null
)
returns table (
  id uuid,
  kind text,
  -- El `type` original del update (checkin/progress/blocker/done/survey/system),
  -- null para los adjuntos. La pantalla del instalador ya etiquetaba cada
  -- entrada del historial con esto; sin devolverlo, unificar el panel borraría
  -- la diferencia entre un aviso de bloqueo y un mensaje cualquiera.
  subtype text,
  body text,
  photos jsonb,
  links text[],
  author_id uuid,
  created_at timestamptz,
  storage_path text
)
language sql
security invoker
stable
as $$
  -- `installers.id` referencia `profiles.id`, así que para todo lo que ya
  -- existía —escrito por instaladores, cuando `created_by` todavía no era una
  -- columna— `installer_id` ES el autor. Sin este coalesce, el historial
  -- entero aparecería como "alguien del equipo" aunque se sepa quién fue.
  select ou.id, 'message'::text, ou.type, ou.note, ou.photos, ou.links,
         coalesce(ou.created_by, ou.installer_id), ou.created_at, null::text
  from public.order_updates ou
  where ou.order_id = p_order_id
    and (ou.note <> '' or jsonb_array_length(ou.photos) > 0)
    and (p_query is null or ou.search_vector @@ websearch_to_tsquery('simple', public.immutable_unaccent(public.tokenizable_words(p_query))))
    and (p_kinds is null or 'message' = any(p_kinds))
  union all
  select oa.id,
         case when oa.mime_type like 'image/%' then 'image' else 'document' end,
         null::text,
         oa.file_name, '[]'::jsonb, '{}'::text[], oa.uploaded_by, oa.created_at, oa.storage_path
  from public.order_attachments oa
  where oa.order_id = p_order_id
    and (p_query is null or oa.search_vector @@ websearch_to_tsquery('simple', public.immutable_unaccent(public.tokenizable_words(p_query))))
    and (p_kinds is null
         or (case when oa.mime_type like 'image/%' then 'image' else 'document' end) = any(p_kinds))
  order by created_at desc;
$$;

comment on function public.search_order_evidence(uuid, text, text[]) is
  'Busca y filtra mensajes+adjuntos de una orden en un solo resultado. "Enlaces" se deriva en la capa de dominio a partir de message.links, no es una rama propia acá.';

revoke all on function public.search_order_evidence(uuid, text, text[]) from public;
grant execute on function public.search_order_evidence(uuid, text, text[]) to authenticated;

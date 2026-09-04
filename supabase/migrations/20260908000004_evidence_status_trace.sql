-- Punto 24, Fase 4: el historial muestra la traza, no sólo la frase.
--
-- `search_order_evidence` alimenta el panel de evidencia que ven la empresa y
-- el instalador. Devolvía autor, fecha, nota y fotos —todo lo que `REQ-14.2`
-- pide menos dos cosas: el estado anterior y el nuevo, que hasta esta entrega
-- sólo existían dentro de una frase traducida, y `occurred_at`.
--
-- La distinción entre cuándo pasó y cuándo llegó (`REQ-14.7`) ya estaba en la
-- tabla desde el día uno: `client_created_at` lo pone el teléfono cuando el
-- hecho ocurre y `created_at` la base cuando la fila entra. Nunca había
-- llegado a la pantalla, así que un evento sincronizado tres horas más tarde
-- se leía como si hubiera pasado al sincronizar.
-- `create or replace` NO puede cambiar el tipo de retorno de una función que
-- ya existe (42P13): agregar columnas a un `returns table` es cambiarlo. Hay
-- que dropearla primero.
--
-- Se aplicó así en Demo pero el drop no había quedado en el archivo, y el
-- schema de Demo ya tenía la versión nueva, así que la migración volvía a
-- pasar ahí sin ruido. CI, que reconstruye desde cero sobre la versión vieja,
-- fue el único que lo vio.
drop function if exists public.search_order_evidence(uuid, text, text[]);

create or replace function public.search_order_evidence(
  p_order_id uuid,
  p_query text default null,
  p_kinds text[] default null
)
returns table (
  id uuid,
  kind text,
  subtype text,
  body text,
  photos jsonb,
  links text[],
  author_id uuid,
  created_at timestamptz,
  storage_path text,
  from_status text,
  to_status text,
  -- Cuándo pasó de verdad, según el reloj de quien lo registró. Cae a
  -- `created_at` para todo lo escrito desde el escritorio, que no tiene otro.
  occurred_at timestamptz
)
language sql
security invoker
stable
as $$
  select ou.id, 'message'::text, ou.type, ou.note, ou.photos, ou.links,
         coalesce(ou.created_by, ou.installer_id), ou.created_at, null::text,
         ou.from_status, ou.to_status,
         coalesce(ou.client_created_at, ou.created_at)
  from public.order_updates ou
  where ou.order_id = p_order_id
    and (ou.note <> '' or jsonb_array_length(ou.photos) > 0)
    and (p_query is null or ou.search_vector @@ websearch_to_tsquery('simple', public.immutable_unaccent(public.tokenizable_words(p_query))))
    and (p_kinds is null or 'message' = any(p_kinds))
  union all
  select oa.id,
         case when oa.mime_type like 'image/%' then 'image' else 'document' end,
         null::text,
         oa.file_name, '[]'::jsonb, '{}'::text[], oa.uploaded_by, oa.created_at, oa.storage_path,
         null::text, null::text, oa.created_at
  from public.order_attachments oa
  where oa.order_id = p_order_id
    and (p_query is null or oa.search_vector @@ websearch_to_tsquery('simple', public.immutable_unaccent(public.tokenizable_words(p_query))))
    and (p_kinds is null
         or (case when oa.mime_type like 'image/%' then 'image' else 'document' end) = any(p_kinds))
  order by created_at desc;
$$;

comment on function public.search_order_evidence(uuid, text, text[]) is
  'Busca y filtra mensajes+adjuntos de una orden en un solo resultado, con la traza de estado y el momento real del hecho. "Enlaces" se deriva en la capa de dominio a partir de message.links, no es una rama propia acá.';

revoke all on function public.search_order_evidence(uuid, text, text[]) from public;
grant execute on function public.search_order_evidence(uuid, text, text[]) to authenticated;

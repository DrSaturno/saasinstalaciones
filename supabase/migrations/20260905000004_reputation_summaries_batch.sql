-- Fase 4 de reputación: los agregados de varios instaladores de una vez.
--
-- La pantalla de oportunidades muestra la reputación al lado de CADA
-- postulante, que es el momento en que la reputación efectivamente sirve para
-- conseguir trabajo. Pedirla de a una haría una consulta por persona y por
-- convocatoria — decenas de idas y vueltas para dibujar una lista.
--
-- **No reimplementa nada.** Llama a `reputation_summary` una vez por id, así
-- que el número que ve la empresa en la lista es exactamente el mismo que ve
-- en la ficha, y el control de permisos se aplica igual para cada persona: la
-- función no es una puerta de atrás para leer en lote lo que no se podría leer
-- de a uno.
create or replace function public.reputation_summaries(
  p_installer_ids uuid[],
  p_as_of timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_out jsonb := '{}'::jsonb;
  v_ids uuid[] := coalesce(p_installer_ids, array[]::uuid[]);
  v_id uuid;
begin
  -- Un tope, porque el arreglo lo arma el cliente. Ninguna pantalla real
  -- muestra doscientos postulantes; un pedido que lo intente es un error o un
  -- abuso, y en los dos casos conviene que falle temprano.
  if array_length(v_ids, 1) > 200 then
    raise exception 'Demasiados instaladores en una sola consulta';
  end if;

  foreach v_id in array v_ids loop
    v_out := v_out || jsonb_build_object(
      v_id::text,
      public.reputation_summary(v_id, p_as_of)
    );
  end loop;

  return v_out;
end;
$fn$;

revoke all on function public.reputation_summaries(uuid[], timestamptz) from public;
grant execute on function public.reputation_summaries(uuid[], timestamptz) to authenticated;

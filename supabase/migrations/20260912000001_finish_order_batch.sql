-- Auditoría del 11-09-2026 — H3, la mitad que faltaba.
--
-- El alta masiva le da a cada orden recién creada tres cosas: su actividad, su
-- horario y —si corresponde— su instalador. Eso son CUATRO viajes de red por
-- orden (la RPC de actividades, el select de la actividad de ejecución, la RPC
-- de horario y la compuerta de asignación). Con el proyecto insignia del
-- blueprint, ~2000 puntos, son unos 8000 viajes secuenciales: no entra en
-- ningún límite de tiempo razonable de la plataforma.
--
-- El PR anterior cerró lo peor —que un corte dejara órdenes sin actividad para
-- siempre— haciendo el alta reanudable. Esto cierra la causa: el bucle pasa a
-- correr DENTRO de la base. Mil iteraciones en plpgsql son milisegundos; mil
-- viajes HTTP son minutos.
--
-- ## Por qué llama a las funciones que ya existen en vez de reescribirlas
--
-- `set_activity_schedule` es la única puerta que puede mover un horario y es
-- donde viven los controles de solapamiento, ausencia y traslado;
-- `assign_installer_gate` toma el lock por instalador y decide la asignación.
-- Reimplementarlas en versión «set-based» sería crear justamente el llamador
-- suelto que después hay que salir a cazar cuando una regla cambie. Acá se las
-- orquesta, no se las duplica: siguen siendo la autoridad.
--
-- Las tres son `security definer` y hacen su propio control con `auth.uid()`,
-- así que este envoltorio NO necesita serlo — y no lo es, por la misma razón
-- que `apply_order_status_change`: no se agrega superficie privilegiada.
--
-- ## Por qué el llamador manda de a tandas y no las 2000 de una
--
-- Supabase impone `statement_timeout` al rol `authenticated`. Una transacción
-- única de 2000 órdenes lo pasaría y no commitearía NADA, que es peor que el
-- problema original. En tandas, cada llamada es una transacción acotada que
-- commitea sola, y si una falla, la pasada de reparación del alta masiva
-- recupera lo que quedó a medias. El tamaño lo elige el llamador.

create or replace function public.finish_order_batch(
  p_order_ids uuid[],
  p_include_survey boolean default false,
  p_include_execution boolean default true,
  p_date date default null,
  p_start_time time default null,
  p_end_time time default null,
  p_duration_minutes integer default null,
  p_installer_id uuid default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_order_id uuid;
  v_activity_id uuid;
  v_gate jsonb;
  v_processed integer := 0;
  v_assignment_warnings integer := 0;
begin
  if p_order_ids is null or array_length(p_order_ids, 1) is null then
    return jsonb_build_object('processed', 0, 'assignment_warnings', 0);
  end if;

  -- Techo defensivo: quien llame con una tanda enorme se lleva el
  -- `statement_timeout` y pierde la transacción entera. Mejor decirlo.
  if array_length(p_order_ids, 1) > 500 then
    raise exception 'BATCH_TOO_LARGE' using errcode = '22023';
  end if;

  foreach v_order_id in array p_order_ids loop
    -- Idempotente: si la orden ya tiene sus actividades y son las mismas que
    -- se piden, no hace nada. Es lo que permite reintentar una tanda.
    perform public.create_order_activities(
      v_order_id, p_include_survey, p_include_execution
    );

    -- La de ejecución es el trabajo en sí. Si la orden es sólo relevamiento,
    -- esa. Mismo criterio que `syncActivitySchedule` en la aplicación: un
    -- relevamiento que acompaña a una ejecución se agenda aparte a propósito.
    select a.id
      into v_activity_id
      from public.work_activities a
     where a.work_order_id = v_order_id
     order by (a.activity_type = 'execution') desc
     limit 1;

    if v_activity_id is not null then
      perform public.set_activity_schedule(
        v_activity_id, p_date, p_start_time, p_end_time, p_duration_minutes
      );
    end if;

    if p_installer_id is not null then
      -- `gen_random_uuid()` como id de operación: cada intento es su propia
      -- operación para la compuerta, igual que en el alta de a una.
      v_gate := public.assign_installer_gate(
        v_order_id, p_installer_id, gen_random_uuid()
      );
      -- La compuerta bloqueó (agenda, ausencia, elegibilidad). No se fuerza ni
      -- se aborta el lote: se cuenta y se avisa, mismo criterio que tenía la
      -- aplicación cuando el bucle vivía ahí.
      if coalesce((v_gate ->> 'available')::boolean, false) is not true then
        v_assignment_warnings := v_assignment_warnings + 1;
      end if;
    end if;

    v_activity_id := null;
    v_processed := v_processed + 1;
  end loop;

  return jsonb_build_object(
    'processed', v_processed,
    'assignment_warnings', v_assignment_warnings
  );
end;
$$;

revoke all on function public.finish_order_batch(
  uuid[], boolean, boolean, date, time, time, integer, uuid
) from public, anon;
grant execute on function public.finish_order_batch(
  uuid[], boolean, boolean, date, time, time, integer, uuid
) to authenticated;

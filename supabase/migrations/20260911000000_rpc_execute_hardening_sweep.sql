-- Auditoría del 11-09-2026 — H1. Regresión de SEC-01/02/03.
--
-- `public.order_condition_snapshot(uuid)` se creó en la migración
-- `20260905000001_performance_events.sql`, es decir DESPUÉS del endurecimiento
-- de `20260904123451`, y nunca se le revocó nada. `create function` concede
-- EXECUTE a PUBLIC por defecto —lo dice el comentario de aquella migración— y
-- PUBLIC incluye a `anon`, que PostgREST expone en `/rest/v1/rpc/*` con la
-- clave pública. Al ser `security definer`, la función lee `work_orders` y
-- `work_order_conditions` SIN pasar por RLS: con un uuid de orden devolvía las
-- condiciones de trabajo de cualquier empresa, sin sesión.
--
-- Ninguna acción de la aplicación la llama (verificado por grep sobre `lib/` y
-- `app/`): sus únicos llamadores son `track_performance_from_order`, un
-- trigger, cuyas llamadas corren como el DEFINER. Por eso se revoca también de
-- `authenticated`: no hay camino de usuario que romper.
--
-- Se repite el barrido completo con el MISMO criterio de aquella migración en
-- vez de tocar una sola función, para cerrar de una lo que haya entrado por la
-- misma puerta entre ambas fechas. La defensa duradera, sin embargo, no es
-- esto: es el assert de invariante en `supabase/tests/rpc_execute_hardening`,
-- que hasta hoy enumeraba nombres a mano y por eso no vio nada.
--
-- Idempotente: se puede re-ejecutar sin daño.

do $$
declare
  r record;

  -- Helpers evaluados dentro de policies RLS: intocables. Las policies los
  -- corren en el contexto del rol que consulta, así que `anon`/`authenticated`
  -- DEBEN conservar EXECUTE o la RLS se rompe.
  keep_public text[] := array[
    'auth_can_operate_work_activity', 'auth_can_operate_work_order',
    'auth_can_read_work_activity', 'auth_companies', 'auth_company',
    'auth_has_company_role', 'auth_is_activity_assignee', 'auth_is_company_manager',
    'auth_role', 'broadcast_matches_installer', 'can_operate_project',
    'can_read_location', 'company_is_active', 'company_path_is_active',
    'installer_can_read_broadcast',
    -- Pública a propósito: el destinatario todavía no tiene cuenta.
    'invitation_preview'
  ];

  -- Sólo las llaman triggers, cron u otras security definer.
  internal_only text[] := array[
    'emit_reliability_event', 'emit_performance_event',
    'run_reliability_jobs', 'emit_reschedule_reminders', 'emit_reschedule_timeouts',
    'announcement_audience',
    'reputation_contributions', 'installer_streak',
    -- Nuevo en este barrido: el motivo de esta migración.
    'order_condition_snapshot'
  ];
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prokind = 'f'
      and pg_get_function_result(p.oid) <> 'trigger'
      and not (p.proname = any(keep_public))
  loop
    if r.proname = any(internal_only) then
      execute format(
        'revoke execute on function public.%I(%s) from public, anon, authenticated',
        r.proname, r.args);
    else
      execute format(
        'revoke execute on function public.%I(%s) from public, anon',
        r.proname, r.args);
      execute format(
        'grant execute on function public.%I(%s) to authenticated',
        r.proname, r.args);
    end if;
  end loop;
end $$;

-- Mismo criterio para los trigger functions creados desde entonces.
do $$
declare
  r record;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and pg_get_function_result(p.oid) = 'trigger'
  loop
    execute format(
      'revoke execute on function public.%I(%s) from public, anon, authenticated',
      r.proname, r.args);
  end loop;
end $$;

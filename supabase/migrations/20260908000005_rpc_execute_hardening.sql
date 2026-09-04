-- Auditoría de seguridad — SEC-01, SEC-02, SEC-03 (ver docs/SECURITY_AUDIT.md).
--
-- Problema: 103 funciones `security definer` tenían EXECUTE para `anon`. Como
-- PostgREST expone `/rest/v1/rpc/*` con la anon key pública, cualquiera podía
-- llamarlas SIN sesión. Verificado contra Demo:
--   * `reputation_summary` → HTTP 200 con datos de un instalador (SEC-02).
--   * `run_reliability_jobs` → HTTP 200, dispara el job de cron (SEC-03).
--   * `emit_reliability_event` → insertó un evento negativo contra un
--     instalador arbitrario (SEC-01, data tampering del núcleo de reputación).
--
-- Además, `reputation_contributions` devuelve el detalle por evento con
-- `company_id` sin guarda: saltea el filtro por empresa que sí aplica
-- `reputation_detail` (DEC-17: el detalle no cruza empresas). Se cierra acá.
--
-- ---------------------------------------------------------------------------
-- Criterio
-- ---------------------------------------------------------------------------
--
-- 1. HELPERS DE RLS: se dejan intactos. Las policies los evalúan en el
--    contexto del rol que consulta, así que `anon`/`authenticated` DEBEN
--    conservar EXECUTE o la RLS se rompe. Son inofensivos: devuelven datos
--    del propio `auth.uid()` (un anon obtiene null/false).
--
-- 2. INTERNAS: sólo las invocan triggers, `pg_cron` u otras `security definer`.
--    Esas llamadas corren como el DEFINER (dueño), así que revocar el grant de
--    usuario NO rompe el camino interno. Se revoca de public, anon Y
--    authenticated.
--
-- 3. RPC DE USUARIO: las llama la app con la sesión del usuario. Se revoca de
--    public y anon (nunca deben ser anónimas) y se re-concede a authenticated.
--    Las mutaciones ya validan `auth_role()`/`auth.uid()` internamente; sacar
--    `anon` es defensa en profundidad y las saca de la superficie anónima.
--
-- La revocación es de `public` además de los roles nombrados: en un entorno
-- reconstruido desde cero (CI) `create function` concede a PUBLIC por default,
-- mientras que en producción el grant figura explícito por rol. Revocar de
-- ambos cubre los dos casos; el `grant ... to authenticated` posterior
-- restituye lo que la app necesita valga cual valga el punto de partida.

do $$
declare
  r record;

  -- Helpers evaluados dentro de policies RLS: intocables.
  keep_public text[] := array[
    'auth_can_operate_work_activity', 'auth_can_operate_work_order',
    'auth_can_read_work_activity', 'auth_companies', 'auth_company',
    'auth_has_company_role', 'auth_is_activity_assignee', 'auth_is_company_manager',
    'auth_role', 'broadcast_matches_installer', 'can_operate_project',
    'can_read_location', 'company_is_active', 'company_path_is_active',
    'installer_can_read_broadcast',
    -- Preview de invitación: pública a propósito (el destinatario todavía no
    -- tiene cuenta). Keyed por un token UUID no adivinable; sólo expone
    -- email + validez + nombre de empresa.
    'invitation_preview'
  ];

  -- Sólo las llaman triggers, cron u otras security definer. Ningún llamador
  -- desde la app (verificado por grep). Se revoca también de authenticated.
  internal_only text[] := array[
    'emit_reliability_event', 'emit_performance_event',
    'run_reliability_jobs', 'emit_reschedule_reminders', 'emit_reschedule_timeouts',
    'announcement_audience',
    -- Devuelve el detalle crudo por evento; el filtro por empresa vive en
    -- `reputation_detail`, que sí es de usuario. Ésta es su motor interno.
    'reputation_contributions', 'installer_streak'
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

-- Los trigger functions (`returns trigger`) tampoco deberían ser llamables como
-- RPC. PostgREST ya los rechaza ("trigger functions can only be called as
-- triggers"), pero se revoca el grant igual para no dejar superficie muerta.
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

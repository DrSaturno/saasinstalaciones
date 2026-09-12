-- Auditoría de seguridad — SEC-01/02/03 (docs/SECURITY_AUDIT.md).
--
-- Afirma la frontera de EXECUTE de las funciones `security definer`:
--   * `anon` NO puede ejecutar RPC de usuario ni funciones internas.
--   * `authenticated` SÍ puede ejecutar las RPC de usuario.
--   * `anon` y `authenticated` NO pueden ejecutar las funciones internas
--     (emisores de eventos, jobs, motor de reputación).
--   * Los helpers de RLS y `invitation_preview` siguen siendo ejecutables por
--     `anon` (los necesita la evaluación de policies / el flujo de invitación).
--
-- Sin esto, cualquiera con la anon key pública llamaba estas funciones por
-- PostgREST sin sesión. Un assert que se rompe si una migración futura vuelve
-- a conceder EXECUTE de más.

begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

-- --- anon NO puede: lectura sensible, tampering, jobs -----------------------

select ok(
  not has_function_privilege('anon', 'public.reputation_summary(uuid, timestamptz)', 'EXECUTE'),
  'SEC-02: anon no puede leer reputation_summary'
);
select ok(
  not has_function_privilege('anon', 'public.reputation_contributions(uuid, timestamptz)', 'EXECUTE'),
  'BOLA: anon no puede leer el detalle crudo de reputation_contributions'
);
select ok(
  not has_function_privilege('anon', 'public.run_reliability_jobs()', 'EXECUTE'),
  'SEC-03: anon no puede disparar run_reliability_jobs'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.emit_reliability_event(uuid, uuid, uuid, text, text, uuid, timestamptz)',
    'EXECUTE'),
  'SEC-01: anon no puede inyectar eventos de confiabilidad'
);
select ok(
  not has_function_privilege('anon', 'public.order_min_photos(uuid)', 'EXECUTE'),
  'anon no puede leer helpers de orden'
);
select ok(
  not has_function_privilege('anon', 'public.order_condition_snapshot(uuid)', 'EXECUTE'),
  'H1 (11-09-2026): anon no puede leer las condiciones de una orden ajena'
);

-- --- authenticated tampoco puede las internas -------------------------------

select ok(
  not has_function_privilege(
    'authenticated',
    'public.emit_reliability_event(uuid, uuid, uuid, text, text, uuid, timestamptz)',
    'EXECUTE'),
  'SEC-01: authenticated tampoco puede inyectar eventos de confiabilidad'
);
select ok(
  not has_function_privilege('authenticated', 'public.run_reliability_jobs()', 'EXECUTE'),
  'SEC-03: authenticated tampoco puede disparar los jobs'
);
select ok(
  not has_function_privilege('authenticated', 'public.reputation_contributions(uuid, timestamptz)', 'EXECUTE'),
  'BOLA: authenticated tampoco puede saltear el filtro por empresa del detalle'
);

-- --- authenticated SÍ puede las RPC de usuario ------------------------------

select ok(
  has_function_privilege('authenticated', 'public.reputation_summary(uuid, timestamptz)', 'EXECUTE'),
  'la app autenticada conserva reputation_summary'
);
select ok(
  has_function_privilege('authenticated', 'public.order_min_photos(uuid)', 'EXECUTE'),
  'la app autenticada conserva order_min_photos'
);

-- --- lo público a propósito sigue siendo público ----------------------------

select ok(
  has_function_privilege('anon', 'public.invitation_preview(uuid)', 'EXECUTE'),
  'invitation_preview sigue disponible para anon (preview del link)'
);
select ok(
  has_function_privilege('anon', 'public.auth_role()', 'EXECUTE'),
  'los helpers de RLS siguen ejecutables por anon (los evalúan las policies)'
);

-- --- la invariante, que es lo que de verdad protege ------------------------
--
-- Los asserts de arriba nombran funciones una por una. Esa forma dejó pasar la
-- regresión del 11-09-2026: `order_condition_snapshot` se creó después del
-- endurecimiento, `create function` le concedió EXECUTE a PUBLIC por defecto, y
-- como no estaba en la lista, nadie se enteró. Enumerar no sirve para algo que
-- falla justamente por lo que todavía no está enumerado.
--
-- Esto afirma la regla entera: NINGUNA `security definer` de `public` fuera de
-- la allowlist declarada puede ser ejecutada por `anon`. El resultado esperado
-- es la cadena vacía; cuando falla, el diff del assert muestra exactamente qué
-- función rompió la regla.

select is(
  coalesce(string_agg(format('%s(%s)', p.proname, pg_get_function_identity_arguments(p.oid)), ', ' order by p.proname), ''),
  '',
  'invariante: ninguna security definer fuera de la allowlist es ejecutable por anon'
)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and p.prokind = 'f'
  and pg_get_function_result(p.oid) <> 'trigger'
  and has_function_privilege('anon', p.oid, 'EXECUTE')
  and p.proname <> all (array[
    -- Helpers que evalúan las policies RLS en el contexto de quien consulta:
    -- sin EXECUTE para anon, la RLS se rompe.
    'auth_can_operate_work_activity', 'auth_can_operate_work_order',
    'auth_can_read_work_activity', 'auth_companies', 'auth_company',
    'auth_has_company_role', 'auth_is_activity_assignee', 'auth_is_company_manager',
    'auth_role', 'broadcast_matches_installer', 'can_operate_project',
    'can_read_location', 'company_is_active', 'company_path_is_active',
    'installer_can_read_broadcast',
    -- Pública a propósito: el destinatario todavía no tiene cuenta.
    'invitation_preview'
  ]);

-- Los trigger functions no son superficie de RPC. PostgREST ya los rechaza,
-- pero el grant colgado es superficie muerta que no tiene por qué existir.
select is(
  coalesce(string_agg(p.proname, ', ' order by p.proname), ''),
  '',
  'invariante: ningún trigger security definer queda ejecutable por anon o authenticated'
)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and pg_get_function_result(p.oid) = 'trigger'
  and (has_function_privilege('anon', p.oid, 'EXECUTE')
       or has_function_privilege('authenticated', p.oid, 'EXECUTE'));

select * from finish();
rollback;

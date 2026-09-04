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

select plan(12);

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

select * from finish();
rollback;

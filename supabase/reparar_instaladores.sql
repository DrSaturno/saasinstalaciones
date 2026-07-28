-- ============================================================================
-- Devolver a instalador1 e instalador2 su rol de instalador
-- ============================================================================
-- Después de la limpieza quedaron como 'coordinator' y fuera del roster
-- ('removed'). Eso no es un bug: es lo que hace a propósito la RPC
-- promote_installer_to_coordinator cuando se usa el botón "Ascender" en /team.
-- Alguien los ascendió probando esa función. Esto lo revierte.
--
-- Correr en el SQL Editor de Supabase. Seleccionar el bloque y ejecutarlo.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 0 — Estado actual. Solo lectura.
-- ────────────────────────────────────────────────────────────────────────────

select
  u.email,
  p.role,
  ci.status            as estado_en_roster,
  (i.id is not null)   as tiene_ficha_de_instalador
from auth.users u
left join public.profiles p            on p.id = u.id
left join public.installers i          on i.id = u.id
left join public.company_installers ci on ci.installer_id = u.id
where u.email in ('instalador1@demo.dev', 'instalador2@demo.dev');


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 1 — La reparación.
-- ────────────────────────────────────────────────────────────────────────────
-- Hace falta un bloque DO por dos motivos:
--
--  1. El trigger `prevent_privilege_change` bloquea cualquier cambio de `role`
--     que no venga de service_role. Es la defensa contra escalación de
--     privilegios y está bien que exista: acá la salteamos a propósito y por
--     única vez, declarando el rol dentro de la transacción.
--  2. `set_config(..., true)` es local a la transacción, y el SQL Editor
--     confirma cada sentencia por separado. Dentro del DO todo es una sola
--     transacción, así que el ajuste dura lo que dura el bloque y no queda
--     nada abierto después.

do $$
declare
  objetivo text[] := array['instalador1@demo.dev', 'instalador2@demo.dev'];
begin
  -- Habilita el cambio de rol solo dentro de esta transacción.
  perform set_config('request.jwt.claim.role', 'service_role', true);

  -- 1.a — Volver el rol a instalador.
  update public.profiles p
  set role = 'installer'
  from auth.users u
  where p.id = u.id
    and u.email = any (objetivo);

  -- 1.b — Reactivarlos en el roster de la empresa.
  update public.company_installers ci
  set status = 'active'
  from auth.users u
  where ci.installer_id = u.id
    and u.email = any (objetivo);
end $$;


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 2 — Verificar. Esperado: role 'installer' y roster 'active' en ambos.
-- ────────────────────────────────────────────────────────────────────────────

select
  u.email,
  p.role,
  ci.status            as estado_en_roster,
  (i.id is not null)   as tiene_ficha_de_instalador
from auth.users u
left join public.profiles p            on p.id = u.id
left join public.installers i          on i.id = u.id
left join public.company_installers ci on ci.installer_id = u.id
where u.email in ('instalador1@demo.dev', 'instalador2@demo.dev');

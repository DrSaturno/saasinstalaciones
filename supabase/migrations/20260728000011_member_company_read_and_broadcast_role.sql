-- Dos agujeros de RLS que hoy dejan pantallas vacías en producción.
--
-- Ninguno tiene que ver con permisos de más: los dos son permisos de MENOS,
-- gente que no puede leer lo que le corresponde. Van juntos porque comparten
-- la causa: dan por sentado que la pertenencia a una empresa se lee de
-- `profiles`, cuando para el instalador vive en `company_installers`.
--
-- Idempotente: se puede re-ejecutar sin daño.

-- ---------------------------------------------------------------------------
-- 1. Ningún instalador podía leer la tabla `companies`
-- ---------------------------------------------------------------------------
-- La policy pedía `id = auth_company()`, y `auth_company()` sale de
-- `profiles.company_id`, que para el instalador es NULL: sólo se setea para el
-- gerente y el coordinador. `id = NULL` es NULL, o sea ninguna fila.
--
-- Lo que rompía, todo en silencio:
--   · `fetchInstallerAvailability` filtra `companies` por el roster y devuelve
--     [] siempre — las tarjetas de disponibilidad por empresa de /profile nunca
--     se mostraron.
--   · `lib/data/tasks.ts` join a companies(name) → `company_name: ""`.
--   · Los anuncios del home nunca pudieron decir de qué empresa eran.
--
-- La pertenencia real del instalador es su fila activa del roster. Se agrega esa
-- rama. Sigue siendo sólo lectura: `companies` no tiene ninguna policy de
-- escritura, se administra desde el tablero maestro con service_role.
drop policy if exists companies_member_read on public.companies;
create policy companies_member_read on public.companies
  for select using (
    -- Gerente y coordinador: su empresa sale del perfil.
    id = public.auth_company()
    -- Instalador: las empresas donde está activo en el roster. 'invited' queda
    -- afuera a propósito — hasta que acepta, la pantalla de invitación resuelve
    -- el nombre por `invitation_preview`, que es security definer.
    or id in (
      select ci.company_id
      from public.company_installers ci
      where ci.installer_id = auth.uid()
        and ci.status = 'active'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Un coordinador veía la bolsa de trabajo vacía
-- ---------------------------------------------------------------------------
-- La policy exigía `auth_role() = 'installer'`, y el coordinador es
-- `role = 'coordinator'`. Pero el coordinador ES un instalador con un privilegio
-- extra (vive en el área instalador, acepta órdenes, se postula): dejarlo afuera
-- de /jobs es una regresión, no una regla.
--
-- El chequeo de rol además era redundante. El gate real es
-- `installer_can_read_broadcast(id)`, que resuelve por dos caminos y los dos ya
-- están acotados a la persona logueada:
--   · `broadcast_matches_installer` hace `join installers i on i.id = auth.uid()`
--     — sin ficha de oficio (zonas, radio) no matchea nada. Un gerente no tiene
--     esa ficha: `handle_new_user` sólo la crea para role='installer'.
--   · o ya se postuló, que es su propia fila de `broadcast_applications`.
--
-- O sea: sacar el rol no le abre la bolsa a nadie nuevo. Sólo deja de cerrársela
-- a quien corresponde.
drop policy if exists broadcasts_installer_read on public.broadcasts;
create policy broadcasts_installer_read on public.broadcasts
  for select using (public.installer_can_read_broadcast(id));

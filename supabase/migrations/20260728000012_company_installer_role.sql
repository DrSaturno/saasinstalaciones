-- Fase 1b del plan de coordinador/instalador multi-empresa.
--
-- Hoy `profiles.role` es un solo valor global y `profiles.company_id` una sola
-- empresa: coordinar y ejecutar son excluyentes a nivel de CUENTA, y coordinar
-- ata a una única empresa. El objetivo es que una persona pueda coordinar en
-- unas empresas e instalar en otras, y varias de cada una — dentro de cada
-- empresa el rol sigue siendo uno solo, pero deja de ser el mismo en todas.
--
-- La auditoría de Fase 0 (2026-07-28, sobre producción) confirmó el terreno
-- limpio: ningún coordinador tiene órdenes abiertas asignadas a sí mismo en la
-- empresa que coordina, ninguno falta en el roster, ninguno falta en
-- `installers`. El backfill de abajo es seguro.
--
-- Esta migración es puramente ADITIVA: agrega la columna, relaja la FK, crea
-- los helpers de seguridad — pero ninguna policy los usa todavía (eso es la
-- Fase 2, aparte). Cero cambio de comportamiento observable hoy.
--
-- Idempotente: se puede re-ejecutar sin daño.

-- ---------------------------------------------------------------------------
-- 1. El rol pasa a vivir en la MEMBRESÍA, no en la cuenta.
-- ---------------------------------------------------------------------------
-- Default 'installer' = lo que hoy significa cada fila existente de
-- `company_installers`: el backfill de los instaladores actuales es un no-op.
alter table public.company_installers
  add column if not exists role text not null default 'installer'
  check (role in ('installer', 'coordinator'));

-- ---------------------------------------------------------------------------
-- 2. La FK apuntaba a `installers(id)`. Un coordinador puro no tiene ficha de
--    oficio — `handle_new_user` sólo la crea para role='installer' — así que
--    bajo la FK actual no podría tener fila en el roster. El sujeto real de la
--    membresía es el PERFIL; `installers` queda como ficha de oficio (zonas,
--    habilidades, rating, base), ortogonal a la pertenencia a una empresa.
-- ---------------------------------------------------------------------------
alter table public.company_installers
  drop constraint if exists company_installers_installer_id_fkey;
alter table public.company_installers
  add constraint company_installers_user_fkey
  foreign key (installer_id) references public.profiles (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 3. El PK (company_id, installer_id) ya resuelve "quiénes están en esta
--    empresa". Falta el sentido inverso, "en qué empresas estoy": el que usan
--    los helpers de abajo, en cada request.
-- ---------------------------------------------------------------------------
create index if not exists company_installers_user_role_idx
  on public.company_installers (installer_id, status, role);

-- ---------------------------------------------------------------------------
-- 4. Backfill: todo coordinador actual gana membresía explícita en su empresa.
-- ---------------------------------------------------------------------------
insert into public.company_installers (company_id, installer_id, role, status, joined_at)
select p.company_id, p.id, 'coordinator', 'active', now()
from public.profiles p
where p.role = 'coordinator' and p.company_id is not null
on conflict (company_id, installer_id)
do update set role = 'coordinator', status = 'active';

-- ---------------------------------------------------------------------------
-- 5. Helpers de seguridad. Ninguna policy los usa todavía — eso es la Fase 2.
-- ---------------------------------------------------------------------------

-- Patrón primario: sin referencias a la fila exterior, Postgres lo evalúa una
-- sola vez por sentencia (InitPlan), no por fila. Preferir siempre esta forma
-- en las policies — crítico con proyectos de miles de locaciones.
create or replace function public.auth_companies(p_role text default null)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select ci.company_id
  from public.company_installers ci
  where ci.installer_id = auth.uid()
    and ci.status = 'active'
    and (p_role is null or ci.role = p_role)
$$;

-- Forma escalar: se evalúa POR FILA. Usar sólo cuando la empresa viene de una
-- columna del row exterior y el patrón `in (select auth_companies(...))` no
-- puede aplicarse (ej. dentro de `can_operate_project`, acotado por PK).
create or replace function public.auth_has_company_role(p_company_id uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.company_installers ci
    where ci.company_id = p_company_id
      and ci.installer_id = auth.uid()
      and ci.role = p_role
      and ci.status = 'active'
  )
$$;

-- Gate barato para UI/ruteo: ¿coordina en alguna empresa?
create or replace function public.auth_coordinates_anywhere()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.company_installers ci
    where ci.installer_id = auth.uid()
      and ci.role = 'coordinator'
      and ci.status = 'active'
  )
$$;

revoke all on function public.auth_companies(text) from public;
revoke all on function public.auth_has_company_role(uuid, text) from public;
revoke all on function public.auth_coordinates_anywhere() from public;
grant execute on function public.auth_companies(text) to authenticated;
grant execute on function public.auth_has_company_role(uuid, text) to authenticated;
grant execute on function public.auth_coordinates_anywhere() to authenticated;

-- Gate estructural de la Fase 6a. Ejecutar después de
-- 20260728000015_multi_company_cutover.sql y junto con
-- multi_company_membership.test.sql para volver a probar el aislamiento real.
--
-- El SQL Editor de Supabase sólo conserva el último resultado; por eso todos
-- los asserts se unen en una sola tabla.

begin;

create extension if not exists pgtap with schema extensions;

-- Se emite SOLO la columna de texto: pg_prove lee TAP de la salida de psql y
-- una segunda columna la vuelve ilegible («No subtests run»). El `order by n`
-- se conserva porque el orden de un union all no esta garantizado y TAP se lee
-- en secuencia. Sigue sirviendo para pegar en Supabase Studio.
select msg from (
  select 0 as n, msg from plan(10) msg

  union all
  select 1, msg from is(
    (select count(*)::integer from public.profiles where role = 'coordinator'),
    0,
    'ya no quedan coordinadores representados en profiles'
  ) msg

  union all
  select 2, msg from ok(
    (
      select pg_get_constraintdef(oid) not like '%coordinator%'
      from pg_constraint
      where conrelid = 'public.profiles'::regclass
        and conname = 'profiles_role_check'
    ),
    'profiles_role_check ya no admite coordinator'
  ) msg

  union all
  select 3, msg from ok(
    (
      select pg_get_constraintdef(oid) like '%company_manager%'
        and pg_get_constraintdef(oid) like '%company_id IS NOT NULL%'
      from pg_constraint
      where conrelid = 'public.profiles'::regclass
        and conname = 'manager_has_company'
    ),
    'company_id obligatorio quedó limitado al gerente'
  ) msg

  union all
  select 4, msg from ok(
    not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and policyname in (
          'company_installers_coordinator_read',
          'invitations_coordinator_read',
          'installer_weekly_coordinator_read',
          'installer_unavailability_coordinator_read',
          'projects_coordinator_all',
          'sites_coordinator_all',
          'work_orders_coordinator_all',
          'order_updates_coordinator_all',
          'broadcasts_coordinator_all',
          'site_attachments_coordinator_all',
          'order_attachments_coordinator_all',
          'order_incidents_coordinator_all',
          'ratings_coordinator_insert'
        )
        and (
          coalesce(qual, '') like '%auth_role()%coordinator%'
          or coalesce(with_check, '') like '%auth_role()%coordinator%'
        )
    ),
    'ninguna policy de coordinación conserva la rama de rol global'
  ) msg

  union all
  select 5, msg from ok(
    exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'company_installers'
        and policyname = 'company_installers_coordinator_read'
        and qual like '%auth_companies%'
        and qual not like '%auth_role%'
    ),
    'el roster de coordinación depende sólo de la membresía'
  ) msg

  union all
  select 6, msg from ok(
    (
      select qual = with_check
        and qual like '%auth_companies%'
        and qual not like '%auth_role%'
      from pg_policies
      where schemaname = 'public'
        and tablename = 'work_orders'
        and policyname = 'work_orders_coordinator_all'
    ),
    'work_orders mantiene using/with check idénticos y sin rama legacy'
  ) msg

  union all
  select 7, msg from ok(
    exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'projects'
        and policyname = 'projects_coordinator_all'
        and qual like '%coordinator_id%'
        and qual like '%auth_companies%'
        and qual not like '%auth_role%'
    ),
    'projects exige responsable y membresía de coordinador'
  ) msg

  union all
  select 8, msg from ok(
    exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'clients'
        and policyname = 'clients_company_operators_all'
        and qual like '%company_manager%'
        and qual like '%auth_companies%'
    ),
    'la rama monoempresa del gerente sigue intacta'
  ) msg

  union all
  select 9, msg from ok(
    (
      select prosrc not like '%coordinator%'
      from pg_proc
      where pronamespace = 'public'::regnamespace
        and proname = 'handle_new_user'
    ),
    'las altas nuevas no pueden crear un perfil coordinator'
  ) msg

  union all
  select 10, msg from ok(
    (
      select prosrc not like '%role_change_by_rpc%'
      from pg_proc
      where pronamespace = 'public'::regnamespace
        and proname = 'prevent_privilege_change'
    ),
    'el trigger de perfiles ya no conserva la excepción de promote/demote'
  ) msg

  union all
  select 11, msg from finish() msg
) results
order by n;

rollback;

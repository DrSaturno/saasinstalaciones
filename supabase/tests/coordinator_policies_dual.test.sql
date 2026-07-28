-- Nota de entorno: el SQL Editor de Supabase Studio sólo muestra el resultado
-- de la ÚLTIMA sentencia de un script. Como cada assert de pgTAP es su propia
-- sentencia top-level, correr este archivo tal cual sólo mostraba el resumen
-- de finish() ("failed 1 test of 14") sin decir cuál. Por eso todo va unido en
-- un solo SELECT: cada línea "ok"/"not ok" queda visible en la misma tabla.

begin;

select n, msg from (
  select 0 as n, msg from plan(14) msg
  union all
  select 1, msg from ok(
    (select prosrc from pg_proc where proname = 'can_operate_project') like '%auth_has_company_role%',
    'can_operate_project valida membresía por empresa, no auth_role() global'
  ) msg
  union all
  select 2, msg from ok(
    (select prosrc from pg_proc where proname = 'can_operate_project') like '%company_manager%',
    'can_operate_project conserva intacta la rama del gerente'
  ) msg
  union all
  select 3, msg from ok(
    (
      select qual = with_check
      from pg_policies
      where schemaname = 'public' and tablename = 'work_orders'
        and policyname = 'work_orders_coordinator_all'
    ),
    'work_orders_coordinator_all: with check ya no es más flojo que using'
  ) msg
  union all
  select 4, msg from ok(
    (
      select qual = with_check
      from pg_policies
      where schemaname = 'public' and tablename = 'sites'
        and policyname = 'sites_coordinator_all'
    ),
    'sites_coordinator_all: with check ya no es más flojo que using'
  ) msg
  union all
  select 5, msg from ok(
    (
      select qual = with_check
      from pg_policies
      where schemaname = 'public' and tablename = 'order_incidents'
        and policyname = 'order_incidents_coordinator_all'
    ),
    'order_incidents_coordinator_all: with check ya no es más flojo que using'
  ) msg
  union all
  select 6, msg from ok(
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'company_installers'
        and policyname = 'company_installers_coordinator_read'
        and qual like '%auth_role%' and qual like '%auth_companies%'
    ),
    'company_installers_coordinator_read tiene las dos ramas'
  ) msg
  union all
  select 7, msg from ok(
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'projects'
        and policyname = 'projects_coordinator_all'
        and qual like '%coordinator_id%' and qual like '%auth_companies%'
    ),
    'projects_coordinator_all sigue exigiendo ser el coordinador responsable, y además la membresía'
  ) msg
  union all
  select 8, msg from ok(
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'clients'
        and policyname = 'clients_company_operators_all'
        and qual like '%company_manager%' and qual like '%auth_companies%'
    ),
    'clients_company_operators_all separa la rama de gerente de la de coordinador'
  ) msg
  union all
  select 9, msg from ok(
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'chat_messages'
        and policyname = 'chat_messages_company_insert'
        and with_check like '%sender_id%' and with_check like '%auth_companies%'
    ),
    'chat_messages_company_insert conserva sender_id = auth.uid() junto con la membresía'
  ) msg
  union all
  select 10, msg from ok(
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'profiles'
        and policyname = 'profiles_company_operators_read'
        and qual like '%company_installers%'
        and qual not like '%company_manager%'
    ),
    'profiles_company_operators_read pasó a scope de roster (el gerente ya la cubre profiles_roster_read)'
  ) msg
  union all
  select 11, msg from ok(
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'chat_message_reads'
        and policyname = 'chat_reads_own_all'
        and with_check like '%auth_company()%'
        and with_check like '%auth_companies()%'
    ),
    'chat_reads_own_all conserva la rama del gerente (sin roster) y suma la de membresía'
  ) msg
  union all
  select 12, msg from is(
    (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'work_orders'),
    4,
    'work_orders sigue con sus 4 policies (company/installer_read/installer_progress/coordinator)'
  ) msg
  union all
  select 13, msg from is(
    (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'chat_threads'),
    4,
    'chat_threads sigue con sus 4 policies'
  ) msg
  union all
  select 14, msg from is(
    (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'order_incidents'),
    3,
    'order_incidents sigue con sus 3 policies (no rompe supabase/tests/order_incidents_rls.test.sql)'
  ) msg
  union all
  select 15, msg from finish() msg
) results
order by n;

rollback;

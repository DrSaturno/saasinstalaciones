begin;

select plan(14);

-- ---------------------------------------------------------------------------
-- can_operate_project ya no ata al coordinador a una sola empresa
-- ---------------------------------------------------------------------------
select ok(
  (select prosrc from pg_proc where proname = 'can_operate_project') like '%auth_has_company_role%',
  'can_operate_project valida membresía por empresa, no auth_role() global'
);

select ok(
  (select prosrc from pg_proc where proname = 'can_operate_project') like '%company_manager%',
  'can_operate_project conserva intacta la rama del gerente'
);

-- ---------------------------------------------------------------------------
-- Patrón C: el with check dejó de ser más flojo que el using. Antes de esta
-- migración, ninguna de las 8 llevaba auth_role() en el with_check; ahora
-- using y with_check son literalmente el mismo texto.
-- ---------------------------------------------------------------------------
select ok(
  (
    select qual = with_check
    from pg_policies
    where schemaname = 'public' and tablename = 'work_orders'
      and policyname = 'work_orders_coordinator_all'
  ),
  'work_orders_coordinator_all: with check ya no es más flojo que using'
);

select ok(
  (
    select qual = with_check
    from pg_policies
    where schemaname = 'public' and tablename = 'sites'
      and policyname = 'sites_coordinator_all'
  ),
  'sites_coordinator_all: with check ya no es más flojo que using'
);

select ok(
  (
    select qual = with_check
    from pg_policies
    where schemaname = 'public' and tablename = 'order_incidents'
      and policyname = 'order_incidents_coordinator_all'
  ),
  'order_incidents_coordinator_all: with check ya no es más flojo que using'
);

-- ---------------------------------------------------------------------------
-- Forma dual: cada policy tocada conserva la rama vieja (auth_role +
-- auth_company) Y suma la rama nueva (auth_companies por membresía).
-- ---------------------------------------------------------------------------
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'company_installers'
      and policyname = 'company_installers_coordinator_read'
      and qual like '%auth_role%' and qual like '%auth_companies%'
  ),
  'company_installers_coordinator_read tiene las dos ramas'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'projects'
      and policyname = 'projects_coordinator_all'
      and qual like '%coordinator_id%' and qual like '%auth_companies%'
  ),
  'projects_coordinator_all sigue exigiendo ser el coordinador responsable, y además la membresía'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'clients'
      and policyname = 'clients_company_operators_all'
      and qual like '%company_manager%' and qual like '%auth_companies%'
  ),
  'clients_company_operators_all separa la rama de gerente de la de coordinador'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'chat_messages'
      and policyname = 'chat_messages_company_insert'
      and with_check like '%sender_id%' and with_check like '%auth_companies%'
  ),
  'chat_messages_company_insert conserva sender_id = auth.uid() junto con la membresía'
);

-- ---------------------------------------------------------------------------
-- Casos especiales
-- ---------------------------------------------------------------------------
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'profiles_company_operators_read'
      and qual like '%company_installers%'
      and qual not like '%company_manager%'
  ),
  'profiles_company_operators_read pasó a scope de roster (el gerente ya la cubre profiles_roster_read)'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'chat_message_reads'
      and policyname = 'chat_reads_own_all'
      and with_check like '%auth_company()%'
      and with_check like '%auth_companies()%'
  ),
  'chat_reads_own_all conserva la rama del gerente (sin roster) y suma la de membresía'
);

-- ---------------------------------------------------------------------------
-- Nada se perdió: los conteos de policies por tabla no cambiaron (misma
-- cantidad de policies que antes de esta migración; sólo se redefinió el
-- cuerpo de las que ya existían).
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'work_orders'),
  4,
  'work_orders sigue con sus 4 policies (company/installer_read/installer_progress/coordinator)'
);

select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'chat_threads'),
  4,
  'chat_threads sigue con sus 4 policies'
);

select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'order_incidents'),
  3,
  'order_incidents sigue con sus 3 policies (no rompe supabase/tests/order_incidents_rls.test.sql)'
);

select * from finish();
rollback;

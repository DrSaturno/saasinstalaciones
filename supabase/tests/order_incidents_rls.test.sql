begin;

select plan(5);

select has_table('public', 'order_incidents', 'order_incidents existe');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.order_incidents'::regclass),
  'order_incidents tiene RLS activa'
);

select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'order_incidents'),
  3,
  'order_incidents define exactamente tres políticas'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_incidents'
      and policyname = 'order_incidents_company_all'
      and cmd = 'ALL'
      and qual like '%auth_company()%'
      and with_check like '%auth_company()%'
  ),
  'el gerente queda limitado a su empresa en lectura y escritura'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'order_incidents'
      and policyname = 'order_incidents_installer_read'
      and cmd = 'SELECT'
      and qual like '%assigned_installer_id%'
      and qual like '%auth.uid()%'
  ),
  'el instalador sólo puede leer incidencias de órdenes asignadas'
);

select * from finish();
rollback;

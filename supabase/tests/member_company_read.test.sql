begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

-- ---------------------------------------------------------------------------
-- companies: el miembro del roster puede leer su empresa
-- ---------------------------------------------------------------------------
select ok(
  (select relrowsecurity from pg_class where oid = 'public.companies'::regclass),
  'companies tiene RLS activa'
);

select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'companies'),
  1,
  'companies sigue definiendo una sola política, de lectura'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'companies'
      and policyname = 'companies_member_read'
      and cmd = 'SELECT'
      and qual like '%company_installers%'
      and qual like '%auth.uid()%'
  ),
  'el instalador puede leer las empresas donde está activo en el roster'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'companies'
      and policyname = 'companies_member_read'
      and qual like '%auth_company()%'
  ),
  'el gerente conserva la lectura de su empresa por perfil'
);

-- ---------------------------------------------------------------------------
-- broadcasts: la bolsa deja de filtrar por rol
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'broadcasts'),
  3,
  'broadcasts define exactamente tres políticas'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'broadcasts'
      and policyname = 'broadcasts_installer_read'
      and cmd = 'SELECT'
      and qual like '%installer_can_read_broadcast%'
  ),
  'la bolsa se sigue acotando por matching de zona/radio o postulación previa'
);

-- El chequeo de rol dejaba al coordinador sin bolsa. Es redundante: el gate real
-- exige ficha en `installers`, que un gerente no tiene.
select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'broadcasts'
      and policyname = 'broadcasts_installer_read'
      and qual like '%auth_role%'
  ),
  'la bolsa ya no discrimina por rol del perfil'
);

select * from finish();
rollback;

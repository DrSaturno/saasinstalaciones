begin;

select plan(8);

select has_column('public', 'company_installers', 'role', 'company_installers tiene un rol propio');

select ok(
  exists (
    select 1 from information_schema.check_constraints cc
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = cc.constraint_name
    where ccu.table_schema = 'public'
      and ccu.table_name = 'company_installers'
      and ccu.column_name = 'role'
      and cc.check_clause like '%installer%'
      and cc.check_clause like '%coordinator%'
  ),
  'el rol de la membresía está acotado a installer/coordinator'
);

-- La FK dejó de apuntar a `installers`: un coordinador puro no tiene ficha de
-- oficio y no podría tener fila en el roster bajo la FK vieja.
select ok(
  not exists (
    select 1 from pg_constraint
    where conname = 'company_installers_installer_id_fkey'
  ),
  'la FK vieja hacia installers(id) fue eliminada'
);

select ok(
  exists (
    select 1
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_class frel on frel.oid = con.confrelid
    where con.conname = 'company_installers_user_fkey'
      and rel.relname = 'company_installers'
      and frel.relname = 'profiles'
      and con.contype = 'f'
  ),
  'la membresía referencia al perfil, no a la ficha de instalador'
);

select has_index(
  'public', 'company_installers', 'company_installers_user_role_idx',
  'existe el índice para resolver "en qué empresas estoy"'
);

-- Los tres helpers nuevos existen y no tienen ningún consumidor todavía (eso
-- es la Fase 2): esta migración no cambia ninguna policy.
select has_function('public', 'auth_companies', array['text'], 'existe auth_companies(role)');
select has_function('public', 'auth_has_company_role', array['uuid', 'text'], 'existe auth_has_company_role(company, role)');
select has_function('public', 'auth_coordinates_anywhere', array[]::text[], 'existe auth_coordinates_anywhere()');

select * from finish();
rollback;

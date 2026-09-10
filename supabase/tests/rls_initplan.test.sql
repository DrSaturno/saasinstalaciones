-- Ninguna política puede recalcular la identidad en cada fila.
--
-- Una política escrita como `using (installer_id = auth.uid())` hace que
-- Postgres evalúe esa función por CADA FILA que filtra. Con las funciones
-- propias del proyecto —`auth_role()`, `auth_company()`, que consultan
-- `profiles`— eso son N búsquedas repetidas para responder siempre lo mismo.
--
-- La migración `20260910000001_rls_initplan` barrió las 107 políticas que lo
-- hacían. Este test existe para que no vuelva: una política nueva puede entrar
-- por cualquier migración futura, y lo más probable es que se copie el patrón
-- de la tabla de al lado. Mira el catálogo de Postgres, no los archivos, así
-- que no importa dónde se haya escrito.
--
-- Ver docs/specs/2026-09-10-rls-initplan/ (DEC-RLS-05).

begin;

create extension if not exists pgtap with schema extensions;

select plan(3);

-- Postgres normaliza el deparse: lo que se escribe `(select auth.uid())`
-- vuelve como `( SELECT auth.uid() AS uid)`. Por eso no se busca el patrón
-- "malo" directamente —`auth.uid()` aparece en los dos casos— sino que se
-- compara cuántas veces aparece la llamada contra cuántas veces aparece
-- envuelta. Si los números no coinciden, alguna quedó suelta.
create or replace function pg_temp.sueltas(p_patron text)
returns table (tabla text, politica text)
language sql
as $$
  select tablename::text, policyname::text
  from pg_policies
  where schemaname = 'public'
    and regexp_count(coalesce(qual, '') || ' ' || coalesce(with_check, ''), p_patron)
      <> regexp_count(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
                      'SELECT ' || p_patron || ' AS')
$$;

select is_empty(
  $$ select tabla || '.' || politica from pg_temp.sueltas('auth\.uid\(\)') $$,
  'ninguna politica llama a auth.uid() sin envolver en (select ...)'
);

select is_empty(
  $$ select tabla || '.' || politica from pg_temp.sueltas('auth_role\(\)') $$,
  'ninguna politica llama a auth_role() sin envolver en (select ...)'
);

select is_empty(
  $$ select tabla || '.' || politica from pg_temp.sueltas('auth_company\(\)') $$,
  'ninguna politica llama a auth_company() sin envolver en (select ...)'
);

select * from finish();

rollback;

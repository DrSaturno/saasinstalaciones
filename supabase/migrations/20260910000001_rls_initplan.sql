-- Que la identidad se calcule UNA VEZ por consulta, no una vez por fila.
--
-- Una política escrita como `using (assigned_installer_id = auth.uid())` hace
-- que Postgres evalúe `auth.uid()` por CADA FILA que filtra. Con `auth.uid()`
-- el costo es parsear el JWT; el problema real son las funciones propias del
-- proyecto, que consultan otra tabla:
--
--   auth_role()    -> select role from profiles where id = auth.uid()
--   auth_company() -> select company_id from profiles join companies ...
--
-- `work_orders_company_all` llama a las dos en su `using`. Traer 50 órdenes al
-- tablero eran 50 búsquedas repetidas en `profiles` para responder siempre lo
-- mismo, multiplicado por cada tabla que toca una pantalla. El asesor de
-- Supabase lo reporta como `auth_rls_initplan`: 60 políticas afectadas.
--
-- Envolver la llamada en una subconsulta escalar —`(select auth.uid())`— la
-- convierte en un InitPlan: Postgres la calcula una vez y reusa el resultado.
--
-- NO CAMBIA QUIÉN VE QUÉ. Una subconsulta escalar sobre una función sin
-- argumentos devuelve exactamente el mismo valor que la llamada directa.
-- Cambia cuántas veces se calcula, no qué se calcula.
--
-- Ver docs/specs/2026-09-10-rls-initplan/ (DEC-RLS-01..05).

do $$
declare
  r record;
  nuevo_qual text;
  nuevo_check text;
  reescritas int := 0;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
    order by tablename, policyname
  loop
    nuevo_qual := r.qual;
    nuevo_check := r.with_check;

    -- Sólo funciones SIN argumentos: su resultado no depende de la fila, así
    -- que el planificador puede izarlas. `can_operate_project(project_id)` y
    -- `company_is_active(company_id)` reciben una columna y quedan como están
    -- a propósito — envolverlas no ganaría nada (DEC-RLS-02).
    if nuevo_qual is not null then
      nuevo_qual := regexp_replace(nuevo_qual, 'auth\.uid\(\)', '(select auth.uid())', 'g');
      nuevo_qual := regexp_replace(nuevo_qual, 'auth_role\(\)', '(select auth_role())', 'g');
      nuevo_qual := regexp_replace(nuevo_qual, 'auth_company\(\)', '(select auth_company())', 'g');
    end if;

    if nuevo_check is not null then
      nuevo_check := regexp_replace(nuevo_check, 'auth\.uid\(\)', '(select auth.uid())', 'g');
      nuevo_check := regexp_replace(nuevo_check, 'auth_role\(\)', '(select auth_role())', 'g');
      nuevo_check := regexp_replace(nuevo_check, 'auth_company\(\)', '(select auth_company())', 'g');
    end if;

    -- Idempotente: si no hay nada que sustituir, no se toca la política. Una
    -- segunda corrida no hace nada, porque ya no quedan llamadas directas.
    if nuevo_qual is distinct from r.qual
       or nuevo_check is distinct from r.with_check then
      execute format(
        'alter policy %I on %I.%I%s%s',
        r.policyname, r.schemaname, r.tablename,
        case when nuevo_qual is not null
             then format(' using (%s)', nuevo_qual) else '' end,
        case when nuevo_check is not null
             then format(' with check (%s)', nuevo_check) else '' end
      );
      reescritas := reescritas + 1;
    end if;
  end loop;

  raise notice 'Políticas reescritas: %', reescritas;
end;
$$;

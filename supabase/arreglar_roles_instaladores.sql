-- ============================================================================
-- Arreglo de una sola pasada: instalador1 e instalador2 vuelven a ser
-- instaladores activos.
-- ============================================================================
-- Correr TODO el archivo de una en el SQL Editor de Supabase (Run directo,
-- sin seleccionar partes). Es idempotente: correrlo dos veces no hace daño.
--
-- Por qué existe: esas dos cuentas quedaron con rol 'coordinator' al probar el
-- botón "Ascender", y el coordinador es un usuario del área EMPRESA por diseño.
-- Por eso al loguearse ven el panel de empresa. Esto las devuelve a installer.
-- ============================================================================

do $$
declare
  objetivo text[] := array['instalador1@demo.dev', 'instalador2@demo.dev'];
  v_company uuid;
  filas integer;
begin
  -- La empresa a la que pertenecen: la del gerente demo.
  select p.company_id into v_company
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email = 'gerente@demo.dev';

  if v_company is null then
    raise exception 'No se encontró la empresa del gerente demo';
  end if;

  -- El trigger anti-escalación sólo deja cambiar roles a service_role.
  -- Lo declaramos para esta transacción, nada queda abierto después.
  perform set_config('request.jwt.claim.role', 'service_role', true);

  -- 1. Rol de vuelta a instalador.
  update public.profiles p
  set role = 'installer', company_id = null
  from auth.users u
  where p.id = u.id
    and u.email = any (objetivo);
  get diagnostics filas = row_count;
  raise notice 'Perfiles actualizados: %', filas;

  -- 2. Ficha de instalador (por si a alguno se la borró la limpieza).
  insert into public.installers (id)
  select u.id from auth.users u where u.email = any (objetivo)
  on conflict (id) do nothing;

  -- 3. Activos en el roster de la empresa demo.
  insert into public.company_installers (company_id, installer_id, status, joined_at)
  select v_company, u.id, 'active', now()
  from auth.users u
  where u.email = any (objetivo)
  on conflict (company_id, installer_id)
    do update set status = 'active', joined_at = coalesce(company_installers.joined_at, now());

  -- 4. Si algún proyecto los tenía como coordinadores, queda sin responsable.
  update public.projects pr
  set coordinator_id = null
  where pr.coordinator_id in (
    select u.id from auth.users u where u.email = any (objetivo)
  );
end $$;

-- Resultado final: esto es lo que tiene que verse.
-- Esperado: ambos con role = 'installer', roster = 'active', ficha = true.
select
  u.email,
  p.role,
  ci.status          as roster,
  (i.id is not null) as ficha_instalador,
  c.name             as empresa
from auth.users u
left join public.profiles p            on p.id = u.id
left join public.installers i          on i.id = u.id
left join public.company_installers ci on ci.installer_id = u.id
left join public.companies c           on c.id = ci.company_id
where u.email in ('instalador1@demo.dev', 'instalador2@demo.dev')
order by u.email;

-- ============================================================================
-- Limpieza de usuarios — dejar 1 gerente de empresa + 2 instaladores
-- ============================================================================
-- Correr en el SQL Editor de Supabase, UN PASO A LA VEZ (seleccionar el bloque
-- y ejecutar solo eso). Desactivar antes la traducción automática de Chrome.
--
-- OJO: esto corre contra la base de PRODUCCIÓN. El paso 2 es irreversible.
--
-- NOTA: no se usan tablas temporales a propósito. El SQL Editor confirma cada
-- sentencia por separado, así que una temp table se destruye antes de que la
-- siguiente sentencia pueda usarla. Por eso la lista va dentro de un bloque DO,
-- que el editor manda como una sola sentencia.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 0 — Mirar qué hay antes de tocar nada. Solo lectura.
-- ────────────────────────────────────────────────────────────────────────────

select
  u.email,
  p.role,
  p.full_name,
  c.name  as empresa,
  u.created_at,
  u.last_sign_in_at
from auth.users u
left join public.profiles  p on p.id = u.id
left join public.companies c on c.id = p.company_id
order by p.role nulls first, u.email;


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 1 — Ver qué se va a llevar puesto el borrado. Solo lectura.
-- ────────────────────────────────────────────────────────────────────────────
-- Las órdenes NO se borran: quedan sin instalador asignado y sin autor.

with a_borrar as (
  select u.id
  from auth.users u
  where coalesce(u.email, '') <> all (array[
    'admin@instalapro.dev',      -- platform_admin: conservado
    'gerente@demo.dev',
    'instalador1@demo.dev',
    'instalador2@demo.dev'
  ])
)
select
  (select count(*) from a_borrar)                                                             as usuarios_a_borrar,
  (select count(*) from public.installers    where id                    in (select id from a_borrar)) as fichas_instalador,
  (select count(*) from public.ratings       where installer_id          in (select id from a_borrar)) as calificaciones,
  (select count(*) from public.work_orders   where assigned_installer_id in (select id from a_borrar)) as ordenes_que_quedan_sin_asignar,
  (select count(*) from public.work_orders   where created_by            in (select id from a_borrar)) as ordenes_que_quedan_sin_autor,
  (select count(*) from public.notifications where user_id               in (select id from a_borrar)) as notificaciones;


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 2 — El borrado. Esto sí modifica. Seleccionar TODO el bloque DO.
-- ────────────────────────────────────────────────────────────────────────────
-- Un bloque DO es una sola sentencia: corre entero o no corre nada.
-- La lista de usuarios a conservar se escribe UNA sola vez, acá abajo.

do $$
declare
  conservar text[] := array[
    'admin@instalapro.dev',   -- ⚠️ platform_admin: sacalo de la lista solo si
                              --    querés perder el acceso al tablero maestro
    'gerente@demo.dev',       -- el gerente de empresa que queda
    'instalador1@demo.dev',   -- instalador 1
    'instalador2@demo.dev'    -- instalador 2
  ];
  borrados integer;
begin
  -- 2.a — Soltar la referencia que impide el borrado.
  --       work_orders.created_by apunta a profiles SIN "on delete", así que el
  --       delete falla con violación de FK si no se limpia primero.
  update public.work_orders wo
  set created_by = null
  where wo.created_by is not null
    and exists (
      select 1
      from auth.users u
      where u.id = wo.created_by
        and coalesce(u.email, '') <> all (conservar)
    );

  -- 2.b — Borrar los usuarios. El resto cae solo por cascada:
  --       profiles → installers → company_installers, ratings,
  --       broadcast_applications, notificaciones, mensajes, suscripciones push.
  --       Las órdenes sobreviven, con assigned_installer_id en null.
  delete from auth.users u
  where coalesce(u.email, '') <> all (conservar);

  get diagnostics borrados = row_count;
  raise notice 'Usuarios borrados: %', borrados;
end $$;


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 3 — Limpiar invitaciones colgadas (opcional pero recomendado)
-- ────────────────────────────────────────────────────────────────────────────

delete from public.invitations
where status = 'pending';


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 4 — Verificar que quedó como esperabas. Solo lectura.
-- ────────────────────────────────────────────────────────────────────────────
-- Esperado: 1 platform_admin, 1 company_manager, 2 installer.

select p.role, count(*) as cantidad
from public.profiles p
group by p.role
order by p.role;

select
  u.email,
  p.role,
  p.full_name,
  c.name as empresa,
  ci.status as estado_en_roster
from auth.users u
left join public.profiles p            on p.id = u.id
left join public.companies c           on c.id = p.company_id
left join public.company_installers ci on ci.installer_id = u.id
order by p.role, u.email;


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 5 — Reparar el roster si hiciera falta
-- ────────────────────────────────────────────────────────────────────────────
-- Solo si en el paso 4 alguno de los dos instaladores aparece con
-- estado_en_roster distinto de 'active' o en null.

update public.company_installers ci
set status = 'active'
from auth.users u
where ci.installer_id = u.id
  and u.email in ('instalador1@demo.dev', 'instalador2@demo.dev');

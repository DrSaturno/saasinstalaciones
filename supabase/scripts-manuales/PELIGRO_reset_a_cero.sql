-- ############################################################################
-- ##  GUARDA DE EJECUCION - NO BORRAR ESTE BLOQUE                           ##
-- ############################################################################
-- Este script DESTRUYE DATOS y NO SE PUEDE DESHACER.
--
-- Contexto que importa: hoy la organizacion de Supabase esta en plan `free`,
-- que NO provee backups restaurables ni PITR. Si esto corre por error, los
-- datos NO se recuperan. Ver docs/BACKUP_AND_RESTORE.md
--
-- Para ejecutarlo, a conciencia:
--   1. Confirma a que proyecto estas conectado. Leelo dos veces.
--   2. Toma un respaldo manual antes.
--   3. Recien ahi, comenta la linea `raise exception` de abajo.
--
-- Mientras esa linea siga activa, correr el archivo entero aborta sin tocar nada.
do $$
begin
  raise exception 'BLOQUEADO: lee el encabezado de este archivo antes de ejecutarlo.';
end $$;
-- ############################################################################

-- ============================================================================
-- RESET A CERO — deja solo el perfil maestro y 1 perfil empresa
-- ============================================================================
-- ⚠️ ESTO BORRA DATOS DE PRODUCCIÓN Y NO SE PUEDE DESHACER. ⚠️
--
-- Qué queda:
--   * admin@instalapro.dev  (platform_admin)
--   * gerente@demo.dev      (company_manager) y SU empresa
--
-- Qué se borra:
--   * Todos los demás usuarios (instaladores, coordinadores, otros gerentes)
--   * Todos los proyectos, locaciones, órdenes, historial y adjuntos
--   * Clientes, incidencias, calificaciones, bolsa y postulaciones
--   * Mensajería completa, anuncios, notificaciones, invitaciones
--   * Las demás empresas, si hubiera
--
-- Qué NO se toca: la empresa del gerente (su nombre, prefijo y numeración),
-- los buckets de Storage (los archivos huérfanos quedan; no molestan).
--
-- Correr TODO el archivo de una en el SQL Editor (Run directo).
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 1 — Ver qué se va a borrar, ANTES de borrar. Solo lectura.
-- ────────────────────────────────────────────────────────────────────────────
-- Corré SOLO este bloque primero si querés confirmar el alcance.

select 'usuarios que se borran' as concepto, count(*) as cantidad
from auth.users
where coalesce(email, '') not in ('admin@instalapro.dev', 'gerente@demo.dev')
union all select 'proyectos', count(*) from public.projects
union all select 'locaciones', count(*) from public.sites
union all select 'órdenes', count(*) from public.work_orders
union all select 'clientes', count(*) from public.clients
union all select 'mensajes', count(*) from public.chat_messages;


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 2 — El reset.
-- ────────────────────────────────────────────────────────────────────────────
-- Un bloque DO: corre entero o no corre nada.
-- El orden importa menos de lo habitual porque casi todo cae por cascada desde
-- projects y companies, pero se hace explícito para que se entienda qué pasa.

do $$
declare
  conservar text[] := array['admin@instalapro.dev', 'gerente@demo.dev'];
  v_company uuid;
  v_gerente uuid;
  n integer;
begin
  select p.id, p.company_id into v_gerente, v_company
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email = 'gerente@demo.dev';

  if v_gerente is null then
    raise exception 'No existe gerente@demo.dev — abortado para no dejar la base sin empresa';
  end if;
  if v_company is null then
    raise exception 'El gerente no tiene empresa asignada — abortado';
  end if;

  raise notice 'Conservando gerente % de la empresa %', v_gerente, v_company;

  -- 1. Operación: se borra todo, de la hoja hacia la raíz.
  delete from public.calendar_order_events;
  delete from public.order_updates;
  delete from public.order_incidents;
  delete from public.order_attachments;
  delete from public.ratings;
  delete from public.work_orders;
  delete from public.site_attachments;
  delete from public.sites;
  delete from public.projects;
  delete from public.clients;
  delete from public.order_sequences;

  -- 2. Bolsa de trabajo.
  delete from public.broadcast_applications;
  delete from public.broadcasts;

  -- 3. Mensajería y comunicación.
  delete from public.chat_message_reads;
  delete from public.chat_messages;
  delete from public.chat_threads;
  delete from public.announcements;
  delete from public.notifications;
  delete from public.push_subscriptions;
  delete from public.invitations;

  -- 4. Equipo: nadie queda en el roster.
  delete from public.installer_unavailability;
  delete from public.installer_weekly_availability;
  delete from public.company_installers;
  delete from public.installers;

  -- 5. Integraciones del gerente (se vuelven a vincular si hacen falta).
  delete from public.calendar_connections;

  -- 6. Usuarios. El resto de sus datos ya cayó arriba; profiles cae en cascada
  --    desde auth.users.
  delete from auth.users u
  where not exists (
    select 1 from unnest(conservar) k where k = u.email
  );
  get diagnostics n = row_count;
  raise notice 'Usuarios borrados: %', n;

  -- 7. Empresas ajenas, si quedara alguna.
  delete from public.companies where id <> v_company;
  get diagnostics n = row_count;
  raise notice 'Empresas borradas: %', n;

  -- 8. La numeración de órdenes vuelve a empezar.
  update public.companies set order_seq = 0 where id = v_company;
end $$;


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 3 — Verificar. Esperado: 2 usuarios, 1 empresa, todo lo demás en 0.
-- ────────────────────────────────────────────────────────────────────────────

select 'usuarios' as tabla, count(*) as filas from auth.users
union all select 'empresas', count(*) from public.companies
union all select 'perfiles', count(*) from public.profiles
union all select 'proyectos', count(*) from public.projects
union all select 'locaciones', count(*) from public.sites
union all select 'órdenes', count(*) from public.work_orders
union all select 'clientes', count(*) from public.clients
union all select 'instaladores', count(*) from public.installers
union all select 'mensajes', count(*) from public.chat_messages
union all select 'notificaciones', count(*) from public.notifications;

select u.email, p.role, c.name as empresa
from auth.users u
left join public.profiles p  on p.id = u.id
left join public.companies c on c.id = p.company_id
order by p.role;

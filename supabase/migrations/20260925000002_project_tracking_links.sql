-- Bloque 7 (docs/specs/2026-09-24-link-cliente): link público de
-- seguimiento para el cliente final. Primera superficie de la app que
-- expone datos sin sesión (aparte de `invitation_preview`, que no muestra
-- nada operativo). Ver design.md para el porqué de cada decisión.

-- ---------------------------------------------------------------------------
-- 1. La tabla: un solo link activo por proyecto
-- ---------------------------------------------------------------------------

create table public.project_tracking_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid not null,
  token uuid not null unique default gen_random_uuid(),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  constraint project_tracking_links_project_company_fk
    foreign key (project_id, company_id)
    references public.projects (id, company_id) on delete cascade,
  constraint project_tracking_links_revoked_shape_check check (
    (revoked_at is null and revoked_by is null)
    or (revoked_at is not null)
  )
);

comment on table public.project_tracking_links is
  'Links públicos de seguimiento para el cliente final. Bloque 7, docs/specs/2026-09-24-link-cliente.';

-- Nunca dos links activos a la vez: generar uno nuevo revoca el anterior en
-- la misma función (`rotate_project_tracking_link`), nunca coexisten.
create unique index project_tracking_links_one_active_idx
  on public.project_tracking_links (project_id)
  where revoked_at is null;

create index project_tracking_links_token_idx
  on public.project_tracking_links (token);

alter table public.project_tracking_links enable row level security;

revoke all on public.project_tracking_links from anon;
grant select on public.project_tracking_links to authenticated;

-- Sólo lectura para `authenticated`: crear y revocar pasan por las funciones
-- de abajo (`security definer`), no por INSERT/UPDATE directo — así el "un
-- solo activo por proyecto" no depende de que la aplicación se acuerde de
-- revocar antes de crear.
create policy project_tracking_links_operator_read on public.project_tracking_links
  for select to authenticated
  using (public.can_operate_project(project_id));

-- ---------------------------------------------------------------------------
-- 2. Generar y revocar (lado empresa)
-- ---------------------------------------------------------------------------

-- Devuelve el TOKEN, no el id de la fila: es lo único que el llamador
-- necesita para armar la URL que le manda al cliente, y ahorra una segunda
-- ida y vuelta (leer la fila recién creada) que de otro modo haría falta.
create or replace function public.rotate_project_tracking_link(p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_company_id uuid;
  v_new_token uuid;
begin
  if auth.uid() is null then
    raise exception 'ACCESS_DENIED';
  end if;

  select company_id into v_company_id from public.projects where id = p_project_id;
  if not found or not public.can_operate_project(p_project_id) then
    raise exception 'ACCESS_DENIED';
  end if;

  update public.project_tracking_links
  set revoked_at = now(), revoked_by = auth.uid()
  where project_id = p_project_id and revoked_at is null;

  insert into public.project_tracking_links (company_id, project_id, created_by)
  values (v_company_id, p_project_id, auth.uid())
  returning token into v_new_token;

  return v_new_token;
end;
$fn$;

revoke all on function public.rotate_project_tracking_link(uuid) from public, anon;
grant execute on function public.rotate_project_tracking_link(uuid) to authenticated;

create or replace function public.revoke_project_tracking_link(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if auth.uid() is null then
    raise exception 'ACCESS_DENIED';
  end if;
  if not public.can_operate_project(p_project_id) then
    raise exception 'ACCESS_DENIED';
  end if;

  update public.project_tracking_links
  set revoked_at = now(), revoked_by = auth.uid()
  where project_id = p_project_id and revoked_at is null;
end;
$fn$;

revoke all on function public.revoke_project_tracking_link(uuid) from public, anon;
grant execute on function public.revoke_project_tracking_link(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Lo que ve el cliente: una sola función, mínima
-- ---------------------------------------------------------------------------

create or replace function public.project_tracking_snapshot(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_link record;
  v_project record;
  v_milestones jsonb;
  v_photos jsonb;
  v_done integer;
  v_total integer;
begin
  select ptl.project_id, ptl.revoked_at, c.status as company_status
  into v_link
  from public.project_tracking_links ptl
  join public.companies c on c.id = ptl.company_id
  where ptl.token = p_token;

  -- Token inexistente, revocado, o empresa suspendida: la misma respuesta
  -- para los tres casos, para no convertir esto en un oráculo (LINKCLI-R2.6).
  if not found or v_link.revoked_at is not null or v_link.company_status <> 'active' then
    return jsonb_build_object('valid', false);
  end if;

  select p.name, p.client_name, p.status into v_project
  from public.projects p where p.id = v_link.project_id;

  select
    count(*) filter (where w.status = 'finalizada'),
    count(*)
  into v_done, v_total
  from public.work_orders w
  where w.project_id = v_link.project_id and w.status <> 'cancelada';

  -- Hitos: por sitio y orden, sin nombre de instalador ni dirección. Tope de
  -- 200 para que un proyecto de miles de puntos no devuelva un JSON enorme;
  -- lo más reciente primero es lo que le importa a quien mira su progreso.
  select coalesce(jsonb_agg(jsonb_build_object(
    'site', m.site, 'title', m.title, 'status', m.status, 'date', m.date
  ) order by m.sort_date desc nulls last), '[]'::jsonb)
  into v_milestones
  from (
    select
      s.name as site,
      w.title,
      w.status,
      coalesce(w.finalized_at::date, w.scheduled_date) as date,
      coalesce(w.finalized_at, w.scheduled_date::timestamptz) as sort_date
    from public.work_orders w
    join public.sites s on s.id = w.site_id
    where w.project_id = v_link.project_id and w.status <> 'cancelada'
    order by sort_date desc nulls last
    limit 200
  ) m;

  -- Fotos aprobadas: de `order_updates.photos`, sólo de órdenes ya
  -- finalizadas (la única aprobación que existe hoy para una orden completa,
  -- vía `reviewOrderDelivery` → `approve`). Tope de 30 rutas distintas.
  select coalesce(jsonb_agg(capped.photo), '[]'::jsonb)
  into v_photos
  from (
    select distinct photo
    from public.work_orders w
    join public.order_updates u on u.order_id = w.id
    cross join lateral jsonb_array_elements_text(u.photos) as photo
    where w.project_id = v_link.project_id and w.status = 'finalizada'
    limit 30
  ) capped;

  return jsonb_build_object(
    'valid', true,
    'projectName', v_project.name,
    'clientName', v_project.client_name,
    'status', v_project.status,
    'completionPct', case when v_total > 0 then round(v_done * 100.0 / v_total) else 0 end,
    -- Conteos SIN el tope de 200 de `milestones` (abajo): un proyecto de
    -- miles de puntos tiene que mostrar la torta correcta aunque la lista de
    -- hitos esté recortada. Nunca derivar el avance de `milestones.length`.
    'doneCount', v_done,
    'totalCount', v_total,
    'milestones', v_milestones,
    'photoPaths', v_photos
  );
end;
$fn$;

-- Dos pasos a propósito: `revoke ... from public, anon` primero, después el
-- `grant` explícito. `revoke ... from public` sólo NO alcanza para bloquear
-- `anon` en este proyecto (se comprobó en el bloque 5) — acá es al revés, se
-- necesita que `anon` SÍ pueda, pero el mismo patrón se respeta por
-- consistencia y por si el default cambia.
revoke all on function public.project_tracking_snapshot(uuid) from public, anon;
grant execute on function public.project_tracking_snapshot(uuid) to anon, authenticated;

comment on function public.project_tracking_snapshot(uuid) is
  'Pública a propósito (bloque 7): el cliente final no tiene cuenta. Keyed por un token UUID no adivinable; nunca expone importes, nombres de instalador ni teléfonos. Espejo de invitation_preview.';

-- ---------------------------------------------------------------------------
-- 4. Firmar las fotos: política nueva sobre storage.objects
-- ---------------------------------------------------------------------------

-- `anon` no tiene grant directo sobre `work_orders`/`project_tracking_links`/
-- `companies` (están cerradas desde el arranque del proyecto): una policy de
-- storage con una subquery cruda contra esas tablas le fallaría a `anon` por
-- falta de permiso ANTES de llegar a evaluar la condición. Mismo patrón que
-- `can_operate_project`/`auth_is_order_helper`: un helper `security definer`
-- que sí puede leerlas, y la policy sólo lo llama.
--
-- No filtra por token específico —RLS no puede leer un valor de la request
-- que no sea auth.*—, filtra por "el proyecto de esta orden tiene un link
-- activo", que por el índice de la sección 1 es siempre cero o uno: revocar
-- el único link activo de un proyecto corta el acceso a sus fotos igual que
-- si filtrara por token.
create or replace function public.storage_path_has_active_tracking_link(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.work_orders w
    join public.project_tracking_links ptl on ptl.project_id = w.project_id
    join public.companies c on c.id = ptl.company_id
    where w.id = p_order_id
      and w.status = 'finalizada'
      and ptl.revoked_at is null
      and c.status = 'active'
  )
$$;

-- Acá al revés que el resto del proyecto: SÍ hace falta que `anon` pueda —
-- es quien evalúa la policy de storage sin sesión.
revoke all on function public.storage_path_has_active_tracking_link(uuid) from public;
grant execute on function public.storage_path_has_active_tracking_link(uuid) to anon, authenticated;

create policy evidence_public_tracking_read on storage.objects
  for select to anon
  using (
    bucket_id = 'evidence'
    and public.storage_path_has_active_tracking_link(((storage.foldername(name))[2])::uuid)
  );

-- Punto 23: público combinable, conteo previo y fan-out idempotente.
--
-- Hasta acá la audiencia era `audience_type` (un enum de UN valor:
-- all/zone/project) más un `audience_ref` de texto. Con esa forma es
-- imposible expresar "Buenos Aires + disponibles": no es que falte un valor
-- del enum, es que el modelo no admite combinar.
--
-- Las columnas viejas SE CONSERVAN y se siguen escribiendo. El historial ya
-- publicado las lee, y reescribir el pasado para que se parezca al modelo
-- nuevo sería falsear a quién se le mandó qué.
alter table public.announcements
  add column if not exists audience jsonb not null default '{}'::jsonb;

comment on column public.announcements.audience is
  'Criterios combinables: {zones:[], projectIds:[], availableOnly:bool}. Vacío = todo el roster activo.';

-- ---------------------------------------------------------------------------
-- Una sola definición de "quién lo recibe"
-- ---------------------------------------------------------------------------

-- El preview y el envío tienen que ser la MISMA consulta (REQ-13.4): un
-- conteo que se calcula distinto que el fan-out es una promesa que se rompe
-- sola en cuanto alguien toca uno de los dos.
--
-- Arranca siempre del roster activo de la empresa y sólo puede achicar desde
-- ahí — ningún criterio nuevo puede sacar destinatarios de otro tenant
-- (AC-13-C).
create or replace function public.announcement_audience(
  p_company uuid,
  p_audience jsonb
)
returns table (installer_id uuid)
language sql
stable
security definer
set search_path = public
as $fn$
  with criterios as (
    select
      coalesce(array(select jsonb_array_elements_text(p_audience -> 'zones')), '{}')::text[] as zones,
      coalesce(array(select jsonb_array_elements_text(p_audience -> 'projectIds')), '{}')::text[] as project_ids,
      coalesce((p_audience ->> 'availableOnly')::boolean, false) as available_only
  )
  select distinct ci.installer_id
  from public.company_installers ci
  cross join criterios c
  where ci.company_id = p_company
    and ci.status = 'active'
    -- Provincias: el instalador cubre alguna de las elegidas.
    and (
      cardinality(c.zones) = 0
      or exists (
        select 1 from public.installers i
        where i.id = ci.installer_id and i.zones && c.zones
      )
    )
    -- Proyectos: tiene trabajo vivo en alguno de los elegidos.
    and (
      cardinality(c.project_ids) = 0
      or exists (
        select 1 from public.work_orders w
        where w.assigned_installer_id = ci.installer_id
          and w.project_id = any(c.project_ids::uuid[])
          and w.status not in ('finalizada', 'cancelada')
      )
    )
    -- Disponibilidad: el interruptor propio en verde y ninguna ausencia
    -- aprobada vigente, ni de esta empresa ni global. Es la misma noción de
    -- "hoy puede trabajar" que ya usa la agenda; no se inventa otra.
    and (
      not c.available_only
      or (
        exists (
          select 1 from public.installers i
          where i.id = ci.installer_id and i.available
        )
        and not exists (
          select 1 from public.installer_unavailability u
          where u.installer_id = ci.installer_id
            and u.company_id = p_company
            and u.status = 'approved'
            and u.starts_at <= now() and u.ends_at >= now()
        )
        and not exists (
          select 1 from public.installer_global_unavailability g
          where g.installer_id = ci.installer_id
            and g.status = 'approved'
            and g.starts_at <= now() and g.ends_at >= now()
        )
      )
    );
$fn$;

revoke all on function public.announcement_audience(uuid, jsonb) from public;

-- El conteo del preview: la misma función de arriba, contada. Sólo puede
-- preguntarlo un operador de su propia empresa.
create or replace function public.announcement_audience_count(p_audience jsonb)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_company uuid := public.auth_company();
  v_count integer;
begin
  if public.auth_role() <> 'company_manager' or v_company is null then
    raise exception 'Acceso denegado';
  end if;
  select count(*) into v_count
  from public.announcement_audience(v_company, p_audience);
  return v_count;
end;
$fn$;

revoke all on function public.announcement_audience_count(jsonb) from public;
grant execute on function public.announcement_audience_count(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- El fan-out, ahora combinable e idempotente
-- ---------------------------------------------------------------------------

-- Cambios respecto de la versión anterior:
--   1. Recibe `p_audience` (criterios combinables) en vez de tipo+ref.
--   2. Usa `announcement_audience()` — la misma consulta del preview.
--   3. Escribe `dedupe_key`, así republicar no duplica la bandeja de nadie
--      (AC-13-B). El índice único parcial ya existía desde
--      `20260805000004`; hasta ahora los anuncios no lo usaban.
--
-- Lo que NO cambia: sigue sin tocar `broadcasts`, `broadcast_applications`
-- ni `work_orders`. Un comunicado no crea una oferta ni compromete a nadie
-- (REQ-13.6) — es la línea que separa esto de la bolsa de trabajo.
create or replace function public.publish_announcement(
  p_title text,
  p_body text,
  p_severity text default 'info',
  p_audience jsonb default '{}'::jsonb
)
returns table (announcement_id uuid, recipients integer)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_company uuid := public.auth_company();
  v_id uuid;
  v_count integer := 0;
  v_zones text[] := coalesce(array(select jsonb_array_elements_text(p_audience -> 'zones')), '{}');
  v_projects text[] := coalesce(array(select jsonb_array_elements_text(p_audience -> 'projectIds')), '{}');
  v_legacy_type text;
  v_legacy_ref text;
begin
  if public.auth_role() <> 'company_manager' or v_company is null then
    raise exception 'Acceso denegado';
  end if;
  if p_severity not in ('info', 'warning', 'critical') then
    raise exception 'Prioridad inválida';
  end if;

  -- Las columnas viejas siguen reflejando lo más parecido posible, para que
  -- el historial existente no quede con huecos. Con criterios combinados no
  -- hay un único `audience_type` honesto: se marca 'all' y el detalle real
  -- vive en `audience`.
  v_legacy_type := case
    when cardinality(v_zones) = 1 and cardinality(v_projects) = 0 then 'zone'
    when cardinality(v_projects) = 1 and cardinality(v_zones) = 0 then 'project'
    else 'all'
  end;
  v_legacy_ref := case
    when v_legacy_type = 'zone' then v_zones[1]
    when v_legacy_type = 'project' then v_projects[1]
    else ''
  end;

  insert into public.announcements (
    company_id, created_by, title, body, severity,
    audience_type, audience_ref, audience
  )
  values (
    v_company, auth.uid(), trim(p_title), trim(p_body), p_severity,
    v_legacy_type, v_legacy_ref, coalesce(p_audience, '{}'::jsonb)
  )
  returning id into v_id;

  with insertadas as (
    insert into public.notifications (user_id, type, title, body, data, dedupe_key)
    select
      a.installer_id,
      'announcement',
      case when p.locale = 'pt' then 'Comunicado da empresa' else 'Comunicado de la empresa' end,
      left(trim(p_title), 180),
      jsonb_build_object(
        'url', '/home#anuncio-' || v_id,
        'announcement_id', v_id,
        'company_id', v_company,
        'severity', p_severity,
        'locale', p.locale
      ),
      'announcement:' || v_id || ':' || a.installer_id
    from public.announcement_audience(v_company, coalesce(p_audience, '{}'::jsonb)) a
    join public.profiles p on p.id = a.installer_id
    -- El índice único de `dedupe_key` es PARCIAL (`where dedupe_key is not
    -- null`), así que el `on conflict` tiene que repetir ese predicado o
    -- Postgres no encuentra el índice que lo respalda.
    on conflict (dedupe_key) where dedupe_key is not null do nothing
    returning 1
  )
  select count(*) into v_count from insertadas;

  update public.announcements set recipients = v_count where id = v_id;

  announcement_id := v_id;
  recipients := v_count;
  return next;
end;
$fn$;

revoke all on function public.publish_announcement(text, text, text, jsonb) from public;
grant execute on function public.publish_announcement(text, text, text, jsonb) to authenticated;

-- La firma vieja de 5 parámetros de texto queda dropeada: dejar las dos
-- overloaded confunde a PostgREST sobre cuál resolver.
drop function if exists public.publish_announcement(text, text, text, text, text);

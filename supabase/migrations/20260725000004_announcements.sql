-- Anuncios de la empresa a sus instaladores, con público filtrable.
-- Reusa la bandeja `notifications` (y con ella Web Push) en vez de crear un
-- canal nuevo. Idempotente.

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  title text not null check (char_length(trim(title)) between 2 and 120),
  body text not null check (char_length(trim(body)) between 2 and 2000),
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  audience_type text not null default 'all' check (audience_type in ('all', 'zone', 'project')),
  audience_ref text not null default '',
  recipients integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists announcements_company_recent_idx
  on public.announcements (company_id, created_at desc);

alter table public.announcements enable row level security;

-- La empresa (manager y coordinador) gestiona sus anuncios.
drop policy if exists announcements_company_all on public.announcements;
create policy announcements_company_all on public.announcements
  for all
  using (
    public.auth_role() in ('company_manager', 'coordinator')
    and company_id = public.auth_company()
  )
  with check (
    public.auth_role() in ('company_manager', 'coordinator')
    and company_id = public.auth_company()
  );

-- El instalador lee los de las empresas donde trabaja (el detalle del anuncio
-- ya le llegó por notificación; esto habilita una vista de historial).
drop policy if exists announcements_installer_read on public.announcements;
create policy announcements_installer_read on public.announcements
  for select using (
    exists (
      select 1 from public.company_installers ci
      where ci.company_id = announcements.company_id
        and ci.installer_id = auth.uid()
        and ci.status = 'active'
    )
  );

/**
 * Publica un anuncio y lo reparte a la bandeja de los destinatarios.
 *
 * Público:
 *   all     -> todo el roster activo de la empresa
 *   zone    -> los del roster que cubren esa provincia (installers.zones)
 *   project -> los que tienen órdenes vivas en ese proyecto
 *
 * El título de la notificación se localiza según profiles.locale; el contenido
 * escrito por la empresa se respeta tal cual. Devuelve a cuántos llegó.
 */
create or replace function public.publish_announcement(
  p_title text,
  p_body text,
  p_severity text default 'info',
  p_audience_type text default 'all',
  p_audience_ref text default ''
)
returns table (announcement_id uuid, recipients integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.auth_company();
  v_id uuid;
  v_count integer := 0;
begin
  if public.auth_role() not in ('company_manager', 'coordinator') or v_company is null then
    raise exception 'Acceso denegado';
  end if;
  if p_audience_type not in ('all', 'zone', 'project') then
    raise exception 'Público inválido';
  end if;
  if p_audience_type <> 'all' and coalesce(trim(p_audience_ref), '') = '' then
    raise exception 'Falta indicar el público';
  end if;
  -- Un coordinador sólo puede dirigirse a proyectos que conduce.
  if p_audience_type = 'project'
     and public.auth_role() = 'coordinator'
     and not public.can_operate_project(p_audience_ref::uuid) then
    raise exception 'Acceso denegado';
  end if;

  insert into public.announcements (company_id, created_by, title, body, severity, audience_type, audience_ref)
  values (v_company, auth.uid(), trim(p_title), trim(p_body), p_severity, p_audience_type, coalesce(trim(p_audience_ref), ''))
  returning id into v_id;

  with destinatarios as (
    select distinct ci.installer_id as id
    from public.company_installers ci
    where ci.company_id = v_company
      and ci.status = 'active'
      and (
        p_audience_type = 'all'
        or (
          p_audience_type = 'zone'
          and exists (
            select 1 from public.installers i
            where i.id = ci.installer_id and trim(p_audience_ref) = any(i.zones)
          )
        )
        or (
          p_audience_type = 'project'
          and exists (
            select 1 from public.work_orders w
            where w.project_id = p_audience_ref::uuid
              and w.assigned_installer_id = ci.installer_id
              and w.status not in ('finalizada', 'cancelada')
          )
        )
      )
  ), insertadas as (
    insert into public.notifications (user_id, type, title, body, data)
    select
      d.id,
      'announcement',
      case
        when p.locale = 'pt' then 'Comunicado da empresa'
        else 'Comunicado de la empresa'
      end,
      left(trim(p_title), 180),
      jsonb_build_object(
        'url', '/tasks',
        'announcement_id', v_id,
        'company_id', v_company,
        'severity', p_severity,
        'locale', p.locale
      )
    from destinatarios d
    join public.profiles p on p.id = d.id
    returning 1
  )
  select count(*) into v_count from insertadas;

  update public.announcements set recipients = v_count where id = v_id;

  announcement_id := v_id;
  recipients := v_count;
  return next;
end;
$$;

revoke all on function public.publish_announcement(text, text, text, text, text) from public;
grant execute on function public.publish_announcement(text, text, text, text, text) to authenticated;

/**
 * Emails de los destinatarios de un anuncio, para el envío por Resend.
 *
 * Los emails viven en auth.users y la app no puede usar service_role fuera del
 * tablero maestro, así que esta función vetada es la única vía: valida que quien
 * llama sea operador de la empresa dueña del anuncio y devuelve sólo los mails
 * de quienes efectivamente recibieron esa notificación.
 */
create or replace function public.announcement_recipient_emails(p_announcement_id uuid)
returns table (email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  select a.company_id into v_company
  from public.announcements a where a.id = p_announcement_id;
  if v_company is null then
    raise exception 'Anuncio inexistente';
  end if;
  if public.auth_role() not in ('company_manager', 'coordinator')
     or public.auth_company() is distinct from v_company then
    raise exception 'Acceso denegado';
  end if;

  return query
  select u.email::text
  from public.notifications n
  join auth.users u on u.id = n.user_id
  where n.type = 'announcement'
    and n.data ->> 'announcement_id' = p_announcement_id::text
    and u.email is not null;
end;
$$;

revoke all on function public.announcement_recipient_emails(uuid) from public;
grant execute on function public.announcement_recipient_emails(uuid) to authenticated;

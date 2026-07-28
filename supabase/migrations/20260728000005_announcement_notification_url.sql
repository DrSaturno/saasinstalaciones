-- La notificación de anuncio llevaba a /tasks, donde los anuncios NO se
-- muestran: viven en /home. Tocar el aviso no abría nada.
--
-- Además ahora sólo el gerente publica anuncios (el coordinador pasó al área
-- instalador), así que se saca esa rama del control de permisos.
--
-- Idempotente: se puede re-ejecutar sin daño.

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
  -- Sólo el gerente: los anuncios son comunicación de empresa.
  if public.auth_role() <> 'company_manager' or v_company is null then
    raise exception 'Acceso denegado';
  end if;
  if p_audience_type not in ('all', 'zone', 'project') then
    raise exception 'Público inválido';
  end if;
  if p_audience_type <> 'all' and coalesce(trim(p_audience_ref), '') = '' then
    raise exception 'Falta indicar el público';
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
        -- /home es donde se muestran los anuncios. El ancla resalta el aviso
        -- recién llegado.
        'url', '/home#anuncio-' || v_id,
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

-- Reapunta los avisos ya emitidos que quedaron colgados hacia /tasks.
update public.notifications
set data = jsonb_set(
  data,
  '{url}',
  to_jsonb('/home#anuncio-' || coalesce(data->>'announcement_id', ''))
)
where type = 'announcement'
  and data->>'url' = '/tasks'
  and data->>'announcement_id' is not null;

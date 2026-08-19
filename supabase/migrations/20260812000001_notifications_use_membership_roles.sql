-- R1-DB-02 — Los avisos dejan de leer el rol escalar.
--
-- `20260805000002` movió la autorización a `company_membership_roles`, pero
-- estos tres triggers quedaron comparando `company_installers.role` directo.
-- Hoy no están rotos porque el trigger `sync_legacy_company_membership_role`
-- mantiene la columna escalar como proyección preferente. El problema es que
-- esa proyección guarda UNA sola función: si alguien es coordinador e
-- instalador, la columna dice 'coordinator' y funciona por casualidad, no por
-- diseño. En cuanto el cutover elimine la columna, estos avisos dejan de
-- enviarse en silencio — que es la peor forma de fallar para una notificación.
--
-- El cambio es de fuente de verdad, no de comportamiento: se consulta la tabla
-- de capacidades. `company_installers.status` sigue gobernando si la membresía
-- está activa, porque eso vive en la membresía base y no en la capacidad.

create or replace function public.notify_broadcast_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_project_id uuid;
  v_title text;
  v_installer_name text;
begin
  select b.company_id, b.project_id, b.title
  into v_company_id, v_project_id, v_title
  from public.broadcasts b
  where b.id = new.broadcast_id;

  select p.full_name
  into v_installer_name
  from public.profiles p
  where p.id = new.installer_id;

  insert into public.notifications (user_id, type, title, body, data)
  select
    p.id,
    'application_received',
    case when p.locale = 'pt' then 'Nova candidatura'
         else 'Nueva postulación' end,
    case when p.locale = 'pt'
         then coalesce(v_installer_name, 'Um instalador') || ' se candidatou a ' || v_title
         else coalesce(v_installer_name, 'Un instalador') || ' se postuló a ' || v_title end,
    jsonb_build_object(
      'url',
      case
        when p.role = 'company_manager' and p.company_id = v_company_id
          then '/broadcasts'
        else '/coordination'
      end,
      'broadcast_id', new.broadcast_id,
      'installer_id', new.installer_id,
      'company_id', v_company_id,
      'locale', p.locale
    )
  from public.profiles p
  where (
    p.role = 'company_manager'
    and p.company_id = v_company_id
  ) or (
    v_project_id is not null
    and exists (
      select 1
      from public.projects pr
      join public.company_installers ci
        on ci.company_id = pr.company_id
       and ci.installer_id = pr.coordinator_id
       and ci.status = 'active'
      join public.company_membership_roles cmr
        on cmr.company_id = ci.company_id
       and cmr.user_id = ci.installer_id
       and cmr.role = 'coordinator'
      where pr.id = v_project_id
        and pr.company_id = v_company_id
        and pr.coordinator_id = p.id
    )
  );

  return new;
end;
$$;

create or replace function public.notify_order_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_number text;
  v_project_id uuid;
begin
  if new.installer_id is null then
    return new;
  end if;

  select w.order_number, w.project_id
  into v_order_number, v_project_id
  from public.work_orders w
  where w.id = new.order_id;

  insert into public.notifications (user_id, type, title, body, data)
  select
    p.id,
    'update_received',
    case when p.locale = 'pt'
         then 'Nova atualização de ' || coalesce(v_order_number, 'uma ordem')
         else 'Nuevo avance de ' || coalesce(v_order_number, 'una orden') end,
    left(
      coalesce(
        nullif(new.note, ''),
        case when p.locale = 'pt'
             then 'O instalador enviou uma atualização.'
             else 'El instalador cargó una actualización.' end
      ),
      180
    ),
    jsonb_build_object(
      'url',
      case
        when p.role = 'company_manager' and p.company_id = new.company_id
          then '/orders/' || new.order_id
        else '/coordination/' || new.order_id
      end,
      'order_id', new.order_id,
      'update_id', new.id,
      'installer_id', new.installer_id,
      'company_id', new.company_id,
      'locale', p.locale
    )
  from public.profiles p
  where (
    p.role = 'company_manager'
    and p.company_id = new.company_id
  ) or exists (
    select 1
    from public.projects pr
    join public.company_installers ci
      on ci.company_id = pr.company_id
     and ci.installer_id = pr.coordinator_id
     and ci.status = 'active'
    join public.company_membership_roles cmr
      on cmr.company_id = ci.company_id
     and cmr.user_id = ci.installer_id
     and cmr.role = 'coordinator'
    where pr.id = v_project_id
      and pr.company_id = new.company_id
      and pr.coordinator_id = p.id
  );

  return new;
end;
$$;

create or replace function public.notify_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_installer uuid;
  v_company uuid := new.company_id;
  v_sender_name text;
  v_company_name text;
  v_preview text;
begin
  select t.installer_id
  into v_installer
  from public.chat_threads t
  where t.id = new.thread_id;

  select p.full_name
  into v_sender_name
  from public.profiles p
  where p.id = new.sender_id;

  select c.name
  into v_company_name
  from public.companies c
  where c.id = v_company;

  v_preview := case
    when char_length(trim(coalesce(new.body, ''))) > 0 then left(new.body, 120)
    else null
  end;

  if new.sender_id = v_installer then
    -- Instalador -> empresa: gerente y coordinadores activos de esa empresa.
    insert into public.notifications (user_id, type, title, body, data)
    select
      p.id,
      'chat_message',
      coalesce(v_sender_name, 'Instalador'),
      coalesce(
        v_preview,
        case when p.locale = 'pt' then 'Enviou um anexo'
             else 'Envió un archivo adjunto' end
      ),
      jsonb_build_object(
        'url', '/messages/' || v_installer || '?company=' || v_company,
        'thread_id', new.thread_id,
        'company_id', v_company,
        'locale', p.locale
      )
    from public.profiles p
    where p.id <> new.sender_id
      and (
        (
          p.role = 'company_manager'
          and p.company_id = v_company
        )
        or exists (
          select 1
          from public.company_installers ci
          join public.company_membership_roles cmr
            on cmr.company_id = ci.company_id
           and cmr.user_id = ci.installer_id
           and cmr.role = 'coordinator'
          where ci.company_id = v_company
            and ci.installer_id = p.id
            and ci.status = 'active'
        )
      );
  else
    -- Empresa/coordinación -> instalador.
    insert into public.notifications (user_id, type, title, body, data)
    select
      p.id,
      'chat_message',
      coalesce(
        v_company_name,
        case when p.locale = 'pt' then 'Mensagem' else 'Mensaje' end
      ),
      coalesce(
        v_preview,
        case when p.locale = 'pt' then 'Enviou um anexo'
             else 'Envió un archivo adjunto' end
      ),
      jsonb_build_object(
        'url', '/messages/' || v_installer || '?company=' || v_company,
        'thread_id', new.thread_id,
        'company_id', v_company,
        'locale', p.locale
      )
    from public.profiles p
    where p.id = v_installer
      and p.id <> new.sender_id;
  end if;

  return new;
end;
$$;

comment on function public.notify_broadcast_application() is
  'Avisa a gerencia y a la coordinación del proyecto. Lee capacidades desde company_membership_roles, no desde el rol escalar legacy.';
comment on function public.notify_order_update() is
  'Avisa a gerencia y a la coordinación del proyecto. Lee capacidades desde company_membership_roles, no desde el rol escalar legacy.';
comment on function public.notify_chat_message() is
  'Avisa a la contraparte del hilo. Lee capacidades desde company_membership_roles, no desde el rol escalar legacy.';

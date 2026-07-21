-- Paso 12: las notificaciones se crean en el locale del destinatario.
-- profiles.locale usa 'es' / 'pt'; el contenido de usuario (títulos y notas)
-- se conserva tal cual fue escrito.

create or replace function public.notify_new_broadcast()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, body, data)
  select
    i.id,
    'broadcast_new',
    case when p.locale = 'pt' then 'Novo trabalho na sua região' else 'Nuevo trabajo en tu zona' end,
    new.title,
    jsonb_build_object(
      'url', '/jobs',
      'broadcast_id', new.id,
      'company_id', new.company_id,
      'zone', new.zone,
      'locale', p.locale
    )
  from public.installers i
  join public.profiles p on p.id = i.id
  where i.available and new.zone = any(i.zones);
  return new;
end;
$$;

create or replace function public.notify_broadcast_application()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_title text;
  v_installer_name text;
begin
  select b.company_id, b.title into v_company_id, v_title
  from public.broadcasts b where b.id = new.broadcast_id;
  select pr.full_name into v_installer_name
  from public.profiles pr where pr.id = new.installer_id;

  insert into public.notifications (user_id, type, title, body, data)
  select
    p.id,
    'application_received',
    case when p.locale = 'pt' then 'Nova candidatura' else 'Nueva postulación' end,
    case
      when p.locale = 'pt' then coalesce(v_installer_name, 'Um instalador') || ' se candidatou a ' || v_title
      else coalesce(v_installer_name, 'Un instalador') || ' se postuló a ' || v_title
    end,
    jsonb_build_object(
      'url', '/broadcasts',
      'broadcast_id', new.broadcast_id,
      'installer_id', new.installer_id,
      'company_id', v_company_id,
      'locale', p.locale
    )
  from public.profiles p
  where p.role = 'company_manager' and p.company_id = v_company_id;
  return new;
end;
$$;

create or replace function public.notify_order_assignment()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.assigned_installer_id is not null
     and new.assigned_installer_id is distinct from old.assigned_installer_id then
    insert into public.notifications (user_id, type, title, body, data)
    select
      p.id,
      'order_assigned',
      case when p.locale = 'pt' then 'Nova ordem atribuída' else 'Nueva orden asignada' end,
      new.order_number || ' · ' || new.title,
      jsonb_build_object(
        'url', '/tasks/' || new.id,
        'order_id', new.id,
        'company_id', new.company_id,
        'locale', p.locale
      )
    from public.profiles p
    where p.id = new.assigned_installer_id;
  end if;
  return new;
end;
$$;

create or replace function public.notify_order_update()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_order_number text;
begin
  if new.installer_id is null then return new; end if;
  select w.order_number into v_order_number
  from public.work_orders w where w.id = new.order_id;

  insert into public.notifications (user_id, type, title, body, data)
  select
    p.id,
    'update_received',
    case
      when p.locale = 'pt' then 'Nova atualização de ' || coalesce(v_order_number, 'uma ordem')
      else 'Nuevo avance de ' || coalesce(v_order_number, 'una orden')
    end,
    left(
      coalesce(
        nullif(new.note, ''),
        case
          when p.locale = 'pt' then 'O instalador enviou uma atualização.'
          else 'El instalador cargó una actualización.'
        end
      ),
      180
    ),
    jsonb_build_object(
      'url', '/orders/' || new.order_id,
      'order_id', new.order_id,
      'update_id', new.id,
      'installer_id', new.installer_id,
      'company_id', new.company_id,
      'locale', p.locale
    )
  from public.profiles p
  where p.role = 'company_manager' and p.company_id = new.company_id;
  return new;
end;
$$;

create or replace function public.accept_broadcast_application(
  p_broadcast_id uuid,
  p_installer_id uuid,
  p_order_ids uuid[] default '{}'
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_broadcast public.broadcasts%rowtype;
  v_application_status text;
  v_accepted integer;
  v_requested integer := coalesce(cardinality(p_order_ids), 0);
  v_updated integer;
  v_installer_locale text := 'es';
begin
  if public.auth_role() <> 'company_manager' then
    raise exception 'Acceso denegado';
  end if;

  select * into v_broadcast
  from public.broadcasts b
  where b.id = p_broadcast_id and b.company_id = public.auth_company()
  for update;
  if not found then raise exception 'Búsqueda no encontrada'; end if;
  if v_broadcast.status <> 'open' then raise exception 'La búsqueda está cerrada'; end if;

  select ba.status into v_application_status
  from public.broadcast_applications ba
  where ba.broadcast_id = p_broadcast_id and ba.installer_id = p_installer_id
  for update;
  if not found then raise exception 'Postulación no encontrada'; end if;
  if v_application_status = 'accepted' then return; end if;
  if v_application_status <> 'applied' then raise exception 'La postulación ya fue resuelta'; end if;

  select count(*) into v_accepted
  from public.broadcast_applications ba
  where ba.broadcast_id = p_broadcast_id and ba.status = 'accepted';
  if v_accepted >= v_broadcast.slots then raise exception 'No quedan cupos'; end if;

  if v_requested > 0 then
    if v_broadcast.project_id is null then
      raise exception 'La búsqueda no está asociada a un proyecto';
    end if;
    update public.work_orders w
    set assigned_installer_id = p_installer_id, source = 'broadcast'
    where w.id = any(p_order_ids)
      and w.company_id = v_broadcast.company_id
      and w.project_id = v_broadcast.project_id
      and w.assigned_installer_id is null
      and w.status not in ('finalizada', 'cancelada');
    get diagnostics v_updated = row_count;
    if v_updated <> v_requested then
      raise exception 'Una o más órdenes no están disponibles';
    end if;
  end if;

  insert into public.company_installers (company_id, installer_id, status, joined_at)
  values (v_broadcast.company_id, p_installer_id, 'active', now())
  on conflict (company_id, installer_id) do update
  set status = 'active', joined_at = coalesce(company_installers.joined_at, now());

  update public.broadcast_applications
  set status = 'accepted'
  where broadcast_id = p_broadcast_id and installer_id = p_installer_id;

  select p.locale into v_installer_locale
  from public.profiles p where p.id = p_installer_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    p_installer_id,
    'application_accepted',
    case when v_installer_locale = 'pt' then 'Candidatura aceita' else 'Postulación aceptada' end,
    case
      when v_installer_locale = 'pt' then 'Você entrou para a equipe de ' || v_broadcast.title
      else 'Te sumaron al equipo para ' || v_broadcast.title
    end,
    jsonb_build_object(
      'url', '/jobs',
      'broadcast_id', p_broadcast_id,
      'installer_id', p_installer_id,
      'company_id', v_broadcast.company_id,
      'locale', v_installer_locale
    )
  );

  if v_accepted + 1 >= v_broadcast.slots then
    insert into public.notifications (user_id, type, title, body, data)
    select
      ba.installer_id,
      'application_rejected',
      case when p.locale = 'pt' then 'Candidatura não selecionada' else 'Postulación no seleccionada' end,
      case
        when p.locale = 'pt' then 'As vagas de ' || v_broadcast.title || ' foram preenchidas'
        else 'Se completaron los cupos para ' || v_broadcast.title
      end,
      jsonb_build_object(
        'url', '/jobs',
        'broadcast_id', p_broadcast_id,
        'locale', p.locale
      )
    from public.broadcast_applications ba
    join public.profiles p on p.id = ba.installer_id
    where ba.broadcast_id = p_broadcast_id and ba.status = 'applied';

    update public.broadcasts set status = 'closed' where id = p_broadcast_id;
    update public.broadcast_applications
    set status = 'rejected'
    where broadcast_id = p_broadcast_id and status = 'applied';
  end if;
end;
$$;
revoke all on function public.accept_broadcast_application(uuid, uuid, uuid[]) from public;
grant execute on function public.accept_broadcast_application(uuid, uuid, uuid[]) to authenticated;

create or replace function public.reject_broadcast_application(
  p_broadcast_id uuid,
  p_installer_id uuid
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_broadcast public.broadcasts%rowtype;
  v_locale text := 'es';
begin
  if public.auth_role() <> 'company_manager' then
    raise exception 'Acceso denegado';
  end if;
  select * into v_broadcast
  from public.broadcasts b
  where b.id = p_broadcast_id and b.company_id = public.auth_company();
  if not found then raise exception 'Búsqueda no encontrada'; end if;

  update public.broadcast_applications
  set status = 'rejected'
  where broadcast_id = p_broadcast_id
    and installer_id = p_installer_id
    and status = 'applied';
  if not found then raise exception 'La postulación ya fue resuelta'; end if;

  select p.locale into v_locale from public.profiles p where p.id = p_installer_id;
  insert into public.notifications (user_id, type, title, body, data)
  values (
    p_installer_id,
    'application_rejected',
    case when v_locale = 'pt' then 'Candidatura não selecionada' else 'Postulación no seleccionada' end,
    case
      when v_locale = 'pt' then 'A empresa escolheu outra opção para ' || v_broadcast.title
      else 'La empresa avanzó con otra opción para ' || v_broadcast.title
    end,
    jsonb_build_object(
      'url', '/jobs',
      'broadcast_id', p_broadcast_id,
      'locale', v_locale
    )
  );
end;
$$;
revoke all on function public.reject_broadcast_application(uuid, uuid) from public;
grant execute on function public.reject_broadcast_application(uuid, uuid) to authenticated;

create or replace function public.close_broadcast(p_broadcast_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_broadcast public.broadcasts%rowtype;
begin
  if public.auth_role() <> 'company_manager' then
    raise exception 'Acceso denegado';
  end if;

  select * into v_broadcast
  from public.broadcasts b
  where b.id = p_broadcast_id and b.company_id = public.auth_company()
  for update;
  if not found then raise exception 'Búsqueda no encontrada'; end if;
  if v_broadcast.status = 'closed' then return; end if;

  insert into public.notifications (user_id, type, title, body, data)
  select
    ba.installer_id,
    'application_rejected',
    case when p.locale = 'pt' then 'Oportunidade encerrada' else 'Búsqueda cerrada' end,
    case
      when p.locale = 'pt' then v_broadcast.title || ' não recebe mais candidaturas.'
      else v_broadcast.title || ' ya no recibe postulaciones.'
    end,
    jsonb_build_object(
      'url', '/jobs',
      'broadcast_id', p_broadcast_id,
      'locale', p.locale
    )
  from public.broadcast_applications ba
  join public.profiles p on p.id = ba.installer_id
  where ba.broadcast_id = p_broadcast_id and ba.status = 'applied';

  update public.broadcast_applications
  set status = 'rejected'
  where broadcast_id = p_broadcast_id and status = 'applied';
  update public.broadcasts set status = 'closed' where id = p_broadcast_id;
end;
$$;
revoke all on function public.close_broadcast(uuid) from public;
grant execute on function public.close_broadcast(uuid) to authenticated;

-- Los avisos históricos todavía no leídos de perfiles pt reciben al menos el
-- título localizado. Los cuerpos con contenido de usuario se preservan.
update public.notifications n
set title = case n.type
  when 'broadcast_new' then 'Novo trabalho na sua região'
  when 'application_received' then 'Nova candidatura'
  when 'order_assigned' then 'Nova ordem atribuída'
  when 'update_received' then 'Nova atualização'
  when 'application_accepted' then 'Candidatura aceita'
  when 'application_rejected' then 'Candidatura atualizada'
  else n.title
end
from public.profiles p
where p.id = n.user_id
  and p.locale = 'pt'
  and n.read_at is null;

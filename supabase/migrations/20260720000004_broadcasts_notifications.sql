-- Paso 11: bolsa por zona, aceptación atómica y notificaciones in-app.

-- Permite que la Edge Function marque exactamente qué notificaciones ya
-- intentó entregar por Web Push. La bandeja in-app no depende de esta marca.
alter table public.notifications
  add column push_sent_at timestamptz;

-- El manager necesita ver el nombre de quienes se postulan a búsquedas propias.
create policy profiles_broadcast_applicant_read on public.profiles
  for select using (
    public.auth_role() = 'company_manager'
    and exists (
      select 1
      from public.broadcast_applications ba
      join public.broadcasts b on b.id = ba.broadcast_id
      where ba.installer_id = profiles.id
        and b.company_id = public.auth_company()
    )
  );

-- Un instalador conserva acceso a búsquedas donde ya se postuló aunque se cierren.
create or replace function public.installer_can_read_broadcast(p_broadcast_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.broadcasts b
    join public.installers i on i.id = auth.uid()
    where b.id = p_broadcast_id
      and (
        (b.status = 'open' and b.zone = any(i.zones))
        or exists (
          select 1 from public.broadcast_applications ba
          where ba.broadcast_id = b.id and ba.installer_id = auth.uid()
        )
      )
  )
$$;
revoke all on function public.installer_can_read_broadcast(uuid) from public;
grant execute on function public.installer_can_read_broadcast(uuid) to authenticated;

drop policy if exists broadcasts_installer_read on public.broadcasts;
create policy broadcasts_installer_read on public.broadcasts
  for select using (
    public.auth_role() = 'installer'
    and public.installer_can_read_broadcast(id)
  );

-- No alcanza con conocer un UUID: la búsqueda debe estar abierta y coincidir
-- con una zona declarada por el instalador.
drop policy if exists broadcast_apps_installer_insert on public.broadcast_applications;
create policy broadcast_apps_installer_insert on public.broadcast_applications
  for insert with check (
    installer_id = auth.uid()
    and exists (
      select 1
      from public.broadcasts b
      join public.installers i on i.id = auth.uid()
      where b.id = broadcast_id
        and b.status = 'open'
        and b.zone = any(i.zones)
    )
  );

-- Las aceptaciones se hacen exclusivamente por la RPC transaccional de abajo.
drop policy if exists broadcast_apps_manager_update on public.broadcast_applications;

-- ---------------------------------------------------------------------------
-- Notificaciones automáticas
-- ---------------------------------------------------------------------------

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
    'Nuevo trabajo en tu zona',
    new.title,
    jsonb_build_object(
      'url', '/jobs',
      'broadcast_id', new.id,
      'company_id', new.company_id,
      'zone', new.zone
    )
  from public.installers i
  where i.available and new.zone = any(i.zones);
  return new;
end;
$$;

create trigger broadcasts_notify_zone
  after insert on public.broadcasts
  for each row execute function public.notify_new_broadcast();

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
  select p.full_name into v_installer_name
  from public.profiles p where p.id = new.installer_id;

  insert into public.notifications (user_id, type, title, body, data)
  select
    p.id,
    'application_received',
    'Nueva postulación',
    coalesce(v_installer_name, 'Un instalador') || ' se postuló a ' || v_title,
    jsonb_build_object(
      'url', '/broadcasts',
      'broadcast_id', new.broadcast_id,
      'installer_id', new.installer_id,
      'company_id', v_company_id
    )
  from public.profiles p
  where p.role = 'company_manager' and p.company_id = v_company_id;
  return new;
end;
$$;

create trigger broadcast_applications_notify_manager
  after insert on public.broadcast_applications
  for each row execute function public.notify_broadcast_application();

create or replace function public.notify_order_assignment()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.assigned_installer_id is not null
     and new.assigned_installer_id is distinct from old.assigned_installer_id then
    insert into public.notifications (user_id, type, title, body, data)
    values (
      new.assigned_installer_id,
      'order_assigned',
      'Nueva orden asignada',
      new.order_number || ' · ' || new.title,
      jsonb_build_object(
        'url', '/tasks/' || new.id,
        'order_id', new.id,
        'company_id', new.company_id
      )
    );
  end if;
  return new;
end;
$$;

create trigger work_orders_notify_assignment
  after update of assigned_installer_id on public.work_orders
  for each row execute function public.notify_order_assignment();

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
    'Nuevo avance de ' || coalesce(v_order_number, 'una orden'),
    left(coalesce(nullif(new.note, ''), 'El instalador cargó una actualización.'), 180),
    jsonb_build_object(
      'url', '/orders/' || new.order_id,
      'order_id', new.order_id,
      'update_id', new.id,
      'installer_id', new.installer_id,
      'company_id', new.company_id
    )
  from public.profiles p
  where p.role = 'company_manager' and p.company_id = new.company_id;
  return new;
end;
$$;

create trigger order_updates_notify_manager
  after insert on public.order_updates
  for each row execute function public.notify_order_update();

-- ---------------------------------------------------------------------------
-- Aceptar = postulación + roster + órdenes, todo o nada.
-- ---------------------------------------------------------------------------

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

  insert into public.notifications (user_id, type, title, body, data)
  values (
    p_installer_id,
    'application_accepted',
    'Postulación aceptada',
    'Te sumaron al equipo para ' || v_broadcast.title,
    jsonb_build_object(
      'url', '/jobs',
      'broadcast_id', p_broadcast_id,
      'installer_id', p_installer_id,
      'company_id', v_broadcast.company_id
    )
  );

  if v_accepted + 1 >= v_broadcast.slots then
    insert into public.notifications (user_id, type, title, body, data)
    select
      ba.installer_id,
      'application_rejected',
      'Postulación no seleccionada',
      'Se completaron los cupos para ' || v_broadcast.title,
      jsonb_build_object('url', '/jobs', 'broadcast_id', p_broadcast_id)
    from public.broadcast_applications ba
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

  insert into public.notifications (user_id, type, title, body, data)
  values (
    p_installer_id,
    'application_rejected',
    'Postulación no seleccionada',
    'La empresa avanzó con otra opción para ' || v_broadcast.title,
    jsonb_build_object('url', '/jobs', 'broadcast_id', p_broadcast_id)
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
    'Búsqueda cerrada',
    v_broadcast.title || ' ya no recibe postulaciones.',
    jsonb_build_object('url', '/jobs', 'broadcast_id', p_broadcast_id)
  from public.broadcast_applications ba
  where ba.broadcast_id = p_broadcast_id and ba.status = 'applied';

  update public.broadcast_applications
  set status = 'rejected'
  where broadcast_id = p_broadcast_id and status = 'applied';
  update public.broadcasts set status = 'closed' where id = p_broadcast_id;
end;
$$;
revoke all on function public.close_broadcast(uuid) from public;
grant execute on function public.close_broadcast(uuid) to authenticated;

-- Realtime para que la campanita reciba nuevas filas sin recargar.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

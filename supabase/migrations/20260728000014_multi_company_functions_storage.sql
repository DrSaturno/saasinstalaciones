-- Fase 3 del plan coordinador/instalador multi-empresa.
--
-- Las policies de las tablas ya entienden el modelo dual, pero varias
-- funciones SECURITY DEFINER y cinco policies de Storage todavía deducen el
-- rol y la empresa desde `profiles`. Esta migración mueve esas decisiones a
-- `company_installers`, sin hacer todavía el cutover de los perfiles.
--
-- Principios:
--   * company_manager sigue siendo mono-empresa y usa profiles.company_id;
--   * coordinator/installer se autorizan por la membresía activa y su rol;
--   * promover o aceptar una coordinación nunca puede esconder órdenes
--     abiertas que la persona todavía deba ejecutar en esa misma empresa;
--   * Storage conserva el alcance por entidad. Una membresía de instalador no
--     abre todos los archivos de su empresa.
--
-- Idempotente: todas las funciones se reemplazan y todas las policies se
-- recrean por nombre.

-- ---------------------------------------------------------------------------
-- 1. Relaciones de proyecto: el coordinador pertenece por membresía.
-- ---------------------------------------------------------------------------

create or replace function public.validate_project_relations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.client_id is not null and not exists (
    select 1
    from public.clients c
    where c.id = new.client_id
      and c.company_id = new.company_id
  ) then
    raise exception 'El cliente no pertenece a la empresa';
  end if;

  if new.coordinator_id is not null and not exists (
    select 1
    from public.company_installers ci
    where ci.company_id = new.company_id
      and ci.installer_id = new.coordinator_id
      and ci.role = 'coordinator'
      and ci.status = 'active'
  ) then
    raise exception 'El coordinador no pertenece a la empresa';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Cambios de rol: sólo cambia la membresía de esa empresa.
-- ---------------------------------------------------------------------------

create or replace function public.promote_installer_to_coordinator(p_installer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.auth_company();
  v_company_name text;
  v_membership_role text;
begin
  if public.auth_role() is distinct from 'company_manager' or v_company is null then
    raise exception 'Acceso denegado';
  end if;
  if p_installer_id = auth.uid() then
    raise exception 'No podés cambiar tu propio rol';
  end if;

  select ci.role
  into v_membership_role
  from public.company_installers ci
  where ci.company_id = v_company
    and ci.installer_id = p_installer_id
    and ci.status = 'active'
  for update;

  if not found then
    raise exception 'El instalador no pertenece al equipo activo';
  end if;
  if v_membership_role is distinct from 'installer' then
    raise exception 'La persona no es instaladora en esta empresa';
  end if;

  -- El rol es excluyente dentro de una empresa. Ascender con trabajo abierto
  -- dejaría esas órdenes sin un ejecutor válido y las ocultaría de la UI.
  if exists (
    select 1
    from public.work_orders w
    where w.company_id = v_company
      and w.assigned_installer_id = p_installer_id
      and w.status not in ('finalizada', 'cancelada')
  ) then
    raise exception 'No se puede ascender: el instalador tiene órdenes abiertas en esta empresa';
  end if;

  update public.company_installers
  set role = 'coordinator'
  where company_id = v_company
    and installer_id = p_installer_id;

  select c.name into v_company_name
  from public.companies c
  where c.id = v_company;

  insert into public.notifications (user_id, type, title, body, data)
  select
    p.id,
    'role_promoted',
    case when p.locale = 'pt' then 'Você agora é coordenador'
         else 'Ahora sos coordinador' end,
    case when p.locale = 'pt'
         then coalesce(v_company_name, 'A empresa') || ' promoveu você a coordenador. As ordens da sua equipe estão em Coordenação.'
         else coalesce(v_company_name, 'La empresa') || ' te ascendió a coordinador. Las órdenes de tu equipo están en Coordinación.' end,
    jsonb_build_object(
      'url', '/coordination',
      'company_id', v_company,
      'locale', p.locale
    )
  from public.profiles p
  where p.id = p_installer_id;
end;
$$;

revoke all on function public.promote_installer_to_coordinator(uuid) from public;
grant execute on function public.promote_installer_to_coordinator(uuid) to authenticated;

create or replace function public.demote_coordinator_to_installer(p_coordinator_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := public.auth_company();
  v_company_name text;
  v_membership_role text;
begin
  if public.auth_role() is distinct from 'company_manager' or v_company is null then
    raise exception 'Acceso denegado';
  end if;
  if p_coordinator_id = auth.uid() then
    raise exception 'No podés cambiar tu propio rol';
  end if;

  select ci.role
  into v_membership_role
  from public.company_installers ci
  where ci.company_id = v_company
    and ci.installer_id = p_coordinator_id
    and ci.status = 'active'
  for update;

  if not found then
    raise exception 'El coordinador no pertenece al equipo activo';
  end if;
  if v_membership_role is distinct from 'coordinator' then
    raise exception 'La persona no es coordinadora en esta empresa';
  end if;

  -- Los proyectos quedan disponibles para reasignar antes de quitar el rol.
  update public.projects
  set coordinator_id = null
  where company_id = v_company
    and coordinator_id = p_coordinator_id;

  -- Un coordinador puro puede no tener todavía ficha de oficio.
  insert into public.installers (id)
  values (p_coordinator_id)
  on conflict (id) do nothing;

  update public.company_installers
  set role = 'installer'
  where company_id = v_company
    and installer_id = p_coordinator_id;

  -- Compatibilidad durante el período dual: si todavía conserva la
  -- representación legacy de coordinador global en esta empresa, retirarla
  -- ahora. Si se dejara viva, la rama vieja de las policies seguiría
  -- autorizándolo hasta la Fase 6a aunque la membresía ya dijera installer.
  if exists (
    select 1
    from public.profiles p
    where p.id = p_coordinator_id
      and p.role = 'coordinator'
      and p.company_id = v_company
  ) then
    perform set_config('app.role_change_by_rpc', 'on', true);

    update public.profiles
    set role = 'installer',
        company_id = null
    where id = p_coordinator_id;

    perform set_config('app.role_change_by_rpc', 'off', true);
  end if;

  select c.name into v_company_name
  from public.companies c
  where c.id = v_company;

  insert into public.notifications (user_id, type, title, body, data)
  select
    p.id,
    'role_demoted',
    case when p.locale = 'pt' then 'Seu perfil voltou a instalador'
         else 'Tu perfil volvió a instalador' end,
    case when p.locale = 'pt'
         then coalesce(v_company_name, 'A empresa') || ' alterou sua função para instalador.'
         else coalesce(v_company_name, 'La empresa') || ' cambió tu función a instalador.' end,
    jsonb_build_object(
      'url', '/home',
      'company_id', v_company,
      'locale', p.locale
    )
  from public.profiles p
  where p.id = p_coordinator_id;
end;
$$;

revoke all on function public.demote_coordinator_to_installer(uuid) from public;
grant execute on function public.demote_coordinator_to_installer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Invitaciones: el rol invitado se aplica a la membresía, no a la cuenta.
-- ---------------------------------------------------------------------------

create or replace function public.accept_invitation(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.invitations;
  v_existing_role text;
  v_existing_status text;
begin
  if auth.uid() is null
     or public.auth_role() not in ('installer', 'coordinator') then
    raise exception 'Acceso denegado';
  end if;

  select *
  into v_inv
  from public.invitations
  where token = p_token
    and status = 'pending'
    and expires_at > now()
  for update;

  if not found then
    raise exception 'Invitación inválida o vencida';
  end if;

  select ci.role, ci.status
  into v_existing_role, v_existing_status
  from public.company_installers ci
  where ci.company_id = v_inv.company_id
    and ci.installer_id = auth.uid()
  for update;

  if found
     and v_existing_status = 'active'
     and v_existing_role is distinct from v_inv.role then
    raise exception 'Ya tenés otro rol activo en esta empresa';
  end if;

  if v_inv.role = 'coordinator' and exists (
    select 1
    from public.work_orders w
    where w.company_id = v_inv.company_id
      and w.assigned_installer_id = auth.uid()
      and w.status not in ('finalizada', 'cancelada')
  ) then
    raise exception 'No se puede coordinar: tenés órdenes abiertas como instalador en esta empresa';
  end if;

  -- La ficha de oficio es necesaria para instalar y para ser el sujeto de un
  -- hilo empresa↔instalador. Un coordinador puro no la necesita.
  if v_inv.role = 'installer' then
    insert into public.installers (id)
    values (auth.uid())
    on conflict (id) do nothing;
  end if;

  insert into public.company_installers (
    company_id, installer_id, role, status, joined_at
  )
  values (
    v_inv.company_id, auth.uid(), v_inv.role, 'active', now()
  )
  on conflict (company_id, installer_id)
  do update set
    role = excluded.role,
    status = 'active',
    joined_at = now();

  if v_inv.role = 'installer' then
    insert into public.chat_threads (company_id, installer_id)
    values (v_inv.company_id, auth.uid())
    on conflict (company_id, installer_id) do nothing;
  end if;

  update public.invitations
  set status = 'accepted'
  where id = v_inv.id;
end;
$$;

revoke all on function public.accept_invitation(uuid) from public;
grant execute on function public.accept_invitation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Disponibilidad, chat y matching: rol de la membresía correspondiente.
-- ---------------------------------------------------------------------------

create or replace function public.replace_installer_weekly_availability(
  p_company_id uuid,
  p_entries jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.auth_has_company_role(p_company_id, 'installer') then
    raise exception 'No sos instalador activo de esta empresa';
  end if;

  delete from public.installer_weekly_availability
  where company_id = p_company_id
    and installer_id = auth.uid();

  insert into public.installer_weekly_availability (
    company_id, installer_id, weekday, starts_at, ends_at, timezone
  )
  select
    p_company_id,
    auth.uid(),
    entry.weekday,
    entry.starts_at,
    entry.ends_at,
    coalesce(nullif(entry.timezone, ''), 'America/Argentina/Buenos_Aires')
  from jsonb_to_recordset(coalesce(p_entries, '[]'::jsonb)) as entry(
    weekday smallint,
    starts_at time,
    ends_at time,
    timezone text
  )
  where entry.weekday between 0 and 6
    and entry.ends_at > entry.starts_at;
end;
$$;

revoke all on function public.replace_installer_weekly_availability(uuid, jsonb) from public;
grant execute on function public.replace_installer_weekly_availability(uuid, jsonb) to authenticated;

create or replace function public.touch_chat_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sender_id is distinct from auth.uid() then
    raise exception 'El remitente no coincide con la sesión';
  end if;

  if not exists (
    select 1
    from public.chat_threads t
    where t.id = new.thread_id
      and t.company_id = new.company_id
      and (
        (
          public.auth_role() = 'company_manager'
          and t.company_id = public.auth_company()
        )
        or public.auth_has_company_role(t.company_id, 'coordinator')
        or (
          t.installer_id = auth.uid()
          and public.auth_has_company_role(t.company_id, 'installer')
        )
      )
  ) then
    raise exception 'El mensaje no pertenece a una conversación habilitada';
  end if;

  update public.chat_threads
  set last_message_at = greatest(last_message_at, new.created_at)
  where id = new.thread_id;

  return new;
end;
$$;

create or replace function public.broadcast_matches_installer(p_broadcast_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.broadcasts b
    join public.installers i on i.id = auth.uid()
    where b.id = p_broadcast_id
      and b.status = 'open'
      and b.zone = any(i.zones)
      and (
        i.service_radius_km is null
        or public.distance_km(i.base_lat, i.base_lng, b.lat, b.lng) is null
        or public.distance_km(i.base_lat, i.base_lng, b.lat, b.lng) <= i.service_radius_km
      )
      -- Cualquier membresía activa (instalador o coordinador) significa que
      -- ya trabaja para la empresa y no debe ver su propia búsqueda.
      and not exists (
        select 1
        from public.company_installers ci
        where ci.company_id = b.company_id
          and ci.installer_id = auth.uid()
          and ci.status = 'active'
      )
  )
$$;

revoke all on function public.broadcast_matches_installer(uuid) from public;
grant execute on function public.broadcast_matches_installer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPC de la bolsa: gerente mono-empresa o coordinador del proyecto.
-- ---------------------------------------------------------------------------

create or replace function public.accept_broadcast_application(
  p_broadcast_id uuid,
  p_installer_id uuid,
  p_order_ids uuid[] default '{}'
)
returns void
language plpgsql
security definer
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
  select *
  into v_broadcast
  from public.broadcasts b
  where b.id = p_broadcast_id
    and (
      (
        public.auth_role() = 'company_manager'
        and b.company_id = public.auth_company()
      )
      or (
        b.project_id is not null
        and public.auth_has_company_role(b.company_id, 'coordinator')
        and public.can_operate_project(b.project_id)
      )
    )
  for update;

  if not found then
    raise exception 'Búsqueda no encontrada';
  end if;
  if v_broadcast.status <> 'open' then
    raise exception 'La búsqueda está cerrada';
  end if;

  if exists (
    select 1
    from public.company_installers ci
    where ci.company_id = v_broadcast.company_id
      and ci.installer_id = p_installer_id
      and ci.role = 'coordinator'
      and ci.status = 'active'
  ) then
    raise exception 'La persona ya coordina en esta empresa y no puede ser asignada como instaladora';
  end if;

  select ba.status
  into v_application_status
  from public.broadcast_applications ba
  where ba.broadcast_id = p_broadcast_id
    and ba.installer_id = p_installer_id
  for update;

  if not found then
    raise exception 'Postulación no encontrada';
  end if;
  if v_application_status = 'accepted' then
    return;
  end if;
  if v_application_status <> 'applied' then
    raise exception 'La postulación ya fue resuelta';
  end if;

  select count(*)
  into v_accepted
  from public.broadcast_applications ba
  where ba.broadcast_id = p_broadcast_id
    and ba.status = 'accepted';

  if v_accepted >= v_broadcast.slots then
    raise exception 'No quedan cupos';
  end if;

  if v_requested > 0 then
    if v_broadcast.project_id is null then
      raise exception 'La búsqueda no está asociada a un proyecto';
    end if;

    update public.work_orders w
    set assigned_installer_id = p_installer_id,
        source = 'broadcast'
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

  insert into public.company_installers (
    company_id, installer_id, role, status, joined_at
  )
  values (
    v_broadcast.company_id, p_installer_id, 'installer', 'active', now()
  )
  on conflict (company_id, installer_id)
  do update set
    role = 'installer',
    status = 'active',
    joined_at = coalesce(company_installers.joined_at, now());

  insert into public.chat_threads (company_id, installer_id)
  values (v_broadcast.company_id, p_installer_id)
  on conflict (company_id, installer_id) do nothing;

  update public.broadcast_applications
  set status = 'accepted'
  where broadcast_id = p_broadcast_id
    and installer_id = p_installer_id;

  select p.locale
  into v_installer_locale
  from public.profiles p
  where p.id = p_installer_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    p_installer_id,
    'application_accepted',
    case when v_installer_locale = 'pt' then 'Candidatura aceita'
         else 'Postulación aceptada' end,
    case when v_installer_locale = 'pt'
         then 'Você entrou para a equipe de ' || v_broadcast.title
         else 'Te sumaron al equipo para ' || v_broadcast.title end,
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
      case when p.locale = 'pt' then 'Candidatura não selecionada'
           else 'Postulación no seleccionada' end,
      case when p.locale = 'pt'
           then 'As vagas de ' || v_broadcast.title || ' foram preenchidas'
           else 'Se completaron los cupos para ' || v_broadcast.title end,
      jsonb_build_object(
        'url', '/jobs',
        'broadcast_id', p_broadcast_id,
        'company_id', v_broadcast.company_id,
        'locale', p.locale
      )
    from public.broadcast_applications ba
    join public.profiles p on p.id = ba.installer_id
    where ba.broadcast_id = p_broadcast_id
      and ba.status = 'applied';

    update public.broadcasts
    set status = 'closed'
    where id = p_broadcast_id;

    update public.broadcast_applications
    set status = 'rejected'
    where broadcast_id = p_broadcast_id
      and status = 'applied';
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
language plpgsql
security definer
set search_path = public
as $$
declare
  v_broadcast public.broadcasts%rowtype;
  v_locale text := 'es';
begin
  select *
  into v_broadcast
  from public.broadcasts b
  where b.id = p_broadcast_id
    and (
      (
        public.auth_role() = 'company_manager'
        and b.company_id = public.auth_company()
      )
      or (
        b.project_id is not null
        and public.auth_has_company_role(b.company_id, 'coordinator')
        and public.can_operate_project(b.project_id)
      )
    );

  if not found then
    raise exception 'Búsqueda no encontrada';
  end if;

  update public.broadcast_applications
  set status = 'rejected'
  where broadcast_id = p_broadcast_id
    and installer_id = p_installer_id
    and status = 'applied';

  if not found then
    raise exception 'La postulación ya fue resuelta';
  end if;

  select p.locale
  into v_locale
  from public.profiles p
  where p.id = p_installer_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    p_installer_id,
    'application_rejected',
    case when v_locale = 'pt' then 'Candidatura não selecionada'
         else 'Postulación no seleccionada' end,
    case when v_locale = 'pt'
         then 'A empresa escolheu outra opção para ' || v_broadcast.title
         else 'La empresa avanzó con otra opción para ' || v_broadcast.title end,
    jsonb_build_object(
      'url', '/jobs',
      'broadcast_id', p_broadcast_id,
      'company_id', v_broadcast.company_id,
      'locale', v_locale
    )
  );
end;
$$;

revoke all on function public.reject_broadcast_application(uuid, uuid) from public;
grant execute on function public.reject_broadcast_application(uuid, uuid) to authenticated;

create or replace function public.close_broadcast(p_broadcast_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_broadcast public.broadcasts%rowtype;
begin
  select *
  into v_broadcast
  from public.broadcasts b
  where b.id = p_broadcast_id
    and (
      (
        public.auth_role() = 'company_manager'
        and b.company_id = public.auth_company()
      )
      or (
        b.project_id is not null
        and public.auth_has_company_role(b.company_id, 'coordinator')
        and public.can_operate_project(b.project_id)
      )
    )
  for update;

  if not found then
    raise exception 'Búsqueda no encontrada';
  end if;
  if v_broadcast.status = 'closed' then
    return;
  end if;

  insert into public.notifications (user_id, type, title, body, data)
  select
    ba.installer_id,
    'application_rejected',
    case when p.locale = 'pt' then 'Oportunidade encerrada'
         else 'Búsqueda cerrada' end,
    case when p.locale = 'pt'
         then v_broadcast.title || ' não recebe mais candidaturas.'
         else v_broadcast.title || ' ya no recibe postulaciones.' end,
    jsonb_build_object(
      'url', '/jobs',
      'broadcast_id', p_broadcast_id,
      'company_id', v_broadcast.company_id,
      'locale', p.locale
    )
  from public.broadcast_applications ba
  join public.profiles p on p.id = ba.installer_id
  where ba.broadcast_id = p_broadcast_id
    and ba.status = 'applied';

  update public.broadcast_applications
  set status = 'rejected'
  where broadcast_id = p_broadcast_id
    and status = 'applied';

  update public.broadcasts
  set status = 'closed'
  where id = p_broadcast_id;
end;
$$;

revoke all on function public.close_broadcast(uuid) from public;
grant execute on function public.close_broadcast(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Notificaciones: gerente + coordinador responsable por membresía.
-- ---------------------------------------------------------------------------

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
       and ci.role = 'coordinator'
       and ci.status = 'active'
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
     and ci.role = 'coordinator'
     and ci.status = 'active'
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
          where ci.company_id = v_company
            and ci.installer_id = p.id
            and ci.role = 'coordinator'
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

-- `publish_announcement` ya es exclusivo del gerente. Su helper de emails
-- conservaba por error la autorización global del coordinador y exponía
-- direcciones de auth.users a un rol que ya no pertenece al área empresa.
create or replace function public.announcement_recipient_emails(p_announcement_id uuid)
returns table (email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  select a.company_id
  into v_company
  from public.announcements a
  where a.id = p_announcement_id;

  if v_company is null then
    raise exception 'Anuncio inexistente';
  end if;
  if public.auth_role() is distinct from 'company_manager'
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

-- ---------------------------------------------------------------------------
-- 7. Storage: gerente, coordinador autorizado o instalador de la entidad.
-- ---------------------------------------------------------------------------
-- Los paths de evidence son company_id/order_or_site_id/file. El coordinador
-- sólo gana acceso si opera el proyecto de esa orden o locación. No se usa
-- `auth_companies()` sin rol: hacerlo abriría todos los archivos de una
-- empresa a cualquier instalador activo de su roster.

drop policy if exists evidence_upload on storage.objects;
create policy evidence_upload on storage.objects
  for insert
  with check (
    bucket_id = 'evidence'
    and auth.uid() is not null
    and (
      (
        public.auth_role() = 'company_manager'
        and (storage.foldername(name))[1] = public.auth_company()::text
      )
      or exists (
        select 1
        from public.work_orders w
        where w.id = ((storage.foldername(name))[2])::uuid
          and w.company_id::text = (storage.foldername(name))[1]
          and (
            (
              public.auth_has_company_role(w.company_id, 'coordinator')
              and public.can_operate_project(w.project_id)
            )
            or w.assigned_installer_id = auth.uid()
          )
      )
      or exists (
        select 1
        from public.sites s
        where s.id = ((storage.foldername(name))[2])::uuid
          and s.company_id::text = (storage.foldername(name))[1]
          and public.auth_has_company_role(s.company_id, 'coordinator')
          and public.can_operate_project(s.project_id)
      )
    )
  );

drop policy if exists evidence_read on storage.objects;
create policy evidence_read on storage.objects
  for select
  using (
    bucket_id = 'evidence'
    and (
      (
        public.auth_role() = 'company_manager'
        and (storage.foldername(name))[1] = public.auth_company()::text
      )
      or exists (
        select 1
        from public.work_orders w
        where w.id = ((storage.foldername(name))[2])::uuid
          and w.company_id::text = (storage.foldername(name))[1]
          and (
            (
              public.auth_has_company_role(w.company_id, 'coordinator')
              and public.can_operate_project(w.project_id)
            )
            or w.assigned_installer_id = auth.uid()
          )
      )
      or exists (
        select 1
        from public.sites s
        where s.id = ((storage.foldername(name))[2])::uuid
          and s.company_id::text = (storage.foldername(name))[1]
          and (
            (
              public.auth_has_company_role(s.company_id, 'coordinator')
              and public.can_operate_project(s.project_id)
            )
            or exists (
              select 1
              from public.work_orders w
              where w.site_id = s.id
                and w.assigned_installer_id = auth.uid()
            )
          )
      )
    )
  );

drop policy if exists evidence_company_delete on storage.objects;
create policy evidence_company_delete on storage.objects
  for delete
  using (
    bucket_id = 'evidence'
    and (
      (
        public.auth_role() = 'company_manager'
        and (storage.foldername(name))[1] = public.auth_company()::text
      )
      or exists (
        select 1
        from public.work_orders w
        where w.id = ((storage.foldername(name))[2])::uuid
          and w.company_id::text = (storage.foldername(name))[1]
          and public.auth_has_company_role(w.company_id, 'coordinator')
          and public.can_operate_project(w.project_id)
      )
      or exists (
        select 1
        from public.sites s
        where s.id = ((storage.foldername(name))[2])::uuid
          and s.company_id::text = (storage.foldername(name))[1]
          and public.auth_has_company_role(s.company_id, 'coordinator')
          and public.can_operate_project(s.project_id)
      )
    )
  );

-- Los paths de chat son company_id/thread_id/file. Toda rama valida también
-- que el thread exista y pertenezca a ese primer segmento.
drop policy if exists chat_storage_upload on storage.objects;
create policy chat_storage_upload on storage.objects
  for insert
  with check (
    bucket_id = 'chat'
    and auth.uid() is not null
    and exists (
      select 1
      from public.chat_threads t
      where t.id = ((storage.foldername(name))[2])::uuid
        and t.company_id::text = (storage.foldername(name))[1]
        and (
          (
            public.auth_role() = 'company_manager'
            and t.company_id = public.auth_company()
          )
          or public.auth_has_company_role(t.company_id, 'coordinator')
          or (
            t.installer_id = auth.uid()
            and public.auth_has_company_role(t.company_id, 'installer')
          )
        )
    )
  );

drop policy if exists chat_storage_read on storage.objects;
create policy chat_storage_read on storage.objects
  for select
  using (
    bucket_id = 'chat'
    and (
      owner = auth.uid()
      or exists (
        select 1
        from public.chat_threads t
        where t.id = ((storage.foldername(name))[2])::uuid
          and t.company_id::text = (storage.foldername(name))[1]
          and (
            (
              public.auth_role() = 'company_manager'
              and t.company_id = public.auth_company()
            )
            or public.auth_has_company_role(t.company_id, 'coordinator')
            or (
              t.installer_id = auth.uid()
              and public.auth_has_company_role(t.company_id, 'installer')
            )
          )
      )
    )
  );

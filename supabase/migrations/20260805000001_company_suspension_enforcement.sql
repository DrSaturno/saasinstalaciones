-- R0-FIX-01: convertir companies.status en un gate efectivo de autorización.
--
-- La suspensión es reversible: no modifica memberships ni datos de dominio.
-- Los gerentes quedan sin auth_company() y las cuentas de campo conservan sólo
-- sus otras empresas activas. Las policies directas de instalador también
-- validan el tenant porque no todas pasan por los helpers de membresía.

-- ---------------------------------------------------------------------------
-- 1. Gate central y helpers de identidad tenant.
-- ---------------------------------------------------------------------------

create or replace function public.company_is_active(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.companies c
    where c.id = p_company_id
      and c.status = 'active'
  )
$$;

revoke all on function public.company_is_active(uuid) from public;
grant execute on function public.company_is_active(uuid) to authenticated;

-- Variante para el primer segmento de paths de Storage. Comparar como texto
-- evita que un objeto legacy con carpeta no UUID provoque un cast fallido.
create or replace function public.company_path_is_active(p_company_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.companies c
    where c.id::text = p_company_id
      and c.status = 'active'
  )
$$;

revoke all on function public.company_path_is_active(text) from public;
grant execute on function public.company_path_is_active(text) to authenticated;

create or replace function public.auth_company()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.company_id
  from public.profiles p
  join public.companies c on c.id = p.company_id
  where p.id = auth.uid()
    and c.status = 'active'
$$;

create or replace function public.auth_companies(p_role text default null)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select ci.company_id
  from public.company_installers ci
  join public.companies c on c.id = ci.company_id
  where ci.installer_id = auth.uid()
    and ci.status = 'active'
    and c.status = 'active'
    and (p_role is null or ci.role = p_role)
$$;

create or replace function public.auth_has_company_role(
  p_company_id uuid,
  p_role text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_installers ci
    join public.companies c on c.id = ci.company_id
    where ci.company_id = p_company_id
      and ci.installer_id = auth.uid()
      and ci.role = p_role
      and ci.status = 'active'
      and c.status = 'active'
  )
$$;

create or replace function public.auth_coordinates_anywhere()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_installers ci
    join public.companies c on c.id = ci.company_id
    where ci.installer_id = auth.uid()
      and ci.role = 'coordinator'
      and ci.status = 'active'
      and c.status = 'active'
  )
$$;

revoke all on function public.auth_company() from public;
revoke all on function public.auth_companies(text) from public;
revoke all on function public.auth_has_company_role(uuid, text) from public;
revoke all on function public.auth_coordinates_anywhere() from public;
grant execute on function public.auth_company() to authenticated;
grant execute on function public.auth_companies(text) to authenticated;
grant execute on function public.auth_has_company_role(uuid, text) to authenticated;
grant execute on function public.auth_coordinates_anywhere() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. SECURITY DEFINER que podían puentear RLS.
-- ---------------------------------------------------------------------------

drop function if exists public.invitation_preview(uuid);
create function public.invitation_preview(p_token uuid)
returns table (
  company_name text,
  email text,
  valid boolean,
  invite_role text,
  company_id uuid
)
language sql
security definer
set search_path = public
as $$
  select
    c.name,
    i.email,
    (
      i.status = 'pending'
      and i.expires_at > now()
      and c.status = 'active'
    ),
    i.role,
    i.company_id
  from public.invitations i
  join public.companies c on c.id = i.company_id
  where i.token = p_token
$$;

revoke all on function public.invitation_preview(uuid) from public;
grant execute on function public.invitation_preview(uuid) to anon, authenticated;

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
  if not public.company_is_active(v_inv.company_id) then
    raise exception 'Empresa suspendida';
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
      and public.company_is_active(b.company_id)
      and b.status = 'open'
      and b.zone = any(i.zones)
      and (
        i.service_radius_km is null
        or public.distance_km(i.base_lat, i.base_lng, b.lat, b.lng) is null
        or public.distance_km(i.base_lat, i.base_lng, b.lat, b.lng)
          <= i.service_radius_km
      )
      and not exists (
        select 1
        from public.company_installers ci
        where ci.company_id = b.company_id
          and ci.installer_id = auth.uid()
          and ci.status = 'active'
      )
  )
$$;

create or replace function public.installer_can_read_broadcast(
  p_broadcast_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.broadcasts b
    where b.id = p_broadcast_id
      and public.company_is_active(b.company_id)
      and (
        public.broadcast_matches_installer(b.id)
        or exists (
          select 1
          from public.broadcast_applications ba
          where ba.broadcast_id = b.id
            and ba.installer_id = auth.uid()
        )
      )
  )
$$;

revoke all on function public.broadcast_matches_installer(uuid) from public;
revoke all on function public.installer_can_read_broadcast(uuid) from public;
grant execute on function public.broadcast_matches_installer(uuid) to authenticated;
grant execute on function public.installer_can_read_broadcast(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Policies directas de miembros/instaladores.
-- ---------------------------------------------------------------------------

drop policy if exists companies_member_read on public.companies;
create policy companies_member_read on public.companies
  for select using (
    id = public.auth_company()
    or (
      public.company_is_active(id)
      and id in (
        select ci.company_id
        from public.company_installers ci
        where ci.installer_id = auth.uid()
          and ci.status = 'active'
      )
    )
  );

drop policy if exists company_installers_own_read on public.company_installers;
create policy company_installers_own_read on public.company_installers
  for select using (
    installer_id = auth.uid()
    and public.company_is_active(company_id)
  );

drop policy if exists sites_installer_read on public.sites;
create policy sites_installer_read on public.sites
  for select using (
    public.company_is_active(company_id)
    and id in (
      select w.site_id
      from public.work_orders w
      where w.assigned_installer_id = auth.uid()
    )
  );

drop policy if exists work_orders_installer_read on public.work_orders;
create policy work_orders_installer_read on public.work_orders
  for select using (
    assigned_installer_id = auth.uid()
    and public.company_is_active(company_id)
  );

drop policy if exists work_orders_installer_progress on public.work_orders;
create policy work_orders_installer_progress on public.work_orders
  for update using (
    assigned_installer_id = auth.uid()
    and public.company_is_active(company_id)
  )
  with check (
    assigned_installer_id = auth.uid()
    and public.company_is_active(company_id)
  );

drop policy if exists order_updates_installer_read on public.order_updates;
create policy order_updates_installer_read on public.order_updates
  for select using (
    public.company_is_active(company_id)
    and exists (
      select 1
      from public.work_orders w
      where w.id = order_id
        and w.company_id = order_updates.company_id
        and w.assigned_installer_id = auth.uid()
    )
  );

drop policy if exists order_updates_installer_insert on public.order_updates;
create policy order_updates_installer_insert on public.order_updates
  for insert with check (
    installer_id = auth.uid()
    and public.company_is_active(company_id)
    and exists (
      select 1
      from public.work_orders w
      where w.id = order_id
        and w.company_id = order_updates.company_id
        and w.assigned_installer_id = auth.uid()
    )
  );

drop policy if exists order_attachments_installer_read on public.order_attachments;
create policy order_attachments_installer_read on public.order_attachments
  for select using (
    public.company_is_active(company_id)
    and exists (
      select 1
      from public.work_orders w
      where w.id = order_id
        and w.company_id = order_attachments.company_id
        and w.assigned_installer_id = auth.uid()
    )
  );

drop policy if exists site_attachments_installer_read on public.site_attachments;
create policy site_attachments_installer_read on public.site_attachments
  for select using (
    public.company_is_active(company_id)
    and exists (
      select 1
      from public.work_orders w
      where w.site_id = site_attachments.site_id
        and w.company_id = site_attachments.company_id
        and w.assigned_installer_id = auth.uid()
    )
  );

drop policy if exists order_incidents_installer_read on public.order_incidents;
create policy order_incidents_installer_read on public.order_incidents
  for select using (
    public.company_is_active(company_id)
    and exists (
      select 1
      from public.work_orders w
      where w.id = order_id
        and w.company_id = order_incidents.company_id
        and w.assigned_installer_id = auth.uid()
    )
  );

drop policy if exists order_incidents_installer_insert on public.order_incidents;
create policy order_incidents_installer_insert on public.order_incidents
  for insert with check (
    created_by = auth.uid()
    and public.company_is_active(company_id)
    and exists (
      select 1
      from public.work_orders w
      where w.id = order_id
        and w.company_id = order_incidents.company_id
        and w.assigned_installer_id = auth.uid()
    )
  );

drop policy if exists installer_weekly_own_all on public.installer_weekly_availability;
create policy installer_weekly_own_all on public.installer_weekly_availability
  for all using (
    installer_id = auth.uid()
    and public.company_is_active(company_id)
    and exists (
      select 1
      from public.company_installers ci
      where ci.company_id = installer_weekly_availability.company_id
        and ci.installer_id = auth.uid()
        and ci.status = 'active'
    )
  )
  with check (
    installer_id = auth.uid()
    and public.company_is_active(company_id)
    and exists (
      select 1
      from public.company_installers ci
      where ci.company_id = installer_weekly_availability.company_id
        and ci.installer_id = auth.uid()
        and ci.status = 'active'
    )
  );

drop policy if exists installer_unavailability_own_all on public.installer_unavailability;
create policy installer_unavailability_own_all on public.installer_unavailability
  for all using (
    installer_id = auth.uid()
    and public.company_is_active(company_id)
    and exists (
      select 1
      from public.company_installers ci
      where ci.company_id = installer_unavailability.company_id
        and ci.installer_id = auth.uid()
        and ci.status = 'active'
    )
  )
  with check (
    installer_id = auth.uid()
    and public.company_is_active(company_id)
    and exists (
      select 1
      from public.company_installers ci
      where ci.company_id = installer_unavailability.company_id
        and ci.installer_id = auth.uid()
        and ci.status = 'active'
    )
  );

drop policy if exists announcements_installer_read on public.announcements;
create policy announcements_installer_read on public.announcements
  for select using (
    public.company_is_active(company_id)
    and company_id in (select public.auth_companies())
  );

drop policy if exists broadcast_apps_installer_read on public.broadcast_applications;
create policy broadcast_apps_installer_read on public.broadcast_applications
  for select using (
    installer_id = auth.uid()
    and exists (
      select 1
      from public.broadcasts b
      where b.id = broadcast_id
        and public.company_is_active(b.company_id)
    )
  );

drop policy if exists chat_threads_installer_read on public.chat_threads;
create policy chat_threads_installer_read on public.chat_threads
  for select using (
    installer_id = auth.uid()
    and public.company_is_active(company_id)
  );

drop policy if exists chat_threads_installer_insert on public.chat_threads;
create policy chat_threads_installer_insert on public.chat_threads
  for insert with check (
    installer_id = auth.uid()
    and public.company_is_active(company_id)
    and exists (
      select 1
      from public.company_installers ci
      where ci.company_id = chat_threads.company_id
        and ci.installer_id = auth.uid()
        and ci.status = 'active'
    )
  );

drop policy if exists chat_messages_installer_read on public.chat_messages;
create policy chat_messages_installer_read on public.chat_messages
  for select using (
    public.company_is_active(company_id)
    and exists (
      select 1
      from public.chat_threads t
      where t.id = thread_id
        and t.company_id = chat_messages.company_id
        and t.installer_id = auth.uid()
    )
  );

drop policy if exists chat_messages_installer_insert on public.chat_messages;
create policy chat_messages_installer_insert on public.chat_messages
  for insert with check (
    sender_id = auth.uid()
    and public.company_is_active(company_id)
    and exists (
      select 1
      from public.chat_threads t
      where t.id = thread_id
        and t.company_id = chat_messages.company_id
        and t.installer_id = auth.uid()
    )
  );

drop policy if exists chat_reads_own_all on public.chat_message_reads;
create policy chat_reads_own_all on public.chat_message_reads
  for all using (
    user_id = auth.uid()
    and public.company_is_active(company_id)
  )
  with check (
    user_id = auth.uid()
    and public.company_is_active(company_id)
    and (
      company_id = public.auth_company()
      or company_id in (select public.auth_companies())
      or exists (
        select 1
        from public.chat_messages m
        join public.chat_threads t on t.id = m.thread_id
        where m.id = message_id
          and t.company_id = chat_message_reads.company_id
          and t.installer_id = auth.uid()
      )
    )
  );

drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications
  for all using (
    user_id = auth.uid()
    and (
      nullif(data ->> 'company_id', '') is null
      or public.company_path_is_active(data ->> 'company_id')
    )
  )
  with check (
    user_id = auth.uid()
    and (
      nullif(data ->> 'company_id', '') is null
      or public.company_path_is_active(data ->> 'company_id')
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Storage tenant: la rama de dueño/asignado tampoco saltea suspensión.
-- ---------------------------------------------------------------------------

drop policy if exists evidence_upload on storage.objects;
create policy evidence_upload on storage.objects
  for insert
  with check (
    bucket_id = 'evidence'
    and auth.uid() is not null
    and public.company_path_is_active((storage.foldername(name))[1])
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
    and public.company_path_is_active((storage.foldername(name))[1])
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

drop policy if exists chat_storage_upload on storage.objects;
create policy chat_storage_upload on storage.objects
  for insert
  with check (
    bucket_id = 'chat'
    and auth.uid() is not null
    and public.company_path_is_active((storage.foldername(name))[1])
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
    and public.company_path_is_active((storage.foldername(name))[1])
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

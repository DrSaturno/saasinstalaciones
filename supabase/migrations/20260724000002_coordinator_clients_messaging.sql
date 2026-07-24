-- Coordinadores, cartera de clientes, mensajería oficial y mejoras operativas.

-- ---------------------------------------------------------------------------
-- Roles e invitaciones
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('platform_admin', 'company_manager', 'coordinator', 'installer'));

alter table public.profiles drop constraint if exists manager_has_company;
alter table public.profiles
  add constraint company_roles_have_company
  check (role not in ('company_manager', 'coordinator') or company_id is not null);

alter table public.invitations
  add column role text not null default 'installer'
  check (role in ('installer', 'coordinator'));

drop function if exists public.invitation_preview(uuid);
create function public.invitation_preview(p_token uuid)
returns table (
  company_name text,
  email text,
  valid boolean,
  invite_role text,
  company_id uuid
)
language sql security definer
set search_path = public
as $$
  select
    c.name,
    i.email,
    (i.status = 'pending' and i.expires_at > now()),
    i.role,
    i.company_id
  from public.invitations i
  join public.companies c on c.id = i.company_id
  where i.token = p_token;
$$;
grant execute on function public.invitation_preview(uuid) to anon, authenticated;

create or replace function public.accept_invitation(p_token uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_inv public.invitations;
begin
  select * into v_inv from public.invitations
  where token = p_token and status = 'pending' and expires_at > now();
  if not found then
    raise exception 'Invitación inválida o vencida';
  end if;
  if public.auth_role() is distinct from v_inv.role then
    raise exception 'La invitación no corresponde al rol de esta cuenta';
  end if;

  if v_inv.role = 'installer' then
    insert into public.company_installers (company_id, installer_id, status, joined_at)
    values (v_inv.company_id, auth.uid(), 'active', now())
    on conflict (company_id, installer_id)
    do update set status = 'active', joined_at = now();
  elsif public.auth_company() is distinct from v_inv.company_id then
    raise exception 'La cuenta no pertenece a la empresa invitante';
  end if;

  update public.invitations set status = 'accepted' where id = v_inv.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Clientes y responsables de proyecto
-- ---------------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 150),
  tax_id text not null default '',
  contact_name text not null default '',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);
create index clients_company_name_idx on public.clients(company_id, name);

alter table public.projects
  add column client_id uuid references public.clients(id) on delete set null,
  add column coordinator_id uuid references public.profiles(id) on delete set null;
create index projects_coordinator_idx
  on public.projects(company_id, coordinator_id) where coordinator_id is not null;

insert into public.clients (company_id, name)
select distinct company_id, trim(client_name)
from public.projects
where nullif(trim(client_name), '') is not null
on conflict (company_id, name) do nothing;

update public.projects p
set client_id = c.id
from public.clients c
where c.company_id = p.company_id and c.name = trim(p.client_name);

create or replace function public.validate_project_relations()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.client_id is not null and not exists (
    select 1 from public.clients c
    where c.id = new.client_id and c.company_id = new.company_id
  ) then
    raise exception 'El cliente no pertenece a la empresa';
  end if;
  if new.coordinator_id is not null and not exists (
    select 1 from public.profiles p
    where p.id = new.coordinator_id
      and p.company_id = new.company_id
      and p.role = 'coordinator'
  ) then
    raise exception 'El coordinador no pertenece a la empresa';
  end if;
  return new;
end;
$$;
create trigger projects_validate_relations
  before insert or update of company_id, client_id, coordinator_id on public.projects
  for each row execute function public.validate_project_relations();

create or replace function public.can_operate_project(p_project_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and p.company_id = public.auth_company()
      and (
        public.auth_role() = 'company_manager'
        or (public.auth_role() = 'coordinator' and p.coordinator_id = auth.uid())
      )
  );
$$;
revoke all on function public.can_operate_project(uuid) from public;
grant execute on function public.can_operate_project(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Locaciones pendientes y bolsa de trabajo ampliada
-- ---------------------------------------------------------------------------
alter table public.sites
  add column is_placeholder boolean not null default false;

alter table public.broadcasts
  add column scheduled_date date,
  add column scheduled_end_date date,
  add column requirements text not null default '',
  add column logistics_notes text not null default '',
  add column pay_visible boolean not null default false,
  add column pay_amount numeric(14,2),
  add column currency text not null default 'ARS'
    check (currency in ('ARS', 'BRL')),
  add constraint broadcasts_pay_check
    check (pay_amount is null or pay_amount >= 0),
  add constraint broadcasts_schedule_check
    check (scheduled_end_date is null or scheduled_date is null or scheduled_end_date >= scheduled_date);

-- ---------------------------------------------------------------------------
-- Canal oficial empresa ↔ instalador
-- ---------------------------------------------------------------------------
create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  installer_id uuid not null references public.installers(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (company_id, installer_id)
);
create index chat_threads_company_recent_idx
  on public.chat_threads(company_id, last_message_at desc);

create table public.chat_messages (
  id uuid primary key,
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 4000),
  attachments jsonb not null default '[]'::jsonb,
  reply_to_id uuid references public.chat_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  check (char_length(trim(body)) > 0 or jsonb_array_length(attachments) > 0)
);
create index chat_messages_thread_idx
  on public.chat_messages(thread_id, created_at);

create table public.chat_message_reads (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

insert into public.chat_threads (company_id, installer_id)
select company_id, installer_id
from public.company_installers
where status = 'active'
on conflict (company_id, installer_id) do nothing;

create or replace function public.accept_invitation(p_token uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_inv public.invitations;
begin
  select * into v_inv from public.invitations
  where token = p_token and status = 'pending' and expires_at > now();
  if not found then raise exception 'Invitación inválida o vencida'; end if;
  if public.auth_role() is distinct from v_inv.role then
    raise exception 'La invitación no corresponde al rol de esta cuenta';
  end if;
  if v_inv.role = 'installer' then
    insert into public.company_installers (company_id, installer_id, status, joined_at)
    values (v_inv.company_id, auth.uid(), 'active', now())
    on conflict (company_id, installer_id)
    do update set status = 'active', joined_at = now();
    insert into public.chat_threads (company_id, installer_id)
    values (v_inv.company_id, auth.uid())
    on conflict (company_id, installer_id) do nothing;
  elsif public.auth_company() is distinct from v_inv.company_id then
    raise exception 'La cuenta no pertenece a la empresa invitante';
  end if;
  update public.invitations set status = 'accepted' where id = v_inv.id;
end;
$$;

create or replace function public.touch_chat_thread()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.chat_threads t
    where t.id = new.thread_id
      and t.company_id = new.company_id
      and (
        (public.auth_role() in ('company_manager', 'coordinator')
          and t.company_id = public.auth_company())
        or (public.auth_role() = 'installer' and t.installer_id = auth.uid())
      )
  ) then
    raise exception 'El mensaje no pertenece a una conversación habilitada';
  end if;
  if new.sender_id is distinct from auth.uid() then
    raise exception 'El remitente no coincide con la sesión';
  end if;
  update public.chat_threads
    set last_message_at = greatest(last_message_at, new.created_at)
    where id = new.thread_id;
  return new;
end;
$$;
create trigger chat_messages_touch_thread
  before insert on public.chat_messages
  for each row execute function public.touch_chat_thread();

insert into storage.buckets (id, name, public)
values ('chat', 'chat', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.clients enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_message_reads enable row level security;

create policy clients_company_operators_all on public.clients
  for all using (
    public.auth_role() in ('company_manager', 'coordinator')
    and company_id = public.auth_company()
  )
  with check (
    public.auth_role() in ('company_manager', 'coordinator')
    and company_id = public.auth_company()
  );

create policy profiles_company_operators_read on public.profiles
  for select using (
    public.auth_role() in ('company_manager', 'coordinator')
    and company_id = public.auth_company()
  );

create policy invitations_coordinator_read on public.invitations
  for select using (
    public.auth_role() = 'coordinator'
    and company_id = public.auth_company()
  );

create policy projects_coordinator_all on public.projects
  for all using (
    public.auth_role() = 'coordinator'
    and company_id = public.auth_company()
    and coordinator_id = auth.uid()
  )
  with check (
    public.auth_role() = 'coordinator'
    and company_id = public.auth_company()
    and coordinator_id = auth.uid()
  );

create policy sites_coordinator_all on public.sites
  for all using (
    public.auth_role() = 'coordinator'
    and company_id = public.auth_company()
    and public.can_operate_project(project_id)
  )
  with check (
    company_id = public.auth_company()
    and public.can_operate_project(project_id)
  );

create policy work_orders_coordinator_all on public.work_orders
  for all using (
    public.auth_role() = 'coordinator'
    and company_id = public.auth_company()
    and public.can_operate_project(project_id)
  )
  with check (
    company_id = public.auth_company()
    and public.can_operate_project(project_id)
  );

create policy order_updates_coordinator_all on public.order_updates
  for all using (
    public.auth_role() = 'coordinator'
    and company_id = public.auth_company()
    and exists (
      select 1 from public.work_orders w
      where w.id = order_id and public.can_operate_project(w.project_id)
    )
  )
  with check (
    company_id = public.auth_company()
    and exists (
      select 1 from public.work_orders w
      where w.id = order_id and public.can_operate_project(w.project_id)
    )
  );

create policy broadcasts_coordinator_all on public.broadcasts
  for all using (
    public.auth_role() = 'coordinator'
    and company_id = public.auth_company()
    and project_id is not null
    and public.can_operate_project(project_id)
  )
  with check (
    company_id = public.auth_company()
    and project_id is not null
    and public.can_operate_project(project_id)
  );

create policy company_installers_coordinator_read on public.company_installers
  for select using (
    public.auth_role() = 'coordinator'
    and company_id = public.auth_company()
  );

create policy installer_weekly_coordinator_read on public.installer_weekly_availability
  for select using (
    public.auth_role() = 'coordinator'
    and company_id = public.auth_company()
  );
create policy installer_unavailability_coordinator_read on public.installer_unavailability
  for select using (
    public.auth_role() = 'coordinator'
    and company_id = public.auth_company()
  );

create policy site_attachments_coordinator_all on public.site_attachments
  for all using (
    public.auth_role() = 'coordinator'
    and company_id = public.auth_company()
    and exists (
      select 1 from public.sites s
      where s.id = site_id and public.can_operate_project(s.project_id)
    )
  )
  with check (
    company_id = public.auth_company()
    and exists (
      select 1 from public.sites s
      where s.id = site_id and public.can_operate_project(s.project_id)
    )
  );

create policy order_attachments_coordinator_all on public.order_attachments
  for all using (
    public.auth_role() = 'coordinator'
    and company_id = public.auth_company()
    and exists (
      select 1 from public.work_orders w
      where w.id = order_id and public.can_operate_project(w.project_id)
    )
  )
  with check (
    company_id = public.auth_company()
    and exists (
      select 1 from public.work_orders w
      where w.id = order_id and public.can_operate_project(w.project_id)
    )
  );

create policy order_incidents_coordinator_all on public.order_incidents
  for all using (
    public.auth_role() = 'coordinator'
    and company_id = public.auth_company()
    and exists (
      select 1 from public.work_orders w
      where w.id = order_id and public.can_operate_project(w.project_id)
    )
  )
  with check (
    company_id = public.auth_company()
    and exists (
      select 1 from public.work_orders w
      where w.id = order_id and public.can_operate_project(w.project_id)
    )
  );

create policy ratings_coordinator_insert on public.ratings
  for insert with check (
    public.auth_role() = 'coordinator'
    and company_id = public.auth_company()
    and exists (
      select 1 from public.work_orders w
      where w.id = order_id
        and w.status = 'finalizada'
        and public.can_operate_project(w.project_id)
    )
  );

create policy chat_threads_company_read on public.chat_threads
  for select using (
    public.auth_role() in ('company_manager', 'coordinator')
    and company_id = public.auth_company()
  );
create policy chat_threads_company_insert on public.chat_threads
  for insert with check (
    public.auth_role() in ('company_manager', 'coordinator')
    and company_id = public.auth_company()
  );
create policy chat_threads_installer_read on public.chat_threads
  for select using (installer_id = auth.uid());
create policy chat_threads_installer_insert on public.chat_threads
  for insert with check (
    installer_id = auth.uid()
    and exists (
      select 1 from public.company_installers ci
      where ci.company_id = chat_threads.company_id
        and ci.installer_id = auth.uid()
        and ci.status = 'active'
    )
  );

create policy chat_messages_company_read on public.chat_messages
  for select using (
    public.auth_role() in ('company_manager', 'coordinator')
    and company_id = public.auth_company()
  );
create policy chat_messages_company_insert on public.chat_messages
  for insert with check (
    public.auth_role() in ('company_manager', 'coordinator')
    and company_id = public.auth_company()
    and sender_id = auth.uid()
  );
create policy chat_messages_installer_read on public.chat_messages
  for select using (
    exists (
      select 1 from public.chat_threads t
      where t.id = thread_id and t.installer_id = auth.uid()
    )
  );
create policy chat_messages_installer_insert on public.chat_messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.chat_threads t
      where t.id = thread_id and t.installer_id = auth.uid()
    )
  );

create policy chat_reads_own_all on public.chat_message_reads
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      company_id = public.auth_company()
      or exists (
        select 1 from public.chat_messages m
        join public.chat_threads t on t.id = m.thread_id
        where m.id = message_id
          and t.company_id = chat_message_reads.company_id
          and t.installer_id = auth.uid()
      )
    )
  );

create policy chat_storage_upload on storage.objects
  for insert with check (
    bucket_id = 'chat'
    and auth.uid() is not null
    and (
      (storage.foldername(name))[1] = public.auth_company()::text
      or exists (
        select 1 from public.chat_threads t
        where t.id = ((storage.foldername(name))[2])::uuid
          and t.company_id::text = (storage.foldername(name))[1]
          and t.installer_id = auth.uid()
      )
    )
  );
create policy chat_storage_read on storage.objects
  for select using (
    bucket_id = 'chat'
    and (
      (storage.foldername(name))[1] = public.auth_company()::text
      or owner = auth.uid()
      or exists (
        select 1 from public.chat_threads t
        where t.id = ((storage.foldername(name))[2])::uuid
          and t.installer_id = auth.uid()
      )
    )
  );

-- Las RPC históricas de la bolsa también aceptan al coordinador, siempre que
-- la búsqueda pertenezca a uno de sus proyectos.
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
  v_status text;
  v_accepted integer;
  v_requested integer := coalesce(cardinality(p_order_ids), 0);
  v_updated integer;
begin
  if public.auth_role() not in ('company_manager', 'coordinator') then
    raise exception 'Acceso denegado';
  end if;
  select * into v_broadcast from public.broadcasts b
  where b.id = p_broadcast_id
    and b.company_id = public.auth_company()
    and (
      public.auth_role() = 'company_manager'
      or (b.project_id is not null and public.can_operate_project(b.project_id))
    )
  for update;
  if not found then raise exception 'Búsqueda no encontrada'; end if;
  if v_broadcast.status <> 'open' then raise exception 'La búsqueda está cerrada'; end if;

  select status into v_status from public.broadcast_applications
  where broadcast_id = p_broadcast_id and installer_id = p_installer_id
  for update;
  if not found then raise exception 'Postulación no encontrada'; end if;
  if v_status = 'accepted' then return; end if;
  if v_status <> 'applied' then raise exception 'La postulación ya fue resuelta'; end if;

  select count(*) into v_accepted from public.broadcast_applications
  where broadcast_id = p_broadcast_id and status = 'accepted';
  if v_accepted >= v_broadcast.slots then raise exception 'No quedan cupos'; end if;

  if v_requested > 0 then
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

  insert into public.company_installers(company_id, installer_id, status, joined_at)
  values(v_broadcast.company_id, p_installer_id, 'active', now())
  on conflict(company_id, installer_id) do update
    set status = 'active', joined_at = coalesce(company_installers.joined_at, now());
  insert into public.chat_threads(company_id, installer_id)
  values(v_broadcast.company_id, p_installer_id)
  on conflict(company_id, installer_id) do nothing;
  update public.broadcast_applications set status = 'accepted'
  where broadcast_id = p_broadcast_id and installer_id = p_installer_id;
  insert into public.notifications(user_id, type, title, body, data)
  values(
    p_installer_id,
    'application_accepted',
    'Postulación aceptada',
    'Te sumaron al equipo para ' || v_broadcast.title,
    jsonb_build_object('url', '/jobs', 'broadcast_id', p_broadcast_id)
  );

  if v_accepted + 1 >= v_broadcast.slots then
    insert into public.notifications(user_id, type, title, body, data)
    select installer_id, 'application_rejected', 'Postulación no seleccionada',
      'Se completaron los cupos para ' || v_broadcast.title,
      jsonb_build_object('url', '/jobs', 'broadcast_id', p_broadcast_id)
    from public.broadcast_applications
    where broadcast_id = p_broadcast_id and status = 'applied';
    update public.broadcasts set status = 'closed' where id = p_broadcast_id;
    update public.broadcast_applications set status = 'rejected'
    where broadcast_id = p_broadcast_id and status = 'applied';
  end if;
end;
$$;

create or replace function public.reject_broadcast_application(
  p_broadcast_id uuid,
  p_installer_id uuid
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare v_broadcast public.broadcasts%rowtype;
begin
  if public.auth_role() not in ('company_manager', 'coordinator') then
    raise exception 'Acceso denegado';
  end if;
  select * into v_broadcast from public.broadcasts b
  where b.id = p_broadcast_id
    and b.company_id = public.auth_company()
    and (
      public.auth_role() = 'company_manager'
      or (b.project_id is not null and public.can_operate_project(b.project_id))
    );
  if not found then raise exception 'Búsqueda no encontrada'; end if;
  update public.broadcast_applications set status = 'rejected'
  where broadcast_id = p_broadcast_id
    and installer_id = p_installer_id
    and status = 'applied';
  if not found then raise exception 'La postulación ya fue resuelta'; end if;
  insert into public.notifications(user_id, type, title, body, data)
  values(
    p_installer_id,
    'application_rejected',
    'Postulación no seleccionada',
    'La empresa avanzó con otra opción para ' || v_broadcast.title,
    jsonb_build_object('url', '/jobs', 'broadcast_id', p_broadcast_id)
  );
end;
$$;

create or replace function public.close_broadcast(p_broadcast_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare v_broadcast public.broadcasts%rowtype;
begin
  if public.auth_role() not in ('company_manager', 'coordinator') then
    raise exception 'Acceso denegado';
  end if;
  select * into v_broadcast from public.broadcasts b
  where b.id = p_broadcast_id
    and b.company_id = public.auth_company()
    and (
      public.auth_role() = 'company_manager'
      or (b.project_id is not null and public.can_operate_project(b.project_id))
    )
  for update;
  if not found then raise exception 'Búsqueda no encontrada'; end if;
  if v_broadcast.status = 'closed' then return; end if;
  insert into public.notifications(user_id, type, title, body, data)
  select installer_id, 'application_rejected', 'Búsqueda cerrada',
    v_broadcast.title || ' ya no recibe postulaciones.',
    jsonb_build_object('url', '/jobs', 'broadcast_id', p_broadcast_id)
  from public.broadcast_applications
  where broadcast_id = p_broadcast_id and status = 'applied';
  update public.broadcast_applications set status = 'rejected'
  where broadcast_id = p_broadcast_id and status = 'applied';
  update public.broadcasts set status = 'closed' where id = p_broadcast_id;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end;
$$;

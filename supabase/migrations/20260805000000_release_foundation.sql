-- Foundation for gradual SDD releases. Flags are tenant-scoped and disabled
-- by default; writes are reserved for the service role / platform operations.

create table if not exists public.feature_flags (
  key text primary key check (key ~ '^[a-z0-9_]{3,80}$'),
  description text not null,
  default_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.company_feature_flags (
  company_id uuid not null references public.companies (id) on delete cascade,
  flag_key text not null references public.feature_flags (key) on delete restrict,
  enabled boolean not null,
  configured_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (company_id, flag_key)
);

create table if not exists public.feature_flag_events (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  flag_key text not null references public.feature_flags (key) on delete restrict,
  enabled boolean not null,
  actor_id uuid references public.profiles (id) on delete set null,
  occurred_at timestamptz not null default now()
);

create index if not exists feature_flag_events_company_time_idx
  on public.feature_flag_events (company_id, occurred_at desc);

insert into public.feature_flags (key, description) values
  ('roles_v2', 'Normalized multi-role memberships'),
  ('locations_v2', 'Canonical reusable locations'),
  ('activities_agenda_v2', 'Activities, surveys and conflict-safe agenda'),
  ('opportunities_v2', 'Pre-project opportunities and quotations'),
  ('field_commands_v2', 'Versioned field commands and offline receipts'),
  ('reliability_shadow_v1', 'Cancellation reliability projection in shadow mode'),
  ('finance_ledger_v2', 'Event-based private finance ledger'),
  ('order_chat_v2', 'Order-scoped chat, media and search'),
  ('dashboard_v2', 'Reconciled event-based dashboard')
on conflict (key) do update set description = excluded.description;

create or replace function public.audit_company_feature_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.enabled is distinct from old.enabled then
    insert into public.feature_flag_events (
      company_id, flag_key, enabled, actor_id
    ) values (
      new.company_id, new.flag_key, new.enabled, auth.uid()
    );
  end if;
  new.configured_by := coalesce(auth.uid(), new.configured_by);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists company_feature_flags_audit
  on public.company_feature_flags;
create trigger company_feature_flags_audit
before insert or update on public.company_feature_flags
for each row execute function public.audit_company_feature_flag();

alter table public.feature_flags enable row level security;
alter table public.company_feature_flags enable row level security;
alter table public.feature_flag_events enable row level security;

drop policy if exists feature_flags_authenticated_read on public.feature_flags;
create policy feature_flags_authenticated_read
  on public.feature_flags for select to authenticated using (true);

drop policy if exists company_feature_flags_member_read
  on public.company_feature_flags;
create policy company_feature_flags_member_read
  on public.company_feature_flags for select to authenticated
  using (
    company_id = public.auth_company()
    or company_id in (select public.auth_companies(null))
  );

drop policy if exists feature_flag_events_manager_read
  on public.feature_flag_events;
create policy feature_flag_events_manager_read
  on public.feature_flag_events for select to authenticated
  using (company_id = public.auth_company());

revoke insert, update, delete on public.feature_flags from authenticated;
revoke insert, update, delete on public.company_feature_flags from authenticated;
revoke insert, update, delete on public.feature_flag_events from authenticated;
grant select on public.feature_flags to authenticated;
grant select on public.company_feature_flags to authenticated;
grant select on public.feature_flag_events to authenticated;

create or replace function public.feature_enabled(
  p_flag_key text,
  p_company_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with requested as (
    select coalesce(p_company_id, public.auth_company()) as company_id
  ), authorized as (
    select r.company_id
    from requested r
    where r.company_id is not null
      and (
        r.company_id = public.auth_company()
        or r.company_id in (select public.auth_companies(null))
        or public.auth_role() = 'platform_admin'
      )
  )
  select coalesce(cff.enabled, ff.default_enabled, false)
  from public.feature_flags ff
  left join authorized a on true
  left join public.company_feature_flags cff
    on cff.company_id = a.company_id
   and cff.flag_key = ff.key
  where ff.key = p_flag_key
    and (a.company_id is not null or public.auth_role() = 'platform_admin')
$$;

revoke all on function public.feature_enabled(text, uuid) from public;
grant execute on function public.feature_enabled(text, uuid) to authenticated;

comment on table public.company_feature_flags is
  'Tenant-scoped rollout flags. Mutated only by trusted platform operations.';

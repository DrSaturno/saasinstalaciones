-- R3 - Activities, surveys, private agenda and notification kernel.
--
-- This migration is additive. `work_orders` remains the legacy container and
-- projection while exact scheduling moves to activities/assignments. Legacy
-- dates are explicitly marked `unknown`: no time slot or approval is invented.

-- ---------------------------------------------------------------------------
-- 1. Work activities and versioned survey records
-- ---------------------------------------------------------------------------

create table public.work_activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  work_order_id uuid not null,
  activity_type text not null
    check (activity_type in ('survey', 'execution')),
  position smallint not null default 1 check (position > 0),
  lifecycle text not null default 'draft' check (lifecycle in (
    'draft', 'scheduled', 'in_progress', 'submitted', 'changes_requested',
    'approved', 'completed', 'cancelled'
  )),
  prerequisite_activity_id uuid,
  prerequisite_waived_at timestamptz,
  prerequisite_waived_reason text,
  template_version integer not null default 1 check (template_version > 0),
  checklist_definition jsonb not null default '[]'::jsonb,
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  timezone text not null default 'America/Argentina/Buenos_Aires',
  schedule_precision text not null default 'unknown'
    check (schedule_precision in ('unknown', 'day', 'exact')),
  legacy_scheduled_date date,
  legacy_scheduled_end_date date,
  estimated_duration_minutes integer
    check (estimated_duration_minutes is null or estimated_duration_minutes > 0),
  version integer not null default 1 check (version > 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_activities_order_company_fk
    foreign key (work_order_id, company_id)
    references public.work_orders (id, company_id) on delete cascade,
  constraint work_activities_id_company_key unique (id, company_id),
  constraint work_activities_order_type_position_key
    unique (work_order_id, activity_type, position),
  constraint work_activities_schedule_pair_check check (
    (scheduled_start_at is null and scheduled_end_at is null)
    or (
      scheduled_start_at is not null
      and scheduled_end_at is not null
      and scheduled_end_at > scheduled_start_at
    )
  ),
  constraint work_activities_exact_schedule_check check (
    schedule_precision <> 'exact'
    or (scheduled_start_at is not null and scheduled_end_at is not null)
  ),
  constraint work_activities_legacy_dates_check check (
    legacy_scheduled_end_date is null
    or legacy_scheduled_date is null
    or legacy_scheduled_end_date >= legacy_scheduled_date
  ),
  constraint work_activities_prerequisite_waiver_check check (
    (prerequisite_waived_at is null and prerequisite_waived_reason is null)
    or (
      prerequisite_waived_at is not null
      and char_length(trim(prerequisite_waived_reason)) between 10 and 500
    )
  )
);

alter table public.work_activities
  add constraint work_activities_prerequisite_company_fk
  foreign key (prerequisite_activity_id, company_id)
  references public.work_activities (id, company_id)
  on delete restrict;

create index work_activities_order_idx
  on public.work_activities (work_order_id, position);
create index work_activities_company_lifecycle_idx
  on public.work_activities (company_id, lifecycle, activity_type);
create index work_activities_exact_schedule_idx
  on public.work_activities (company_id, scheduled_start_at, scheduled_end_at)
  where schedule_precision = 'exact';

create table public.survey_submissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  activity_id uuid not null,
  version integer not null check (version > 0),
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'changes_requested', 'approved')),
  author_id uuid references public.profiles (id) on delete set null,
  form_data jsonb not null default '{}'::jsonb,
  measurements jsonb not null default '{}'::jsonb,
  checklist_responses jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  notes text not null default '',
  content_hash text,
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  source_order_update_id uuid unique
    references public.order_updates (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint survey_submissions_activity_company_fk
    foreign key (activity_id, company_id)
    references public.work_activities (id, company_id) on delete cascade,
  constraint survey_submissions_id_company_key unique (id, company_id),
  constraint survey_submissions_activity_version_key unique (activity_id, version),
  constraint survey_submissions_author_or_legacy_check check (
    author_id is not null or source_order_update_id is not null
  ),
  constraint survey_submissions_review_shape_check check (
    (status <> 'approved')
    or (
      approved_by is not null
      and approved_at is not null
      and approved_by is distinct from author_id
    )
  )
);

create unique index survey_submissions_one_draft_idx
  on public.survey_submissions (activity_id)
  where status = 'draft';
create index survey_submissions_company_status_idx
  on public.survey_submissions (company_id, status, updated_at desc);

create table public.survey_submission_decisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  submission_id uuid not null,
  operation_id uuid not null unique,
  correlation_id uuid not null,
  decision text not null check (decision in ('approved', 'changes_requested')),
  reason text not null default '',
  reviewer_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint survey_decisions_submission_company_fk
    foreign key (submission_id, company_id)
    references public.survey_submissions (id, company_id) on delete cascade,
  constraint survey_decisions_changes_reason_check check (
    decision <> 'changes_requested'
    or char_length(trim(reason)) between 3 and 1000
  )
);

create index survey_submission_decisions_submission_idx
  on public.survey_submission_decisions (submission_id, created_at);

-- ---------------------------------------------------------------------------
-- 2. Versioned assignments and private global availability
-- ---------------------------------------------------------------------------

create table public.work_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  activity_id uuid not null,
  installer_id uuid not null references public.installers (id) on delete restrict,
  version integer not null check (version > 0),
  status text not null default 'active' check (status in (
    'offered', 'active', 'accepted', 'completed', 'replaced', 'cancelled'
  )),
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  timezone text not null default 'America/Argentina/Buenos_Aires',
  schedule_precision text not null default 'unknown'
    check (schedule_precision in ('unknown', 'day', 'exact')),
  legacy_scheduled_date date,
  legacy_scheduled_end_date date,
  schedule_range tstzrange generated always as (
    case
      when schedule_precision = 'exact'
        and scheduled_start_at is not null
        and scheduled_end_at is not null
      then tstzrange(scheduled_start_at, scheduled_end_at, '[)')
      else null
    end
  ) stored,
  terms_snapshot jsonb not null default '{}'::jsonb,
  compensation_snapshot jsonb not null default '{}'::jsonb,
  accepted_at timestamptz,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  replaces_assignment_id uuid references public.work_assignments (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  correlation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_assignments_activity_company_fk
    foreign key (activity_id, company_id)
    references public.work_activities (id, company_id) on delete cascade,
  constraint work_assignments_id_company_key unique (id, company_id),
  constraint work_assignments_activity_version_key unique (activity_id, version),
  constraint work_assignments_schedule_pair_check check (
    (scheduled_start_at is null and scheduled_end_at is null)
    or (
      scheduled_start_at is not null
      and scheduled_end_at is not null
      and scheduled_end_at > scheduled_start_at
    )
  ),
  constraint work_assignments_exact_schedule_check check (
    schedule_precision <> 'exact'
    or (scheduled_start_at is not null and scheduled_end_at is not null)
  ),
  constraint work_assignments_validity_check check (
    valid_until is null or valid_until >= valid_from
  )
);

create unique index work_assignments_one_current_idx
  on public.work_assignments (activity_id)
  where status in ('offered', 'active', 'accepted');
create index work_assignments_installer_status_idx
  on public.work_assignments (installer_id, status, scheduled_start_at);
create index work_assignments_schedule_range_idx
  on public.work_assignments using gist (schedule_range)
  where schedule_range is not null
    and status in ('offered', 'active', 'accepted');

-- `company_id` is provenance/context, required by the tenant convention. The
-- interval itself applies globally to the person and is never readable by a
-- different company. Managers and coordinators only receive an opaque RPC code.
create table public.installer_global_weekly_availability (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  installer_id uuid not null references public.installers (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  timezone text not null default 'America/Argentina/Buenos_Aires',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint installer_global_weekly_time_check check (ends_at > starts_at),
  constraint installer_global_weekly_unique
    unique (installer_id, weekday, starts_at, ends_at, timezone)
);

create index installer_global_weekly_lookup_idx
  on public.installer_global_weekly_availability (installer_id, weekday);

create table public.installer_global_unavailability (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  installer_id uuid not null references public.installers (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null check (char_length(trim(reason)) between 2 and 500),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  source_legacy_unavailability_id uuid unique
    references public.installer_unavailability (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint installer_global_unavailability_time_check check (ends_at > starts_at)
);

create index installer_global_unavailability_lookup_idx
  on public.installer_global_unavailability
  (installer_id, starts_at, ends_at)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- 3. Idempotency receipts, audited overrides and notification outbox
-- ---------------------------------------------------------------------------

create table public.assignment_command_receipts (
  operation_id uuid primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete restrict,
  activity_id uuid not null,
  request_payload jsonb not null,
  available boolean not null,
  reason_code text not null,
  override_allowed boolean not null default false,
  assignment_id uuid references public.work_assignments (id) on delete set null,
  activity_version integer not null,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  constraint assignment_receipts_activity_company_fk
    foreign key (activity_id, company_id)
    references public.work_activities (id, company_id) on delete cascade,
  constraint assignment_receipts_reason_check check (reason_code in (
    'AVAILABLE', 'SCHEDULE_CONFLICT', 'OUTSIDE_AVAILABILITY',
    'TRAVEL_CONFLICT', 'STALE_VERSION', 'NOT_ELIGIBLE',
    'ACTIVITY_CLOSED', 'PREREQUISITE_PENDING'
  ))
);

create index assignment_command_receipts_actor_idx
  on public.assignment_command_receipts (actor_id, created_at desc);

create table public.assignment_override_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  activity_id uuid not null,
  assignment_id uuid not null,
  installer_id uuid not null references public.installers (id) on delete restrict,
  conflict_code text not null check (conflict_code = 'TRAVEL_CONFLICT'),
  reason text not null check (char_length(trim(reason)) between 10 and 1000),
  actor_id uuid not null references public.profiles (id) on delete restrict,
  correlation_id uuid not null unique,
  created_at timestamptz not null default now(),
  constraint assignment_override_activity_company_fk
    foreign key (activity_id, company_id)
    references public.work_activities (id, company_id) on delete cascade,
  constraint assignment_override_assignment_company_fk
    foreign key (assignment_id, company_id)
    references public.work_assignments (id, company_id) on delete cascade
);

alter table public.notifications
  add column if not exists correlation_id uuid,
  add column if not exists dedupe_key text,
  add column if not exists delivered_at timestamptz;

create unique index if not exists notifications_dedupe_key_idx
  on public.notifications (dedupe_key)
  where dedupe_key is not null;

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  recipient_user_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  correlation_id uuid not null,
  dedupe_key text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'delivered', 'dead_letter')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 8 check (max_attempts > 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error_code text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- No usar `notification_outbox_attempts_check`: Postgres ya le dio ese nombre
  -- al check inline de la columna `attempts`, y el nombre colisionaría.
  constraint notification_outbox_attempts_budget_check check (
    attempts <= max_attempts
    or status = 'dead_letter'
  ),
  constraint notification_outbox_delivered_check check (
    status <> 'delivered' or delivered_at is not null
  )
);

create index notification_outbox_pending_idx
  on public.notification_outbox (available_at, created_at)
  where status = 'pending';
create index notification_outbox_correlation_idx
  on public.notification_outbox (correlation_id);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  outbox_id uuid not null references public.notification_outbox (id) on delete cascade,
  notification_id uuid references public.notifications (id) on delete set null,
  recipient_user_id uuid not null references public.profiles (id) on delete cascade,
  channel text not null check (channel in ('in_app', 'email', 'push')),
  idempotency_key text not null unique,
  correlation_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'dead_letter')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 8 check (max_attempts > 0),
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz,
  provider_message_id text,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Mismo motivo que en `notification_outbox`: el check inline de `attempts`
  -- ya ocupa el nombre autogenerado.
  constraint notification_deliveries_attempts_budget_check check (
    attempts <= max_attempts
    or status = 'dead_letter'
  ),
  constraint notification_deliveries_sent_check check (
    status <> 'sent' or delivered_at is not null
  )
);

create index notification_deliveries_pending_idx
  on public.notification_deliveries (next_attempt_at, created_at)
  where status in ('pending', 'failed');
create index notification_deliveries_correlation_idx
  on public.notification_deliveries (correlation_id);

-- ---------------------------------------------------------------------------
-- 4. Domain guards
-- ---------------------------------------------------------------------------

create or replace function public.validate_work_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prerequisite_type text;
  v_prerequisite_order uuid;
begin
  if not exists (
    select 1
    from public.work_orders w
    where w.id = new.work_order_id
      and w.company_id = new.company_id
  ) then
    raise exception 'ACTIVITY_ORDER_MISMATCH';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_timezone_names tz where tz.name = new.timezone
  ) then
    raise exception 'INVALID_TIMEZONE';
  end if;

  if new.prerequisite_activity_id is not null then
    select a.activity_type, a.work_order_id
    into v_prerequisite_type, v_prerequisite_order
    from public.work_activities a
    where a.id = new.prerequisite_activity_id
      and a.company_id = new.company_id;

    if not found
       or v_prerequisite_type <> 'survey'
       or v_prerequisite_order <> new.work_order_id
       or new.activity_type <> 'execution' then
      raise exception 'INVALID_ACTIVITY_PREREQUISITE';
    end if;
  end if;

  if new.activity_type = 'execution'
     and new.lifecycle = 'in_progress'
     and new.prerequisite_activity_id is not null
     and new.prerequisite_waived_at is null
     and not exists (
       select 1
       from public.survey_submissions ss
       where ss.activity_id = new.prerequisite_activity_id
         and ss.company_id = new.company_id
         and ss.status = 'approved'
     ) then
    raise exception 'PREREQUISITE_SURVEY_NOT_APPROVED';
  end if;

  if tg_op = 'UPDATE'
     and auth.uid() is not null
     and current_setting('app.assignment_gate', true) is distinct from 'on'
     and row(
       old.scheduled_start_at,
       old.scheduled_end_at,
       old.timezone,
       old.schedule_precision
     ) is distinct from row(
       new.scheduled_start_at,
       new.scheduled_end_at,
       new.timezone,
       new.schedule_precision
     ) then
    raise exception 'USE_ASSIGNMENT_GATE';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger work_activities_validate
before insert or update on public.work_activities
for each row execute function public.validate_work_activity();

create or replace function public.validate_survey_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity_type text;
  v_expected_version integer;
  v_previous_status text;
begin
  -- `old` sólo existe en UPDATE. Se guarda acá en vez de resolverlo con un
  -- CASE dentro de la condición de un IF: el parser de plpgsql corta la
  -- condición en el primer THEN que encuentra, y el THEN del CASE le desarma
  -- el bloque.
  if tg_op = 'UPDATE' then
    v_previous_status := old.status;
  end if;

  select a.activity_type
  into v_activity_type
  from public.work_activities a
  where a.id = new.activity_id
    and a.company_id = new.company_id
  for update;

  if not found or v_activity_type <> 'survey' then
    raise exception 'SUBMISSION_REQUIRES_SURVEY_ACTIVITY';
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'approved' then
      raise exception 'SURVEY_DECISION_REQUIRED';
    end if;

    if auth.uid() is not null then
      if new.author_id is distinct from auth.uid() then
        raise exception 'SUBMISSION_AUTHOR_MISMATCH';
      end if;

      select coalesce(max(ss.version), 0) + 1
      into v_expected_version
      from public.survey_submissions ss
      where ss.activity_id = new.activity_id;

      if new.version <> v_expected_version then
        raise exception 'SUBMISSION_VERSION_MISMATCH';
      end if;
    end if;
  else
    if row(old.company_id, old.activity_id, old.version, old.author_id)
       is distinct from
       row(new.company_id, new.activity_id, new.version, new.author_id) then
      raise exception 'SUBMISSION_IDENTITY_IMMUTABLE';
    end if;

    if old.status <> 'draft'
       and row(
         old.form_data,
         old.measurements,
         old.checklist_responses,
         old.evidence,
         old.notes,
         old.content_hash
       ) is distinct from row(
         new.form_data,
         new.measurements,
         new.checklist_responses,
         new.evidence,
         new.notes,
         new.content_hash
       ) then
      raise exception 'SUBMITTED_SURVEY_IS_IMMUTABLE';
    end if;

    if auth.uid() is not null
       and old.status = 'draft'
       and new.status in ('draft', 'submitted')
       and old.author_id is distinct from auth.uid() then
      raise exception 'SUBMISSION_AUTHOR_MISMATCH';
    end if;
  end if;

  if new.status = 'submitted' and new.submitted_at is null then
    new.submitted_at := now();
  end if;

  if new.status in ('approved', 'changes_requested')
     and new.status is distinct from v_previous_status then
    if new.reviewed_by is null or new.reviewed_at is null then
      raise exception 'SURVEY_REVIEWER_REQUIRED';
    end if;
    if new.reviewed_by is not distinct from new.author_id then
      raise exception 'SELF_APPROVAL_FORBIDDEN';
    end if;
    if auth.uid() is not null and new.reviewed_by is distinct from auth.uid() then
      raise exception 'SURVEY_REVIEWER_MISMATCH';
    end if;
  end if;

  if new.status = 'approved' then
    if new.approved_by is null or new.approved_at is null then
      raise exception 'SURVEY_APPROVER_REQUIRED';
    end if;
    if new.approved_by is not distinct from new.author_id then
      raise exception 'SELF_APPROVAL_FORBIDDEN';
    end if;
    if auth.uid() is not null and new.approved_by is distinct from auth.uid() then
      raise exception 'SURVEY_APPROVER_MISMATCH';
    end if;
  else
    new.approved_by := null;
    new.approved_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger survey_submissions_validate
before insert or update on public.survey_submissions
for each row execute function public.validate_survey_submission();

create or replace function public.project_survey_submission_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lifecycle text;
begin
  v_lifecycle := case new.status
    when 'submitted' then 'submitted'
    when 'changes_requested' then 'changes_requested'
    when 'approved' then 'approved'
    else null
  end;

  if v_lifecycle is not null then
    update public.work_activities a
    set lifecycle = v_lifecycle,
        version = a.version + 1,
        updated_at = now()
    where a.id = new.activity_id
      and a.company_id = new.company_id
      and a.lifecycle is distinct from v_lifecycle;
  end if;

  return new;
end;
$$;

create trigger survey_submissions_project_status
after insert or update of status on public.survey_submissions
for each row execute function public.project_survey_submission_status();

create or replace function public.validate_global_availability_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'installer_global_weekly_availability'
     and not exists (
       select 1 from pg_catalog.pg_timezone_names tz where tz.name = new.timezone
     ) then
    raise exception 'INVALID_TIMEZONE';
  end if;

  if auth.uid() is not null then
    if new.installer_id is distinct from auth.uid()
       or not public.auth_has_company_role(new.company_id, 'installer') then
      raise exception 'GLOBAL_AVAILABILITY_OWNER_MISMATCH';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger installer_global_weekly_validate
before insert or update on public.installer_global_weekly_availability
for each row execute function public.validate_global_availability_owner();

create trigger installer_global_unavailability_validate
before insert or update on public.installer_global_unavailability
for each row execute function public.validate_global_availability_owner();

-- ---------------------------------------------------------------------------
-- 5. Compatible legacy backfill
-- ---------------------------------------------------------------------------

-- A legacy order in `relevamiento`, or one with survey evidence, receives a
-- survey activity. Existing evidence is submitted history, never approval.
insert into public.work_activities (
  company_id,
  work_order_id,
  activity_type,
  position,
  lifecycle,
  timezone,
  schedule_precision,
  legacy_scheduled_date,
  legacy_scheduled_end_date,
  created_by,
  created_at,
  updated_at
)
select
  w.company_id,
  w.id,
  'survey',
  1,
  case
    when w.status = 'cancelada' then 'cancelled'
    when w.status = 'relevamiento' then 'in_progress'
    else 'submitted'
  end,
  case when c.country = 'BR' then 'America/Sao_Paulo'
       else 'America/Argentina/Buenos_Aires' end,
  'unknown',
  w.scheduled_date,
  w.scheduled_end_date,
  w.created_by,
  w.created_at,
  w.updated_at
from public.work_orders w
join public.companies c on c.id = w.company_id
where w.status = 'relevamiento'
   or exists (
     select 1
     from public.order_updates u
     where u.order_id = w.id and u.type = 'survey'
   )
on conflict (work_order_id, activity_type, position) do nothing;

-- Every non-survey-only legacy order receives an execution activity. If survey
-- evidence exists, it becomes an explicit prerequisite. Already-started legacy
-- work gets a visible waiver instead of a fabricated survey approval.
insert into public.work_activities (
  company_id,
  work_order_id,
  activity_type,
  position,
  lifecycle,
  prerequisite_activity_id,
  prerequisite_waived_at,
  prerequisite_waived_reason,
  timezone,
  schedule_precision,
  legacy_scheduled_date,
  legacy_scheduled_end_date,
  created_by,
  created_at,
  updated_at
)
select
  w.company_id,
  w.id,
  'execution',
  case when survey.id is null then 1 else 2 end,
  case w.status
    when 'pendiente' then 'draft'
    when 'planificada' then 'scheduled'
    when 'en_proceso' then 'in_progress'
    when 'en_revision' then 'submitted'
    when 'finalizada' then 'completed'
    when 'cancelada' then 'cancelled'
    else 'draft'
  end,
  survey.id,
  case when survey.id is not null
             and w.status in ('en_proceso', 'en_revision', 'finalizada')
       then w.updated_at else null end,
  case when survey.id is not null
             and w.status in ('en_proceso', 'en_revision', 'finalizada')
       then 'Legacy execution already started before activity cutover'
       else null end,
  case when c.country = 'BR' then 'America/Sao_Paulo'
       else 'America/Argentina/Buenos_Aires' end,
  'unknown',
  w.scheduled_date,
  w.scheduled_end_date,
  w.created_by,
  w.created_at,
  w.updated_at
from public.work_orders w
join public.companies c on c.id = w.company_id
left join public.work_activities survey
  on survey.work_order_id = w.id
 and survey.activity_type = 'survey'
 and survey.position = 1
where w.status <> 'relevamiento'
on conflict (work_order_id, activity_type, position) do nothing;

-- A defensive fallback guarantees one child for any unexpected legacy status.
insert into public.work_activities (
  company_id,
  work_order_id,
  activity_type,
  position,
  lifecycle,
  timezone,
  schedule_precision,
  legacy_scheduled_date,
  legacy_scheduled_end_date,
  created_by,
  created_at,
  updated_at
)
select
  w.company_id,
  w.id,
  'execution',
  1,
  'draft',
  case when c.country = 'BR' then 'America/Sao_Paulo'
       else 'America/Argentina/Buenos_Aires' end,
  'unknown',
  w.scheduled_date,
  w.scheduled_end_date,
  w.created_by,
  w.created_at,
  w.updated_at
from public.work_orders w
join public.companies c on c.id = w.company_id
where not exists (
  select 1 from public.work_activities a where a.work_order_id = w.id
)
on conflict (work_order_id, activity_type, position) do nothing;

with legacy_surveys as (
  select
    a.id as activity_id,
    a.company_id,
    u.id as update_id,
    coalesce(u.installer_id, w.assigned_installer_id, w.created_by) as author_id,
    u.note,
    u.photos,
    coalesce(u.client_created_at, u.created_at) as submitted_at,
    u.created_at,
    row_number() over (
      partition by a.id
      order by coalesce(u.client_created_at, u.created_at), u.id
    )::integer as submission_version
  from public.work_activities a
  join public.work_orders w on w.id = a.work_order_id
  join public.order_updates u
    on u.order_id = a.work_order_id
   and u.type = 'survey'
  where a.activity_type = 'survey'
)
insert into public.survey_submissions (
  company_id,
  activity_id,
  version,
  status,
  author_id,
  form_data,
  evidence,
  notes,
  submitted_at,
  source_order_update_id,
  created_at,
  updated_at
)
select
  ls.company_id,
  ls.activity_id,
  ls.submission_version,
  'submitted',
  ls.author_id,
  jsonb_build_object(
    'legacy', true,
    'source_order_update_id', ls.update_id
  ),
  coalesce(ls.photos, '[]'::jsonb),
  coalesce(ls.note, ''),
  ls.submitted_at,
  ls.update_id,
  ls.created_at,
  ls.created_at
from legacy_surveys ls
on conflict (source_order_update_id) do nothing;

insert into public.work_assignments (
  company_id,
  activity_id,
  installer_id,
  version,
  status,
  timezone,
  schedule_precision,
  legacy_scheduled_date,
  legacy_scheduled_end_date,
  valid_from,
  valid_until,
  created_by,
  created_at,
  updated_at
)
select
  a.company_id,
  a.id,
  w.assigned_installer_id,
  1,
  case w.status
    when 'finalizada' then 'completed'
    when 'cancelada' then 'cancelled'
    else 'active'
  end,
  a.timezone,
  'unknown',
  w.scheduled_date,
  w.scheduled_end_date,
  coalesce(w.assigned_at, w.created_at),
  case when w.status in ('finalizada', 'cancelada') then w.updated_at else null end,
  w.created_by,
  coalesce(w.assigned_at, w.created_at),
  w.updated_at
from public.work_activities a
join public.work_orders w on w.id = a.work_order_id
where w.assigned_installer_id is not null
on conflict (activity_id, version) do nothing;

-- Existing approved absences become global hard blocks. The original row stays
-- intact as the company-facing compatibility record and audit source.
insert into public.installer_global_unavailability (
  company_id,
  installer_id,
  starts_at,
  ends_at,
  reason,
  status,
  source_legacy_unavailability_id,
  created_at,
  updated_at
)
select
  iu.company_id,
  iu.installer_id,
  iu.starts_at,
  iu.ends_at,
  iu.reason,
  'active',
  iu.id,
  iu.created_at,
  coalesce(iu.reviewed_at, iu.created_at)
from public.installer_unavailability iu
where iu.status = 'approved'
on conflict (source_legacy_unavailability_id) do nothing;

-- ---------------------------------------------------------------------------
-- 6. Authorization helpers (RLS-safe and multi-role aware)
-- ---------------------------------------------------------------------------

create or replace function public.auth_is_company_manager(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.auth_role() = 'company_manager'
     and public.auth_company() = p_company_id
$$;

create or replace function public.auth_can_operate_work_order(
  p_work_order_id uuid,
  p_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.work_orders w
    join public.projects p
      on p.id = w.project_id
     and p.company_id = w.company_id
    where w.id = p_work_order_id
      and w.company_id = p_company_id
      and (
        public.auth_is_company_manager(w.company_id)
        or (
          p.coordinator_id = auth.uid()
          and public.auth_has_company_role(w.company_id, 'coordinator')
        )
      )
  )
$$;

create or replace function public.auth_can_operate_work_activity(p_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.work_activities a
    where a.id = p_activity_id
      and public.auth_can_operate_work_order(a.work_order_id, a.company_id)
  )
$$;

create or replace function public.auth_is_activity_assignee(p_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.work_assignments wa
    join public.companies c on c.id = wa.company_id and c.status = 'active'
    where wa.activity_id = p_activity_id
      and wa.installer_id = auth.uid()
      and wa.status <> 'replaced'
  )
$$;

create or replace function public.auth_can_read_work_activity(p_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.auth_can_operate_work_activity(p_activity_id)
      or public.auth_is_activity_assignee(p_activity_id)
$$;

revoke all on function public.auth_is_company_manager(uuid) from public;
revoke all on function public.auth_can_operate_work_order(uuid, uuid) from public;
revoke all on function public.auth_can_operate_work_activity(uuid) from public;
revoke all on function public.auth_is_activity_assignee(uuid) from public;
revoke all on function public.auth_can_read_work_activity(uuid) from public;
grant execute on function public.auth_is_company_manager(uuid) to authenticated;
grant execute on function public.auth_can_operate_work_order(uuid, uuid) to authenticated;
grant execute on function public.auth_can_operate_work_activity(uuid) to authenticated;
grant execute on function public.auth_is_activity_assignee(uuid) to authenticated;
grant execute on function public.auth_can_read_work_activity(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Durable in-app delivery and survey decisions
-- ---------------------------------------------------------------------------

create or replace function public.persist_in_app_notification(
  p_company_id uuid,
  p_project_id uuid,
  p_recipient_user_id uuid,
  p_event_type text,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_title text,
  p_body text,
  p_data jsonb,
  p_correlation_id uuid,
  p_dedupe_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outbox_id uuid;
  v_notification_id uuid;
begin
  insert into public.notification_outbox (
    company_id,
    project_id,
    recipient_user_id,
    event_type,
    aggregate_type,
    aggregate_id,
    payload,
    correlation_id,
    dedupe_key,
    status,
    attempts,
    delivered_at
  ) values (
    p_company_id,
    p_project_id,
    p_recipient_user_id,
    p_event_type,
    p_aggregate_type,
    p_aggregate_id,
    coalesce(p_data, '{}'::jsonb),
    p_correlation_id,
    p_dedupe_key,
    'delivered',
    1,
    now()
  )
  on conflict (dedupe_key) do nothing
  returning id into v_outbox_id;

  if v_outbox_id is null then
    select o.id
    into v_outbox_id
    from public.notification_outbox o
    where o.dedupe_key = p_dedupe_key;
  end if;

  insert into public.notifications (
    user_id,
    type,
    title,
    body,
    data,
    correlation_id,
    dedupe_key,
    delivered_at
  ) values (
    p_recipient_user_id,
    p_event_type,
    p_title,
    p_body,
    coalesce(p_data, '{}'::jsonb),
    p_correlation_id,
    p_dedupe_key,
    now()
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing
  returning id into v_notification_id;

  if v_notification_id is null then
    select n.id
    into v_notification_id
    from public.notifications n
    where n.dedupe_key = p_dedupe_key;
  end if;

  insert into public.notification_deliveries (
    company_id,
    outbox_id,
    notification_id,
    recipient_user_id,
    channel,
    idempotency_key,
    correlation_id,
    status,
    attempts,
    delivered_at
  ) values (
    p_company_id,
    v_outbox_id,
    v_notification_id,
    p_recipient_user_id,
    'in_app',
    p_dedupe_key || ':in_app',
    p_correlation_id,
    'sent',
    1,
    now()
  )
  on conflict (idempotency_key) do nothing;

  return v_notification_id;
end;
$$;

revoke all on function public.persist_in_app_notification(
  uuid, uuid, uuid, text, text, uuid, text, text, jsonb, uuid, text
) from public;

create or replace function public.validate_survey_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id uuid;
begin
  select ss.author_id
  into v_author_id
  from public.survey_submissions ss
  where ss.id = new.submission_id
    and ss.company_id = new.company_id;

  if not found then
    raise exception 'SURVEY_SUBMISSION_NOT_FOUND';
  end if;
  if new.reviewer_id is not distinct from v_author_id then
    raise exception 'SELF_APPROVAL_FORBIDDEN';
  end if;
  if auth.uid() is not null and new.reviewer_id is distinct from auth.uid() then
    raise exception 'SURVEY_REVIEWER_MISMATCH';
  end if;
  return new;
end;
$$;

create trigger survey_submission_decisions_validate
before insert on public.survey_submission_decisions
for each row execute function public.validate_survey_decision();

create or replace function public.decide_survey_submission(
  p_operation_id uuid,
  p_submission_id uuid,
  p_decision text,
  p_reason text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission public.survey_submissions%rowtype;
  v_existing public.survey_submission_decisions%rowtype;
  v_decision_id uuid;
  v_project_id uuid;
  v_locale text := 'es';
begin
  if auth.uid() is null then
    raise exception 'ACCESS_DENIED';
  end if;
  if p_operation_id is null then
    raise exception 'OPERATION_ID_REQUIRED';
  end if;
  if p_decision not in ('approved', 'changes_requested') then
    raise exception 'INVALID_SURVEY_DECISION';
  end if;
  if p_decision = 'changes_requested'
     and char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'SURVEY_DECISION_REASON_REQUIRED';
  end if;

  select d.*
  into v_existing
  from public.survey_submission_decisions d
  where d.operation_id = p_operation_id;

  if found then
    if v_existing.reviewer_id is distinct from auth.uid()
       or v_existing.submission_id is distinct from p_submission_id
       or v_existing.decision is distinct from p_decision
       or v_existing.reason is distinct from coalesce(p_reason, '') then
      raise exception 'OPERATION_ID_REUSED';
    end if;
    return v_existing.id;
  end if;

  select ss.*
  into v_submission
  from public.survey_submissions ss
  where ss.id = p_submission_id
  for update;

  if not found
     or not public.auth_can_operate_work_activity(v_submission.activity_id) then
    raise exception 'ACCESS_DENIED';
  end if;
  if v_submission.author_id is not null
     and v_submission.author_id = auth.uid() then
    raise exception 'SELF_APPROVAL_FORBIDDEN';
  end if;
  if v_submission.status <> 'submitted' then
    raise exception 'SURVEY_NOT_AWAITING_REVIEW';
  end if;
  if exists (
    select 1
    from public.survey_submissions newer
    where newer.activity_id = v_submission.activity_id
      and newer.version > v_submission.version
  ) then
    raise exception 'SURVEY_DECISION_REQUIRES_LATEST_VERSION';
  end if;

  insert into public.survey_submission_decisions (
    company_id,
    submission_id,
    operation_id,
    correlation_id,
    decision,
    reason,
    reviewer_id
  ) values (
    v_submission.company_id,
    v_submission.id,
    p_operation_id,
    p_operation_id,
    p_decision,
    coalesce(p_reason, ''),
    auth.uid()
  )
  returning id into v_decision_id;

  update public.survey_submissions
  set status = p_decision,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      approved_by = case when p_decision = 'approved' then auth.uid() else null end,
      approved_at = case when p_decision = 'approved' then now() else null end
  where id = v_submission.id;

  select w.project_id
  into v_project_id
  from public.work_activities a
  join public.work_orders w on w.id = a.work_order_id
  where a.id = v_submission.activity_id;

  if v_submission.author_id is not null then
    select coalesce(p.locale, 'es')
    into v_locale
    from public.profiles p
    where p.id = v_submission.author_id;

    perform public.persist_in_app_notification(
      v_submission.company_id,
      v_project_id,
      v_submission.author_id,
      'survey_decided',
      'survey_submission',
      v_submission.id,
      case
        when v_locale = 'pt' and p_decision = 'approved' then 'Levantamento aprovado'
        when v_locale = 'pt' then 'Ajustes solicitados no levantamento'
        when p_decision = 'approved' then 'Relevamiento aprobado'
        else 'Cambios solicitados en el relevamiento'
      end,
      coalesce(nullif(trim(p_reason), ''),
        case when v_locale = 'pt' then 'A revisao foi registrada.'
             else 'La revision fue registrada.' end),
      jsonb_build_object(
        'submission_id', v_submission.id,
        'activity_id', v_submission.activity_id,
        'decision', p_decision,
        'url', '/tasks'
      ),
      p_operation_id,
      'survey-decision:' || v_decision_id::text
    );
  end if;

  return v_decision_id;
end;
$$;

revoke all on function public.decide_survey_submission(uuid, uuid, text, text)
  from public;
grant execute on function public.decide_survey_submission(uuid, uuid, text, text)
  to authenticated;

create or replace function public.record_notification_delivery_attempt(
  p_delivery_id uuid,
  p_succeeded boolean,
  p_error_code text default null,
  p_provider_message_id text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery public.notification_deliveries%rowtype;
  v_status text;
begin
  select d.*
  into v_delivery
  from public.notification_deliveries d
  where d.id = p_delivery_id
  for update;

  if not found then
    raise exception 'DELIVERY_NOT_FOUND';
  end if;
  if v_delivery.status in ('sent', 'dead_letter') then
    return v_delivery.status;
  end if;

  if p_succeeded then
    v_status := 'sent';
  elsif v_delivery.attempts + 1 >= v_delivery.max_attempts then
    v_status := 'dead_letter';
  else
    v_status := 'failed';
  end if;

  update public.notification_deliveries
  set status = v_status,
      attempts = attempts + 1,
      last_error_code = case when p_succeeded then null else left(p_error_code, 100) end,
      provider_message_id = coalesce(p_provider_message_id, provider_message_id),
      delivered_at = case when p_succeeded then now() else delivered_at end,
      next_attempt_at = case
        when v_status = 'failed'
          then now() + make_interval(secs => least(3600, (2 ^ least(v_delivery.attempts, 10))::integer * 30))
        else next_attempt_at
      end,
      updated_at = now()
  where id = p_delivery_id;

  if v_status = 'dead_letter'
     and not exists (
       select 1
       from public.notification_deliveries d
       where d.outbox_id = v_delivery.outbox_id
         and d.id <> p_delivery_id
         and d.status not in ('sent', 'dead_letter')
     ) then
    update public.notification_outbox
    set status = 'dead_letter',
        attempts = greatest(attempts, max_attempts),
        last_error_code = left(p_error_code, 100),
        updated_at = now()
    where id = v_delivery.outbox_id;
  elsif p_succeeded
        and not exists (
          select 1
          from public.notification_deliveries d
          where d.outbox_id = v_delivery.outbox_id
            and d.id <> p_delivery_id
            and d.status <> 'sent'
        ) then
    update public.notification_outbox
    set status = 'delivered',
        delivered_at = coalesce(delivered_at, now()),
        updated_at = now()
    where id = v_delivery.outbox_id;
  end if;

  return v_status;
end;
$$;

revoke all on function public.record_notification_delivery_attempt(
  uuid, boolean, text, text
) from public;
grant execute on function public.record_notification_delivery_attempt(
  uuid, boolean, text, text
) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Row-level security
-- ---------------------------------------------------------------------------

alter table public.work_activities enable row level security;
alter table public.survey_submissions enable row level security;
alter table public.survey_submission_decisions enable row level security;
alter table public.work_assignments enable row level security;
alter table public.installer_global_weekly_availability enable row level security;
alter table public.installer_global_unavailability enable row level security;
alter table public.assignment_command_receipts enable row level security;
alter table public.assignment_override_audit enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.notification_deliveries enable row level security;

create policy work_activities_authorized_read
  on public.work_activities for select to authenticated
  using (public.auth_can_read_work_activity(id));

create policy work_activities_project_operator_all
  on public.work_activities for all to authenticated
  using (public.auth_can_operate_work_activity(id))
  with check (
    public.auth_can_operate_work_order(work_order_id, company_id)
  );

create policy survey_submissions_authorized_read
  on public.survey_submissions for select to authenticated
  using (public.auth_can_read_work_activity(activity_id));

create policy survey_submissions_assignee_insert
  on public.survey_submissions for insert to authenticated
  with check (
    author_id = auth.uid()
    and status in ('draft', 'submitted')
    and public.auth_is_activity_assignee(activity_id)
  );

create policy survey_submissions_assignee_update_draft
  on public.survey_submissions for update to authenticated
  using (
    author_id = auth.uid()
    and status = 'draft'
    and public.auth_is_activity_assignee(activity_id)
  )
  with check (
    author_id = auth.uid()
    and status in ('draft', 'submitted')
    and public.auth_is_activity_assignee(activity_id)
  );

create policy survey_decisions_authorized_read
  on public.survey_submission_decisions for select to authenticated
  using (
    exists (
      select 1
      from public.survey_submissions ss
      where ss.id = submission_id
        and public.auth_can_read_work_activity(ss.activity_id)
    )
  );

create policy work_assignments_authorized_read
  on public.work_assignments for select to authenticated
  using (
    installer_id = auth.uid()
    or public.auth_can_operate_work_activity(activity_id)
  );

create policy installer_global_weekly_owner_all
  on public.installer_global_weekly_availability for all to authenticated
  using (installer_id = auth.uid())
  with check (
    installer_id = auth.uid()
    and public.auth_has_company_role(company_id, 'installer')
  );

create policy installer_global_unavailability_owner_all
  on public.installer_global_unavailability for all to authenticated
  using (installer_id = auth.uid())
  with check (
    installer_id = auth.uid()
    and public.auth_has_company_role(company_id, 'installer')
  );

create policy assignment_receipts_actor_read
  on public.assignment_command_receipts for select to authenticated
  using (
    actor_id = auth.uid()
    or public.auth_can_operate_work_activity(activity_id)
  );

create policy assignment_override_authorized_read
  on public.assignment_override_audit for select to authenticated
  using (
    installer_id = auth.uid()
    or public.auth_can_operate_work_activity(activity_id)
  );

create policy notification_outbox_authorized_read
  on public.notification_outbox for select to authenticated
  using (
    recipient_user_id = auth.uid()
    or public.auth_is_company_manager(company_id)
    or (
      project_id is not null
      and public.auth_has_company_role(company_id, 'coordinator')
      and public.can_operate_project(project_id)
    )
  );

create policy notification_deliveries_authorized_read
  on public.notification_deliveries for select to authenticated
  using (
    recipient_user_id = auth.uid()
    or exists (
      select 1
      from public.notification_outbox o
      where o.id = outbox_id
        and (
          public.auth_is_company_manager(o.company_id)
          or (
            o.project_id is not null
            and public.auth_has_company_role(o.company_id, 'coordinator')
            and public.can_operate_project(o.project_id)
          )
        )
    )
  );

revoke all on public.work_activities from anon;
revoke all on public.survey_submissions from anon;
revoke all on public.survey_submission_decisions from anon;
revoke all on public.work_assignments from anon;
revoke all on public.installer_global_weekly_availability from anon;
revoke all on public.installer_global_unavailability from anon;
revoke all on public.assignment_command_receipts from anon;
revoke all on public.assignment_override_audit from anon;
revoke all on public.notification_outbox from anon;
revoke all on public.notification_deliveries from anon;

grant select, insert, update, delete on public.work_activities to authenticated;
grant select, insert, update on public.survey_submissions to authenticated;
grant select on public.survey_submission_decisions to authenticated;
grant select on public.work_assignments to authenticated;
grant select, insert, update, delete
  on public.installer_global_weekly_availability to authenticated;
grant select, insert, update, delete
  on public.installer_global_unavailability to authenticated;
grant select on public.assignment_command_receipts to authenticated;
grant select on public.assignment_override_audit to authenticated;
grant select on public.notification_outbox to authenticated;
grant select on public.notification_deliveries to authenticated;

-- Aprobación de avisos de inactividad del instalador.
-- El instalador declara cuándo no va a estar; la empresa aprueba o rechaza.
-- Sólo las aprobadas bloquean la agenda. Idempotente.

alter table public.installer_unavailability
  add column if not exists status text not null default 'pending',
  add column if not exists reviewed_by uuid references public.profiles (id) on delete set null,
  add column if not exists review_note text not null default '',
  add column if not exists reviewed_at timestamptz;

alter table public.installer_unavailability
  drop constraint if exists installer_unavailability_status_check;
alter table public.installer_unavailability
  add constraint installer_unavailability_status_check
  check (status in ('pending', 'approved', 'rejected'));

-- Las que ya existían venían bloqueando la agenda: se dan por aprobadas para no
-- cambiar el comportamiento vigente de golpe.
update public.installer_unavailability
  set status = 'approved', reviewed_at = coalesce(reviewed_at, created_at)
  where status = 'pending' and created_at < now();

create index if not exists installer_unavailability_pending_idx
  on public.installer_unavailability (company_id, status)
  where status = 'pending';

-- El manager ya podía leerlas; ahora además las resuelve.
drop policy if exists installer_unavailability_manager_review on public.installer_unavailability;
create policy installer_unavailability_manager_review
  on public.installer_unavailability for update
  using (
    public.auth_role() in ('company_manager', 'coordinator')
    and company_id = public.auth_company()
  )
  with check (
    public.auth_role() in ('company_manager', 'coordinator')
    and company_id = public.auth_company()
  );

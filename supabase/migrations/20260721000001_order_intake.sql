-- Ficha operativa avanzada de órdenes: planificación, logística, importe y adjuntos.

alter table public.work_orders
  add column scheduled_end_date date,
  add column priority text not null default 'media'
    check (priority in ('baja', 'media', 'alta', 'urgente')),
  add column indoor boolean not null default false,
  add column requires_freight boolean not null default false,
  add column freight_details text not null default '',
  add column logistics_notes text not null default '',
  add column amount numeric(14, 2) check (amount is null or amount >= 0),
  add column currency text;

update public.work_orders w
set currency = case when c.country = 'BR' then 'BRL' else 'ARS' end
from public.companies c
where c.id = w.company_id;

alter table public.work_orders
  alter column currency set default 'ARS',
  alter column currency set not null,
  add constraint work_orders_currency_check check (currency in ('ARS', 'BRL')),
  add constraint work_orders_schedule_check check (
    scheduled_end_date is null
    or scheduled_date is null
    or scheduled_end_date >= scheduled_date
  ),
  add constraint work_orders_id_company_key unique (id, company_id);

create table public.order_attachments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  company_id uuid not null references public.companies (id) on delete cascade,
  storage_path text not null,
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text not null check (
    mime_type like 'image/%' or mime_type = 'application/pdf'
  ),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint order_attachments_order_company_fk
    foreign key (order_id, company_id)
    references public.work_orders (id, company_id) on delete cascade,
  constraint order_attachments_path_key unique (order_id, storage_path)
);

create index order_attachments_order_idx
  on public.order_attachments (order_id, created_at);

alter table public.order_attachments enable row level security;

create policy order_attachments_company_all on public.order_attachments
  for all
  using (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  )
  with check (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  );

create policy order_attachments_installer_read on public.order_attachments
  for select using (
    exists (
      select 1
      from public.work_orders w
      where w.id = order_id
        and w.assigned_installer_id = auth.uid()
    )
  );

-- El manager puede limpiar un archivo fallido o reemplazado dentro de su tenant.
create policy evidence_company_delete on storage.objects
  for delete using (
    bucket_id = 'evidence'
    and public.auth_role() = 'company_manager'
    and (storage.foldername(name))[1] = public.auth_company()::text
  );


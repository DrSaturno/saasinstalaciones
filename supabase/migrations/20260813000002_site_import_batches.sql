-- R2-IMP-03 — Lote de importación idempotente y reanudable, con resultado por fila.
--
-- El agujero concreto que cierra: hoy la confirmación deduplica por referencia
-- externa, así que reimportar no duplica las filas QUE TIENEN código. Las que no
-- lo tienen generan un uuid nuevo en cada intento, de modo que si el lote falla
-- a mitad de camino (la inserción va de a 500), reintentar el mismo archivo
-- vuelve a crear todas las locaciones sin código de los lotes que sí habían
-- entrado. `attachCanonicalLocations` ya era idempotente; esto faltaba.
--
-- El lote es la unidad idempotente. Su id se deriva de un checksum de
-- (proyecto + contenido del archivo) en vez de venir del cliente: reintentar el
-- mismo archivo cae en el mismo lote y reanuda, y no hay id ajeno en que confiar.
--
-- Las filas cumplen doble función a propósito: son el registro que permite
-- reanudar (qué fila ya produjo qué locación) y son el reporte descargable por
-- fila que pide el plan. Una sola fuente para las dos cosas.

create table public.site_import_batches (
  id uuid primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  checksum text not null,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'failed')),
  found integer not null default 0,
  imported integer not null default 0,
  reused integer not null default 0,
  skipped integer not null default 0,
  error text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint site_import_batches_id_company_key unique (id, company_id)
);

create index site_import_batches_project_idx
  on public.site_import_batches (project_id, created_at desc);

create table public.site_import_rows (
  batch_id uuid not null references public.site_import_batches (id) on delete cascade,
  row_number integer not null,
  -- Redundante contra el lote, pero evita un join en cada chequeo de RLS.
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null default '',
  external_ref text,
  outcome text not null check (outcome in ('imported', 'reused', 'skipped')),
  reason text,
  -- `set null`: si la locación se borra después, la fila del reporte sobrevive
  -- como registro histórico de lo que pasó en esa importación.
  location_id uuid references public.locations (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (batch_id, row_number)
);

create index site_import_rows_batch_idx
  on public.site_import_rows (batch_id, row_number);

alter table public.site_import_batches enable row level security;
alter table public.site_import_rows enable row level security;

-- Una importación es gestión de empresa: sólo el gerente, y sólo la suya.
-- El coordinador opera órdenes, no carga proyectos (ver `requireOperator`).
create policy site_import_batches_manager_read on public.site_import_batches
  for select
  to authenticated
  using (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  );

create policy site_import_batches_manager_insert on public.site_import_batches
  for insert
  to authenticated
  with check (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
    and created_by = auth.uid()
  );

create policy site_import_batches_manager_update on public.site_import_batches
  for update
  to authenticated
  using (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  )
  with check (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  );

create policy site_import_rows_manager_read on public.site_import_rows
  for select
  to authenticated
  using (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  );

create policy site_import_rows_manager_insert on public.site_import_rows
  for insert
  to authenticated
  with check (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  );

create policy site_import_rows_manager_update on public.site_import_rows
  for update
  to authenticated
  using (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  )
  with check (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  );

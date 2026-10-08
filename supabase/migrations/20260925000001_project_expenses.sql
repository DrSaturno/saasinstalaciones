-- Bloque 6 (docs/specs/2026-09-24-resultado-economico): otros costos del
-- proyecto, para poder calcular ingreso − costo de instaladores − otros
-- costos = ganancia/pérdida.
--
-- Mismo permiso que ya decide quién ve `/finance` y los importes comerciales
-- (bloques 4 y 8): `auth_can_see_commercials`. No se inventa un permiso
-- nuevo — un gasto de proyecto es tan "comercial" como lo que la empresa le
-- cobra al cliente.

create table public.project_expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid not null,
  concept text not null check (char_length(trim(concept)) between 2 and 200),
  amount numeric(14, 2) not null check (amount > 0),
  expense_date date not null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_expenses_project_company_fk
    foreign key (project_id, company_id)
    references public.projects (id, company_id) on delete cascade
);

comment on table public.project_expenses is
  'Gastos manuales de un proyecto (materiales, viáticos, transporte). Bloque 6, docs/specs/2026-09-24-resultado-economico.';

create index project_expenses_project_idx
  on public.project_expenses (project_id, expense_date desc);

alter table public.project_expenses enable row level security;

-- Sin `update`: la app corrige un gasto mal cargado borrándolo y cargando
-- uno nuevo (RESULT-*), no editando uno existente — no hay política de
-- UPDATE porque no hay ninguna escritura que la use.
revoke all on public.project_expenses from anon;
grant select, insert, delete on public.project_expenses to authenticated;

create policy project_expenses_commercial_read on public.project_expenses
  for select to authenticated
  using (public.auth_can_see_commercials(company_id));

-- `created_by = auth.uid()` sólo importa acá, al insertar: nadie carga un
-- gasto a nombre de otro. Borrar es una decisión colectiva de quien puede ver
-- lo comercial, no algo reservado a quien lo cargó — mismo criterio que ya
-- usa `order_payment_events` (cualquier gerente escribe, no sólo el autor).
create policy project_expenses_commercial_insert on public.project_expenses
  for insert to authenticated
  with check (
    public.auth_can_see_commercials(company_id)
    and created_by = auth.uid()
  );

create policy project_expenses_commercial_delete on public.project_expenses
  for delete to authenticated
  using (public.auth_can_see_commercials(company_id));

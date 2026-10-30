-- Privacidad de importes — PRIV-* (docs/specs/2026-09-24-privacidad-de-importes).
--
-- Tres problemas, verificados contra Demo el 24-09-2026:
--
--   1. `work_orders.amount` (lo que la empresa cobra al cliente) y
--      `projects.contract_amount` los podía LEER un instalador: la RLS autoriza
--      la fila entera y el rol `authenticated` —el mismo de gerentes e
--      instaladores— tenía SELECT de columna.
--   2. Un instalador podía ESCRIBIR `installer_amount` y `payment_status` de sus
--      propias órdenes. Probado con su sesión: UPDATE afectó 10 de 10 filas.
--   3. El PDF de la orden imprimía `amount` y el botón está en la pantalla del
--      instalador (se corrige en código).
--
-- Las políticas RLS deciden filas, no columnas, y el rol es compartido: no hay
-- permiso de columna que distinga al gerente del instalador. Por eso los
-- importes comerciales pasan a tablas propias cuya única política deja pasar a
-- quien puede verlos (`auth_can_see_commercials`).
--
-- Esta migración es la EXPANSIÓN: crea las tablas, mueve los datos y VACÍA las
-- columnas viejas, cerrando la fuga ya. Las columnas siguen existiendo (siempre
-- en NULL) para que la versión anterior del código no rompa en la ventana entre
-- migrar y desplegar; un trigger desvía a las tablas nuevas lo que ese código
-- escriba. La migración de CONTRACCIÓN (quitar las columnas y los desvíos) va
-- aparte, después de desplegar.
--
-- Idempotente en lo estructural (`if not exists`, `create or replace`); el
-- backfill es seguro de repetir porque `on conflict do nothing` y porque las
-- columnas ya vaciadas no aportan filas.

-- ---------------------------------------------------------------------------
-- 1. Quién puede ver y escribir lo comercial
-- ---------------------------------------------------------------------------

-- Único punto de decisión. Hoy: el gerente de la empresa. El bloque de
-- subcuentas (SUBCTA) suma acá el permiso «finanzas» que el gerente pueda dar,
-- sin tocar otra vez las tablas ni sus políticas. El coordinador NO entra:
-- decisión de Nicolás (24-09-2026), es un instalador con más funciones.
--
-- `security invoker` a propósito: sólo compone helpers que ya existen. No suma
-- superficie `security definer` ejecutable por `anon`.
create or replace function public.auth_can_see_commercials(p_company_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.auth_is_company_manager(p_company_id)
$$;

revoke all on function public.auth_can_see_commercials(uuid) from public;
revoke all on function public.auth_can_see_commercials(uuid) from anon;
grant execute on function public.auth_can_see_commercials(uuid) to authenticated;

comment on function public.auth_can_see_commercials(uuid) is
  'Quién puede ver y escribir importes comerciales (lo que la empresa cobra al cliente). Hoy sólo el gerente; el bloque de subcuentas la extiende.';

-- ---------------------------------------------------------------------------
-- 2. Tablas de precios
-- ---------------------------------------------------------------------------

-- Sólo tiene fila una orden con importe cargado: «sin fila» equivale al NULL de
-- antes. `company_id` va en la clave foránea compuesta para que un importe no
-- pueda quedar bajo una empresa distinta a la de su orden.
create table if not exists public.work_order_pricing (
  order_id uuid primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  amount numeric(14, 2) not null check (amount >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  -- Diferida: el desvío (sección 4) escribe acá desde un BEFORE INSERT de la
  -- orden, cuando la fila de `work_orders` todavía no existe.
  constraint work_order_pricing_order_fk
    foreign key (order_id, company_id)
    references public.work_orders (id, company_id) on delete cascade
    deferrable initially deferred
);

comment on table public.work_order_pricing is
  'Lo que la empresa le cobra a su cliente por la orden (ingreso). Sólo la ve quien pasa auth_can_see_commercials; el instalador nunca. Su costo (installer_amount) sigue en work_orders.';

create index if not exists work_order_pricing_company_idx
  on public.work_order_pricing (company_id);

-- `projects` sólo tenía la clave (id, company_id, client_id): se agrega la
-- (id, company_id) que la clave foránea compuesta necesita. `id` ya es primaria,
-- así que la unicidad es trivial y no puede fallar.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.projects'::regclass
      and conname = 'projects_id_company_key'
  ) then
    alter table public.projects
      add constraint projects_id_company_key unique (id, company_id);
  end if;
end $$;

create table if not exists public.project_pricing (
  project_id uuid primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  contract_amount numeric(14, 2) not null check (contract_amount >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint project_pricing_project_fk
    foreign key (project_id, company_id)
    references public.projects (id, company_id) on delete cascade
    deferrable initially deferred
);

comment on table public.project_pricing is
  'Monto de contrato del proyecto con el cliente. Sólo lo ve quien pasa auth_can_see_commercials; el instalador nunca.';

create index if not exists project_pricing_company_idx
  on public.project_pricing (company_id);

-- ---------------------------------------------------------------------------
-- 3. RLS + grants (las migraciones declaran sus grants: ver public_schema_grants)
-- ---------------------------------------------------------------------------

alter table public.work_order_pricing enable row level security;
alter table public.project_pricing enable row level security;

revoke all on public.work_order_pricing from anon, authenticated;
revoke all on public.project_pricing from anon, authenticated;
grant select, insert, update, delete on public.work_order_pricing to authenticated;
grant select, insert, update, delete on public.project_pricing to authenticated;

drop policy if exists work_order_pricing_commercial_all on public.work_order_pricing;
create policy work_order_pricing_commercial_all on public.work_order_pricing
  for all to authenticated
  using (public.auth_can_see_commercials(company_id))
  with check (public.auth_can_see_commercials(company_id));

drop policy if exists project_pricing_commercial_all on public.project_pricing;
create policy project_pricing_commercial_all on public.project_pricing
  for all to authenticated
  using (public.auth_can_see_commercials(company_id))
  with check (public.auth_can_see_commercials(company_id));

-- ---------------------------------------------------------------------------
-- 4. Desvío de compatibilidad (se retira en la contracción)
-- ---------------------------------------------------------------------------

-- Mientras las columnas viejas existan, lo que el código anterior les escriba se
-- redirige a las tablas nuevas y la columna vuelve a quedar en NULL. Así la fuga
-- no se reabre en la ventana de despliegue.
--
-- `security definer` para poder escribir la tabla de precios aunque quien llama
-- no tenga política sobre ella; por eso valida ella misma. Se distingue al
-- usuario final por `auth.uid()` (dentro de una definer `current_user` es el
-- dueño). Sin sesión (migraciones, service_role, seeds) no hay nada que validar.
create or replace function public.divert_order_amount()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and not public.auth_can_see_commercials(new.company_id) then
    -- Un coordinador que manda `amount: null` no está borrando nada: se ignora.
    -- Uno que manda un valor sí intenta cargar un importe comercial.
    if new.amount is not null then
      raise exception 'No tenés permiso para cargar importes comerciales'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.amount is null then
    -- UPDATE OF amount con NULL: el código viejo está limpiando el importe.
    if tg_op = 'UPDATE' then
      delete from public.work_order_pricing where order_id = new.id;
    end if;
    return new;
  end if;

  insert into public.work_order_pricing (order_id, company_id, amount, updated_by)
  values (new.id, new.company_id, new.amount, auth.uid())
  on conflict (order_id) do update
    set amount = excluded.amount,
        updated_at = now(),
        updated_by = excluded.updated_by;

  new.amount := null;
  return new;
end;
$$;

revoke all on function public.divert_order_amount() from public;
revoke all on function public.divert_order_amount() from anon;
revoke all on function public.divert_order_amount() from authenticated;

drop trigger if exists work_orders_divert_amount on public.work_orders;
create trigger work_orders_divert_amount
  before insert or update of amount on public.work_orders
  for each row execute function public.divert_order_amount();

create or replace function public.divert_project_contract_amount()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and not public.auth_can_see_commercials(new.company_id) then
    if new.contract_amount is not null then
      raise exception 'No tenés permiso para cargar importes comerciales'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.contract_amount is null then
    if tg_op = 'UPDATE' then
      delete from public.project_pricing where project_id = new.id;
    end if;
    return new;
  end if;

  insert into public.project_pricing (project_id, company_id, contract_amount, updated_by)
  values (new.id, new.company_id, new.contract_amount, auth.uid())
  on conflict (project_id) do update
    set contract_amount = excluded.contract_amount,
        updated_at = now(),
        updated_by = excluded.updated_by;

  new.contract_amount := null;
  return new;
end;
$$;

revoke all on function public.divert_project_contract_amount() from public;
revoke all on function public.divert_project_contract_amount() from anon;
revoke all on function public.divert_project_contract_amount() from authenticated;

drop trigger if exists projects_divert_contract_amount on public.projects;
create trigger projects_divert_contract_amount
  before insert or update of contract_amount on public.projects
  for each row execute function public.divert_project_contract_amount();

-- ---------------------------------------------------------------------------
-- 5. Backfill verificado
-- ---------------------------------------------------------------------------

-- Se suspenden los triggers de usuario durante el vaciado para no reescribir
-- `updated_at` ni reactivar reglas de negocio en filas que sólo cambian de
-- lugar un importe. Si la suma o el conteo no coinciden, la migración entera se
-- aborta: no hay estado intermedio con datos perdidos.
do $$
declare
  v_orders_n bigint;
  v_orders_sum numeric;
  v_projects_n bigint;
  v_projects_sum numeric;
  v_moved_orders_n bigint;
  v_moved_orders_sum numeric;
  v_moved_projects_n bigint;
  v_moved_projects_sum numeric;
begin
  select count(*), coalesce(sum(amount), 0)
    into v_orders_n, v_orders_sum
    from public.work_orders where amount is not null;
  select count(*), coalesce(sum(contract_amount), 0)
    into v_projects_n, v_projects_sum
    from public.projects where contract_amount is not null;

  alter table public.work_orders disable trigger user;
  alter table public.projects disable trigger user;

  insert into public.work_order_pricing (order_id, company_id, amount)
    select id, company_id, amount from public.work_orders where amount is not null
    on conflict (order_id) do nothing;
  insert into public.project_pricing (project_id, company_id, contract_amount)
    select id, company_id, contract_amount from public.projects where contract_amount is not null
    on conflict (project_id) do nothing;

  -- Comprobación ANTES de borrar de origen: lo que hay en destino cubre lo que
  -- había en origen.
  select count(*), coalesce(sum(p.amount), 0)
    into v_moved_orders_n, v_moved_orders_sum
    from public.work_order_pricing p
    join public.work_orders w on w.id = p.order_id
    where w.amount is not null;
  select count(*), coalesce(sum(p.contract_amount), 0)
    into v_moved_projects_n, v_moved_projects_sum
    from public.project_pricing p
    join public.projects j on j.id = p.project_id
    where j.contract_amount is not null;

  if v_moved_orders_n <> v_orders_n or v_moved_orders_sum <> v_orders_sum
     or v_moved_projects_n <> v_projects_n or v_moved_projects_sum <> v_projects_sum then
    raise exception
      'Backfill de importes inconsistente: órdenes %/% (suma %/%), proyectos %/% (suma %/%)',
      v_moved_orders_n, v_orders_n, v_moved_orders_sum, v_orders_sum,
      v_moved_projects_n, v_projects_n, v_moved_projects_sum, v_projects_sum;
  end if;

  update public.work_orders set amount = null where amount is not null;
  update public.projects set contract_amount = null where contract_amount is not null;

  alter table public.work_orders enable trigger user;
  alter table public.projects enable trigger user;
end $$;

-- ---------------------------------------------------------------------------
-- 6. El instalador sólo puede cambiar lo que su flujo de campo necesita
-- ---------------------------------------------------------------------------

-- `work_orders_installer_progress` autoriza el UPDATE de la fila ENTERA. Como el
-- rol es compartido, tampoco acá sirve el permiso de columna. Este trigger
-- rechaza cualquier cambio fuera de la lista blanca cuando la escritura viene
-- directa del cliente y quien escribe NO es personal de la empresa.
--
-- Lista blanca = lo que el área instalador escribe hoy directo sobre
-- `work_orders`: `status` (lib/actions/tasks.ts, compare-and-set) y
-- `installer_accepted_at` (aceptar la orden). Todo lo demás pasa por RPC
-- `security definer`, que corre como el dueño y no cae en este chequeo. Una
-- columna nueva queda PROHIBIDA por defecto.
--
-- `security invoker`: necesita `current_user` para separar una llamada directa
-- de la API (`authenticated`) de una hecha dentro de una RPC definer (dueño), de
-- migraciones (postgres) o del service_role. El prefijo `00_` hace que corra
-- primero entre los BEFORE UPDATE, así compara lo que mandó el cliente y no lo
-- que otros triggers reescriben después.
create or replace function public.guard_installer_order_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_allowed text[] := array['status', 'installer_accepted_at', 'updated_at'];
begin
  if current_user <> 'authenticated' or auth.uid() is null then
    return new;
  end if;

  -- Personal de la empresa: sin restricción de columnas.
  if public.auth_is_company_manager(old.company_id) then
    return new;
  end if;
  if old.company_id in (select public.auth_companies('coordinator'))
     and public.can_operate_project(old.project_id) then
    return new;
  end if;

  if (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
    raise exception
      'Un instalador sólo puede cambiar el estado y la aceptación de su orden'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_installer_order_columns() from public;
revoke all on function public.guard_installer_order_columns() from anon;

drop trigger if exists work_orders_00_guard_installer_columns on public.work_orders;
create trigger work_orders_00_guard_installer_columns
  before update on public.work_orders
  for each row execute function public.guard_installer_order_columns();

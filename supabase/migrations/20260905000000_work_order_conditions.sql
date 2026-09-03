-- Fase 0 de reputación: la taxonomía de condiciones (DEC-16).
--
-- **Condiciones, no niveles.** La dificultad no se declara como "media" o
-- "alta". Se declara como un conjunto de condiciones verificables, porque la
-- reputación está pensada para cruzar empresas y un nivel que cada empresa
-- llena con su propia vara hace que "7 trabajos complejos" deje de significar
-- lo mismo entre dos inquilinos. REQ-10.3 además prohíbe inferir la dificultad
-- de `priority` o del texto libre, así que esa columna no participa de esto.
--
-- **Acá no hay pesos.** Cuánto suma cada condición es parte de la fórmula, y la
-- fórmula tiene su propia versión (Fase 2). Esta tabla sólo registra hechos.
--
-- **Faltan dos condiciones a propósito.** `exterior` y `flete` NO se guardan
-- acá: ya viven en `work_orders.indoor` y `work_orders.requires_freight`.
-- Copiarlas daría dos fuentes de verdad para el mismo hecho, y el día que
-- alguien edite la orden la fila de condición quedaría vieja, contradiciendo a
-- la orden que dice representar. Se derivan al leer, en
-- `lib/domain/work-conditions.ts`. El CHECK de abajo impide que se cuelen.

create table if not exists public.work_order_conditions (
  order_id uuid not null,
  company_id uuid not null references public.companies (id) on delete cascade,

  condition text not null check (condition in (
    'altura',
    'electrico',
    'nocturno',
    'gran_formato',
    'acceso_restringido'
  )),

  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,

  -- Una condición por orden, y sin repetir: la clave natural evita que la
  -- dificultad dependa de cuántas veces se tildó la misma casilla.
  primary key (order_id, condition),

  -- FK compuesta contra `work_orders_id_company_key`: la empresa de la
  -- condición no puede divergir de la empresa de la orden. Mismo patrón que
  -- order_payment_events.
  constraint work_order_conditions_order_company_fk
    foreign key (order_id, company_id)
    references public.work_orders (id, company_id) on delete cascade
);

create index if not exists work_order_conditions_company_idx
  on public.work_order_conditions (company_id);

alter table public.work_order_conditions enable row level security;

-- ---------------------------------------------------------------------------
-- Quién declara y quién lee
-- ---------------------------------------------------------------------------

drop policy if exists work_order_conditions_company_all
  on public.work_order_conditions;
create policy work_order_conditions_company_all
  on public.work_order_conditions
  for all to authenticated
  using (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  )
  with check (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  );

-- Coordinador: sólo en los proyectos que opera. Espejo de la política dual de
-- order_incidents, con el patrón posterior al cutover multiempresa: un
-- coordinador puede serlo en varias empresas y también ser instalador.
drop policy if exists work_order_conditions_coordinator_all
  on public.work_order_conditions;
create policy work_order_conditions_coordinator_all
  on public.work_order_conditions
  for all to authenticated
  using (
    (
      (public.auth_role() = 'coordinator' and company_id = public.auth_company())
      or company_id in (select public.auth_companies('coordinator'))
    )
    and exists (
      select 1 from public.work_orders w
      where w.id = order_id and public.can_operate_project(w.project_id)
    )
  )
  with check (
    (
      (public.auth_role() = 'coordinator' and company_id = public.auth_company())
      or company_id in (select public.auth_companies('coordinator'))
    )
    and exists (
      select 1 from public.work_orders w
      where w.id = order_id and public.can_operate_project(w.project_id)
    )
  );

-- El instalador LEE y no escribe, y la asimetría es el punto: el
-- reconocimiento por haber aceptado un trabajo complejo sólo tiene sentido si
-- la persona pudo ver las condiciones antes de aceptar, y no tendría ninguno
-- si pudiera declararlas ella misma.
drop policy if exists work_order_conditions_installer_read
  on public.work_order_conditions;
create policy work_order_conditions_installer_read
  on public.work_order_conditions
  for select to authenticated
  using (
    exists (
      select 1
      from public.work_orders w
      where w.id = order_id
        and w.company_id = work_order_conditions.company_id
        and w.assigned_installer_id = auth.uid()
    )
  );

grant select, insert, delete on public.work_order_conditions to authenticated;

-- El REVOKE es explícito y no sobra: en este proyecto `authenticated` recibe
-- todos los privilegios sobre cada tabla nueva por default, y quien restringe
-- de verdad es la RLS. Como las políticas de arriba son `for all`, sin este
-- revoke un gerente podría hacer `update ... set condition = otra` y quedarse
-- con el `created_at` original.
--
-- Eso no sería un detalle: la Fase 1 compara cuándo se declaró la condición
-- contra cuándo se aceptó la orden, para reconocer a quien aceptó SABIENDO que
-- el trabajo era complejo. Poder mutar la condición sin mover la fecha
-- permitiría fabricar ese reconocimiento después del hecho.
--
-- Una condición se agrega o se quita; no se transforma en otra.
revoke update on public.work_order_conditions from authenticated;

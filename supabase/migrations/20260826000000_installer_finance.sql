-- Finanzas: separa lo que la empresa cobra de lo que le paga al instalador.
--
-- **El problema.** `work_orders.amount` venía cumpliendo dos papeles a la vez:
-- el ingreso de la empresa por esa orden, y —en el desglose «por instalador»
-- que la pantalla de finanzas ya muestra— el valor atribuido a quien la
-- ejecutó. Es el mismo número con dos etiquetas, así que hoy es
-- matemáticamente imposible calcular una ganancia real (ingreso menos costo).
--
-- Esta migración agrega el segundo número en vez de renombrar el primero: el
-- bug no es cómo se llama la columna, es que dos conceptos compartían una. Con
-- `installer_amount` al lado, `amount` conserva su significado y ningún lector
-- existente cambia de comportamiento.
--
-- **Estado de pago.** Tampoco existía. `finalizada` es un estado operativo —el
-- trabajo se terminó—, no financiero —la plata se cobró—, y el código de
-- finanzas venía usando el primero como aproximación del segundo. Se agrega
-- `payment_status` propio, con historial en tabla aparte: la columna sirve para
-- filtrar listas rápido, y la tabla contesta «¿cuándo se cobró esta orden y
-- quién lo marcó?», que sin auditoría no se puede responder.
--
-- Decisión de producto, tomada explícitamente: **toda orden existente arranca
-- en `pending`.** No se asume que lo finalizado ya está cobrado — son cosas
-- distintas y darlas por iguales inventaría un dato que nadie confirmó. El
-- default de la columna alcanza; no hace falta backfill.

-- ---------------------------------------------------------------------------
-- 1. Costo del instalador
-- ---------------------------------------------------------------------------

-- Tarifa sugerida de un instalador dentro de una empresa. Sólo PRELLENA el
-- campo al crear la orden: el valor que cuenta siempre es el guardado en la
-- orden, así que no hay ambigüedad de «cuál rige ahora». Existe porque cargar
-- 2.000 órdenes a mano —el caso de uso central del producto— es inviable.
alter table public.company_installers
  add column default_installer_rate numeric(14, 2)
    check (default_installer_rate is null or default_installer_rate >= 0);

comment on column public.company_installers.default_installer_rate is
  'Tarifa sugerida por orden para este instalador en esta empresa. Sólo prellena el formulario; el monto vinculante vive en work_orders.installer_amount.';

alter table public.work_orders
  -- Queda NULL en las órdenes ya existentes a propósito: copiarles `amount`
  -- volvería a mezclar ingreso y costo, que es justo el bug que se corrige acá.
  add column installer_amount numeric(14, 2)
    check (installer_amount is null or installer_amount >= 0),
  add column payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid')),
  add column payment_status_changed_at timestamptz,
  add column payment_status_changed_by uuid
    references public.profiles (id) on delete set null;

comment on column public.work_orders.amount is
  'Lo que la empresa cobra por esta orden (ingreso). No confundir con installer_amount.';
comment on column public.work_orders.installer_amount is
  'Lo que la empresa le paga al instalador por esta orden (costo). Es lo único que el instalador ve de esta orden.';

create index work_orders_payment_status_idx
  on public.work_orders (company_id, payment_status);

-- ---------------------------------------------------------------------------
-- 2. Historial de pago
-- ---------------------------------------------------------------------------

create table public.order_payment_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  company_id uuid not null references public.companies (id) on delete cascade,
  status text not null check (status in ('pending', 'paid')),
  note text not null default '',
  changed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- FK compuesta contra `work_orders_id_company_key`: la empresa del evento no
  -- puede divergir de la empresa de la orden. Mismo patrón que order_attachments.
  constraint order_payment_events_order_company_fk
    foreign key (order_id, company_id)
    references public.work_orders (id, company_id) on delete cascade
);

create index order_payment_events_order_idx
  on public.order_payment_events (order_id, created_at desc);

alter table public.order_payment_events enable row level security;

-- Empresa: administra el cobro de sus propias órdenes.
create policy order_payment_events_company_all on public.order_payment_events
  for all using (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
  )
  with check (
    public.auth_role() = 'company_manager'
    and company_id = public.auth_company()
    and changed_by = auth.uid()
  );

-- Coordinador: sólo en los proyectos que opera. Espejo de
-- order_incidents_coordinator_all después del cutover multiempresa.
create policy order_payment_events_coordinator_all on public.order_payment_events
  for all using (
    company_id in (select public.auth_companies('coordinator'))
    and exists (
      select 1
      from public.work_orders w
      where w.id = order_id
        and public.can_operate_project(w.project_id)
    )
  )
  with check (
    company_id in (select public.auth_companies('coordinator'))
    and changed_by = auth.uid()
    and exists (
      select 1
      from public.work_orders w
      where w.id = order_id
        and public.can_operate_project(w.project_id)
    )
  );

-- Instalador: SÓLO LECTURA, y sólo de las órdenes que él ejecutó.
--
-- ⚠️ Esta política NO filtra por empresa, y es deliberado: un instalador puede
-- trabajar para varias empresas a la vez, y necesita ver el cobro de todas en
-- una sola pantalla. Es el mismo criterio que ya usa work_orders_installer_read.
-- «Arreglarla» agregando `and company_id = auth_company()` rompería esa vista
-- cruzada, porque un instalador no tiene una empresa singular. El test pgTAP
-- de esta migración existe para atrapar exactamente ese error.
--
-- No hay política de escritura para el instalador: quién cobró y cuándo lo
-- decide la empresa, no él.
create policy order_payment_events_installer_read on public.order_payment_events
  for select using (
    public.company_is_active(company_id)
    and exists (
      select 1
      from public.work_orders w
      where w.id = order_id
        and w.company_id = order_payment_events.company_id
        and w.assigned_installer_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Cambiar el estado de pago: columna e historial, en una sola transacción
-- ---------------------------------------------------------------------------

-- `security invoker` a propósito: no hace falta escalar privilegios, la RLS del
-- llamante ya autoriza ambas escrituras. Existe como función —en vez de dos
-- llamadas desde la aplicación— para que la columna y su historial no puedan
-- quedar desincronizados si la segunda escritura falla.
create or replace function public.set_order_payment_status(
  p_order_id uuid,
  p_status text,
  p_note text default ''
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_company_id uuid;
  v_current text;
begin
  if p_status not in ('pending', 'paid') then
    raise exception 'Estado de pago inválido: %', p_status;
  end if;

  -- La RLS decide qué órdenes ve el llamante: si no es suya, no la encuentra.
  select company_id, payment_status
  into v_company_id, v_current
  from public.work_orders
  where id = p_order_id;

  if not found then
    raise exception 'Orden no encontrada';
  end if;

  -- Idempotente: repetir el mismo estado no ensucia el historial con ruido.
  if v_current = p_status then
    return;
  end if;

  update public.work_orders
  set payment_status = p_status,
      payment_status_changed_at = now(),
      payment_status_changed_by = auth.uid()
  where id = p_order_id;

  insert into public.order_payment_events (
    order_id, company_id, status, note, changed_by
  )
  values (p_order_id, v_company_id, p_status, coalesce(p_note, ''), auth.uid());
end;
$$;

revoke all on function public.set_order_payment_status(uuid, text, text) from public;
grant execute on function public.set_order_payment_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Lo que el instalador puede ver de sus órdenes
-- ---------------------------------------------------------------------------

-- Defensa en profundidad sobre la disciplina de `select` explícito.
--
-- `work_orders_installer_read` autoriza la FILA completa, no columnas: hoy
-- ningún fetcher pide `amount` desde el área instalador, pero eso es una
-- convención de código, no una garantía. Esta vista hace estructuralmente
-- imposible que un cambio futuro exponga por accidente lo que la empresa le
-- cobra a su cliente —información comercial de un tercero— aunque alguien
-- escriba `select("*")`.
--
-- `security_invoker` hace que la RLS se evalúe con el rol de quien consulta, no
-- con el del dueño de la vista: sin eso, la vista sería un agujero que saltea
-- las políticas.
create view public.installer_earnings
with (security_invoker = true) as
select
  w.id                        as order_id,
  w.company_id,
  w.project_id,
  w.site_id,
  w.title,
  w.status,
  w.assigned_installer_id,
  w.installer_amount          as amount,
  w.currency,
  w.payment_status,
  w.payment_status_changed_at,
  w.scheduled_date,
  w.finalized_at,
  w.created_at
from public.work_orders w;

comment on view public.installer_earnings is
  'Órdenes vistas desde el instalador: expone installer_amount como «amount» y NUNCA work_orders.amount, que es el ingreso de la empresa.';

grant select on public.installer_earnings to authenticated;

-- Aceptación de órdenes por parte del instalador.
--
-- Toda orden asignada queda "por aceptar" hasta que el instalador la confirma:
-- puede tener algo que le impida hacerla, y la empresa necesita enterarse antes
-- de contar con ese trabajo. Idempotente.

alter table public.work_orders
  add column if not exists installer_accepted_at timestamptz;

-- Las que ya estaban asignadas se dan por aceptadas: pedir aceptación
-- retroactiva de trabajo en curso (o ya terminado) sería ruido, no información.
update public.work_orders
  set installer_accepted_at = coalesce(installer_accepted_at, assigned_at, created_at)
  where assigned_installer_id is not null and installer_accepted_at is null;

create index if not exists work_orders_pending_acceptance_idx
  on public.work_orders (assigned_installer_id)
  where installer_accepted_at is null and assigned_installer_id is not null;

/**
 * Al cambiar de instalador, la orden vuelve a "por aceptar": la persona nueva
 * no heredó la confirmación de la anterior. Al desasignar, se limpia.
 */
create or replace function public.reset_order_acceptance()
returns trigger
language plpgsql
as $$
begin
  if new.assigned_installer_id is distinct from old.assigned_installer_id then
    new.installer_accepted_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists work_orders_reset_acceptance on public.work_orders;
create trigger work_orders_reset_acceptance
  before update of assigned_installer_id on public.work_orders
  for each row execute function public.reset_order_acceptance();

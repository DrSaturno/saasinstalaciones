-- Auditoría del 11-09-2026 — T1. El estado y su rastro, juntos o nada.
--
-- `transitionOrder` y `reviewOrderDelivery` hacían dos escrituras sueltas:
-- primero `work_orders.status`, después el rastro en `order_updates`. Si la
-- segunda fallaba, el estado quedaba movido sin registro — y de ese insert
-- cuelga el trigger `notify_review_decision`, así que el instalador NUNCA se
-- enteraba de que la empresa movió su orden. Es la clase de desincronización
-- entre tableros que se reportó desde el campo, y era invisible: la acción
-- devolvía `ok` igual.
--
-- El repo ya tenía el molde. `set_order_payment_status` existe exactamente por
-- esto y lo dice en su comentario: «la columna y su historial tienen que
-- moverse juntos o no moverse». Esta función es lo mismo para el estado.
--
-- ## Por qué NO es `security definer`
--
-- Igual que `set_order_payment_status`: la RLS decide qué órdenes toca el
-- llamante. Una orden que no le corresponde no la encuentra, y el insert del
-- rastro pasa por las mismas policies que ya pasaba desde la aplicación. No se
-- agrega superficie privilegiada — la auditoría acaba de cerrar un agujero de
-- esa forma exacta (H1), y no tiene sentido abrir otro para esto.
--
-- Las validaciones de la máquina de estados NO se repiten acá: las aplica el
-- trigger `validate_order_transition`, que sigue siendo la autoridad.

create or replace function public.apply_order_status_change(
  p_order_id uuid,
  p_to_status text,
  p_note text,
  -- Compare-and-set. `null` = no comparar. `reviewOrderDelivery` lo usa para
  -- que dos personas resolviendo la misma entrega no se pisen.
  p_expected_status text default null,
  -- Atribuir el rastro a quien lo ejecuta. Importa porque
  -- `notify_review_decision` no avisa cuando el autor ES el instalador
  -- asignado: nadie necesita que le avisen de su propia acción.
  p_attribute_caller boolean default false
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_company_id uuid;
  v_from_status text;
begin
  -- `for update` y no una lectura suelta: bloquea la fila hasta el commit, así
  -- la comparación de abajo mira el estado real y no una foto que otra
  -- transacción ya invalidó.
  select company_id, status
    into v_company_id, v_from_status
    from public.work_orders
   where id = p_order_id
     for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_expected_status is not null and v_from_status is distinct from p_expected_status then
    raise exception 'ORDER_STATUS_CONFLICT' using errcode = '55000';
  end if;

  -- Idempotente: repetir el mismo estado no ensucia el historial con ruido.
  -- Mismo criterio que `set_order_payment_status`.
  if v_from_status = p_to_status then
    return;
  end if;

  update public.work_orders
     set status = p_to_status
   where id = p_order_id;

  insert into public.order_updates (
    id, order_id, company_id, created_by, type, from_status, to_status, note
  )
  values (
    gen_random_uuid(),
    p_order_id,
    v_company_id,
    case when p_attribute_caller then auth.uid() else null end,
    'system',
    v_from_status,
    p_to_status,
    coalesce(p_note, '')
  );
end;
$$;

revoke all on function public.apply_order_status_change(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.apply_order_status_change(uuid, text, text, text, boolean) to authenticated;

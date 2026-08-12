-- R1 / ADR-001 — Ningún actor puede aprobar su propia entrega.
--
-- `validate_order_transition` (20260728000006) ya restringe quién envía a
-- 'en_revision', pero no restringe quién la aprueba o la reabre. Con roles
-- duales (20260805000002), un coordinador puede ser el mismo instalador
-- asignado a esa orden: sin este chequeo, podría finalizar o reabrir su
-- propio trabajo sin revisión de un tercero.

create or replace function public.validate_order_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.auth_role();
begin
  if old.status = new.status then
    new.updated_at := now();
    return new;
  end if;

  -- Transiciones permitidas (sin cambios respecto del original).
  if not (
    (old.status = 'pendiente'    and new.status in ('relevamiento', 'planificada', 'cancelada')) or
    (old.status = 'relevamiento' and new.status in ('planificada', 'cancelada')) or
    (old.status = 'planificada'  and new.status in ('en_proceso', 'cancelada')) or
    (old.status = 'en_proceso'   and new.status in ('en_revision')) or
    (old.status = 'en_revision'  and new.status in ('finalizada', 'en_proceso'))
  ) then
    raise exception 'transición de estado inválida: % → %', old.status, new.status;
  end if;

  -- Regla 1: salir de 'pendiente' exige instalador asignado.
  -- Cancelar queda exento: una orden se cancela sin haber asignado a nadie.
  if old.status = 'pendiente'
     and new.status <> 'cancelada'
     and new.assigned_installer_id is null then
    raise exception 'La orden necesita un instalador asignado antes de avanzar';
  end if;

  -- Regla 4: si hubo relevamiento, tiene que quedar asentado qué se relevó.
  if old.status = 'relevamiento' and new.status = 'planificada' then
    if not exists (
      select 1 from public.order_updates u
      where u.order_id = new.id and u.type = 'survey'
    ) then
      raise exception 'Falta registrar el relevamiento antes de planificar';
    end if;
  end if;

  -- Regla 2: no se arranca el trabajo sin haberlo aceptado.
  if new.status = 'en_proceso' and old.status = 'planificada'
     and new.installer_accepted_at is null then
    raise exception 'El instalador tiene que aceptar la orden antes de iniciarla';
  end if;

  -- Regla 3: mandar a revisión es potestad del instalador asignado.
  -- `v_role` es null fuera de una sesión (seeds, scripts): ahí no se aplica.
  if new.status = 'en_revision' and v_role is not null then
    if v_role <> 'installer' and v_role <> 'coordinator' then
      raise exception 'Sólo el instalador asignado puede enviar la orden a revisión';
    end if;
    if auth.uid() is distinct from new.assigned_installer_id then
      raise exception 'Sólo el instalador asignado puede enviar la orden a revisión';
    end if;
  end if;

  -- Regla 5 (R1 / ADR-001): aprobar o reabrir una entrega es tarea de un
  -- tercero. Si quien ejecuta la sesión es el mismo instalador asignado,
  -- ninguna de las dos salidas de 'en_revision' está permitida, sin importar
  -- qué otra capacidad tenga en la empresa.
  if old.status = 'en_revision'
     and new.status in ('finalizada', 'en_proceso')
     and auth.uid() is not null
     and auth.uid() = old.assigned_installer_id then
    raise exception 'No podés aprobar ni reabrir tu propia entrega';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

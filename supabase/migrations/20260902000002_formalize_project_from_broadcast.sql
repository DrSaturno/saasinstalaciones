-- Formalizar el proyecto a partir de una convocatoria ya cotizada y aceptada.
--
-- Es el último paso del flujo nuevo: publicar → cotizar → aprobar → **crear el
-- proyecto** → ejecutar. Hasta acá la oportunidad vivía sin proyecto a
-- propósito; recién cuando el trabajo se confirma con el cliente se formaliza.
--
-- **Por qué es una función y no cuatro escrituras desde la aplicación.** Crea
-- proyecto, punto, orden y además vincula la convocatoria. Hechas por separado,
-- una falla en la tercera dejaría un proyecto y un punto huérfanos, y la
-- convocatoria sin vincular — basura que alguien tendría que limpiar a mano y
-- que además rompería la trazabilidad. Acá entra todo o no entra nada.
--
-- **Coordinador obligatorio.** El spec lo pide, y se exige ACÁ y no en el alta
-- normal de proyectos: `projects.coordinator_id` sigue siendo nullable porque
-- una empresa que todavía no cargó ningún coordinador tiene que poder crear su
-- primer proyecto por el camino de siempre. Lo que no puede es formalizar un
-- trabajo con alguien de afuera sin tener quién lo coordine.
--
-- **El punto nace incompleto (`is_placeholder`).** La convocatoria conoce la
-- zona, no la dirección exacta. Se crea el punto con lo que hay y el equipo lo
-- completa después con el editor que ya existe — el mismo mecanismo que usan
-- las locaciones pendientes.

create or replace function public.formalize_project_from_broadcast(
  p_broadcast_id uuid,
  p_installer_id uuid,
  p_coordinator_id uuid,
  p_project_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_broadcast public.broadcasts%rowtype;
  v_company public.companies%rowtype;
  v_quoted numeric(14, 2);
  v_application_status text;
  v_project_id uuid;
  v_site_id uuid;
  v_order_id uuid;
  v_name text := btrim(coalesce(p_project_name, ''));
begin
  if public.auth_role() is distinct from 'company_manager' then
    raise exception 'Sólo la empresa puede formalizar el proyecto';
  end if;
  if v_name = '' then
    raise exception 'El proyecto necesita un nombre';
  end if;

  select * into v_broadcast
  from public.broadcasts b
  where b.id = p_broadcast_id
    and b.company_id = public.auth_company()
  for update;
  if not found then raise exception 'Búsqueda no encontrada'; end if;

  -- Formalizar dos veces crearía dos proyectos para el mismo trabajo.
  if v_broadcast.project_id is not null then
    raise exception 'Esta búsqueda ya tiene un proyecto';
  end if;
  -- Sin cliente no hay a quién facturarle: la convocatoria nació incompleta.
  if v_broadcast.client_id is null then
    raise exception 'La búsqueda no tiene cliente asociado';
  end if;

  -- El proyecto sale de una cotización ACEPTADA, no de una postulación suelta.
  select ba.status, ba.quoted_amount
  into v_application_status, v_quoted
  from public.broadcast_applications ba
  where ba.broadcast_id = p_broadcast_id
    and ba.installer_id = p_installer_id
  for update;
  if not found then raise exception 'Postulación no encontrada'; end if;
  if v_application_status <> 'accepted' then
    raise exception 'La cotización todavía no fue aceptada';
  end if;

  -- El coordinador se valida acá además del trigger de `projects`: así el
  -- mensaje que ve el usuario habla de coordinación y no de una relación rota.
  if p_coordinator_id is null then
    raise exception 'Asigná un coordinador antes de crear el proyecto';
  end if;
  if not exists (
    select 1
    from public.company_installers ci
    join public.company_membership_roles cmr
      on cmr.company_id = ci.company_id
     and cmr.user_id = ci.installer_id
     and cmr.role = 'coordinator'
    where ci.company_id = v_broadcast.company_id
      and ci.installer_id = p_coordinator_id
      and ci.status = 'active'
  ) then
    raise exception 'Asigná un coordinador antes de crear el proyecto';
  end if;

  select * into v_company
  from public.companies c
  where c.id = v_broadcast.company_id;

  insert into public.projects (
    company_id, name, client_name, client_id, coordinator_id, description,
    status, starts_at, ends_at, country, zones, planned_installations,
    billing_mode, contract_amount, currency
  )
  select
    v_broadcast.company_id,
    v_name,
    cl.name,
    v_broadcast.client_id,
    p_coordinator_id,
    btrim(concat_ws(
      E'\n\n', nullif(v_broadcast.description, ''), nullif(v_broadcast.requirements, '')
    )),
    'active',
    v_broadcast.scheduled_date,
    v_broadcast.scheduled_end_date,
    v_company.country,
    array[v_broadcast.zone],
    1,
    -- Cobro por instalación: lo que se le factura al cliente todavía no se
    -- sabe, y `contract_amount` es del cliente, NUNCA lo cotizado por el
    -- instalador. Confundirlos volvería a mezclar ingreso con costo.
    'per_installation',
    null,
    v_broadcast.currency
  from public.clients cl
  where cl.id = v_broadcast.client_id
    and cl.company_id = v_broadcast.company_id
  returning id into v_project_id;

  if v_project_id is null then raise exception 'Cliente no encontrado'; end if;

  insert into public.sites (
    project_id, company_id, name, zone, lat, lng, is_placeholder
  )
  values (
    v_project_id, v_broadcast.company_id, v_name, v_broadcast.zone,
    v_broadcast.lat, v_broadcast.lng, true
  )
  returning id into v_site_id;

  -- `order_number` lo pone el trigger; `installer_amount` es lo acordado con
  -- esta persona: lo que cotizó, y si no cotizó, lo que la empresa publicó.
  -- Sin instalador todavía: `assign_installer_gate` es la única puerta para
  -- ese campo (AG-R3) — asignar directo acá, aunque la cotización ya esté
  -- aceptada, sería la misma vía suelta que el resto de la Fase 3 cerró.
  insert into public.work_orders (
    site_id, project_id, company_id, title, description, status,
    scheduled_date, scheduled_end_date, source,
    currency, installer_amount
  )
  values (
    v_site_id, v_project_id, v_broadcast.company_id, v_broadcast.title,
    v_broadcast.logistics_notes, 'pendiente',
    v_broadcast.scheduled_date, v_broadcast.scheduled_end_date, 'broadcast',
    v_broadcast.currency, coalesce(v_quoted, v_broadcast.pay_amount)
  )
  returning id into v_order_id;

  perform public.create_order_activities(v_order_id, false, true);
  if v_broadcast.scheduled_date is not null then
    perform public.set_activity_schedule(
      (select id from public.work_activities where work_order_id = v_order_id),
      v_broadcast.scheduled_date
    );
  end if;

  -- No corta la formalización si el gate bloquea (agenda cambió entre la
  -- cotización y hoy): el proyecto y la orden quedan creados igual, sin
  -- asignar, mismo criterio que el resto del alta de órdenes.
  perform public.assign_installer_gate(
    v_order_id, p_installer_id, gen_random_uuid()
  );

  -- Cierra la trazabilidad: desde el proyecto se puede volver a la
  -- convocatoria que lo originó.
  update public.broadcasts
  set project_id = v_project_id
  where id = p_broadcast_id;

  return v_project_id;
end;
$$;

revoke all on function public.formalize_project_from_broadcast(uuid, uuid, uuid, text) from public;
grant execute on function public.formalize_project_from_broadcast(uuid, uuid, uuid, text) to authenticated;

-- Punto 24, Fase 2: el bloqueo del instalador deja de morir en el historial.
--
-- Hasta acá había dos canales que no se tocaban:
--
--   * El instalador reportaba un bloqueo → `order_updates` tipo 'blocker' →
--     ahí quedaba. No notificaba a nadie, no generaba alerta, no aparecía en
--     ningún panel de la empresa. El coordinador se enteraba sólo si abría esa
--     orden y scrolleaba el historial.
--   * `order_incidents` —con categoría, severidad y `requires_revisit`, que ya
--     alimenta las alertas críticas del dashboard y la tasa de incidencias—
--     sólo lo escribía la Server Action `createIncident`, que exige gerente o
--     coordinador.
--
-- Quien estaba parado en el sitio y veía el problema escribía en un canal que
-- nadie miraba; quien tenía el canal visible no estaba ahí para verlo.
--
-- **La RLS ya estaba bien.** `order_incidents_installer_insert` y
-- `order_incidents_installer_read` ya permiten al instalador ASIGNADO crear y
-- ver incidencias de su propia orden. No hace falta tocar ninguna policy: el
-- muro estaba en `requireOperatorForOrder`, en la capa de aplicación. Esta
-- migración sólo agrega el enlace entre los dos registros.

alter table public.order_incidents
  add column if not exists update_id uuid
    references public.order_updates (id) on delete set null;

comment on column public.order_incidents.update_id is
  'El evento de campo que originó la incidencia. Null en las que carga la empresa desde el escritorio.';

-- ÚNICO, no sólo un índice de lectura: un evento de campo produce una
-- incidencia y nada más. La cola offline reintenta la operación completa
-- cuando vuelve la señal, y sin esto un bloqueo reportado sin conexión
-- aparecería dos o tres veces en el dashboard del coordinador. El
-- `order_update` ya era idempotente por su id de cliente; esto le da a la
-- incidencia la misma garantía, anclada a ese mismo id.
create unique index if not exists order_incidents_update_idx
  on public.order_incidents (update_id) where update_id is not null;

-- ---------------------------------------------------------------------------
-- Un bloqueo deja de parecer un avance más
-- ---------------------------------------------------------------------------

-- Matiz importante del diagnóstico: el bloqueo SÍ generaba notificación. Lo
-- que no hacía era distinguirse. `notify_order_update` mandaba el mismo
-- "Nuevo avance de OT-0001", con el mismo `type = 'update_received'`, para una
-- foto de rutina y para "no puedo seguir, la persiana está tapiada". Entre
-- veinte avances de un día normal, el que importa se perdía.
--
-- Se conserva todo el resto: los mismos destinatarios (gerencia y la
-- coordinación del proyecto, leídos desde `company_membership_roles`), la
-- misma URL por rol, el mismo cuerpo. Sólo cambian el tipo y el título cuando
-- el evento es un bloqueo, y se agrega `severity` para que la campanita del
-- punto 23 lo pinte con el color que corresponde.
create or replace function public.notify_order_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_number text;
  v_project_id uuid;
  v_blocker boolean := new.type = 'blocker';
begin
  if new.installer_id is null then
    return new;
  end if;

  select w.order_number, w.project_id
  into v_order_number, v_project_id
  from public.work_orders w
  where w.id = new.order_id;

  insert into public.notifications (user_id, type, title, body, data)
  select
    p.id,
    case when v_blocker then 'blocker_reported' else 'update_received' end,
    case
      when v_blocker and p.locale = 'pt'
        then 'Trabalho bloqueado em ' || coalesce(v_order_number, 'uma ordem')
      when v_blocker
        then 'Trabajo bloqueado en ' || coalesce(v_order_number, 'una orden')
      when p.locale = 'pt'
        then 'Nova atualização de ' || coalesce(v_order_number, 'uma ordem')
      else 'Nuevo avance de ' || coalesce(v_order_number, 'una orden')
    end,
    left(
      coalesce(
        nullif(new.note, ''),
        case
          when v_blocker and p.locale = 'pt' then 'O instalador reportou um bloqueio.'
          when v_blocker then 'El instalador reportó un bloqueo.'
          when p.locale = 'pt' then 'O instalador enviou uma atualização.'
          else 'El instalador cargó una actualización.'
        end
      ),
      180
    ),
    jsonb_build_object(
      'url',
      case
        when p.role = 'company_manager' and p.company_id = new.company_id
          then '/orders/' || new.order_id
        else '/coordination/' || new.order_id
      end,
      'order_id', new.order_id,
      'update_id', new.id,
      'installer_id', new.installer_id,
      'company_id', new.company_id,
      -- Lo lee la campanita del punto 23 para el color y el chip de prioridad.
      'severity', case when v_blocker then 'warning' else 'info' end,
      'locale', p.locale
    )
  from public.profiles p
  where (
    p.role = 'company_manager'
    and p.company_id = new.company_id
  ) or exists (
    select 1
    from public.projects pr
    join public.company_installers ci
      on ci.company_id = pr.company_id
     and ci.installer_id = pr.coordinator_id
     and ci.status = 'active'
    join public.company_membership_roles cmr
      on cmr.company_id = ci.company_id
     and cmr.user_id = ci.installer_id
     and cmr.role = 'coordinator'
    where pr.id = v_project_id
      and pr.company_id = new.company_id
      and pr.coordinator_id = p.id
  );

  return new;
end;
$$;

comment on function public.notify_order_update() is
  'Avisa a gerencia y a la coordinación del proyecto. Distingue el bloqueo del avance rutinario (tipo, título y severidad propios). Lee capacidades desde company_membership_roles, no desde el rol escalar legacy.';

-- ---------------------------------------------------------------------------
-- La incidencia la crea la base, no la aplicación
-- ---------------------------------------------------------------------------

-- Podría hacerlo la Server Action, y sería más fácil de leer. Pero el área
-- installer tiene DOS caminos hacia `order_updates`: la acción, cuando hay
-- señal, y `lib/offline/sync.ts`, que inserta directo cuando la cola drena.
-- Un bloqueo reportado sin conexión —que es el caso más probable, porque los
-- problemas aparecen en sitios difíciles— nunca habría llegado al dashboard.
--
-- En el trigger vale por los dos caminos y no hay una segunda copia de la
-- regla que se pueda desincronizar.
create or replace function public.blocker_to_incident()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type <> 'blocker' or new.installer_id is null then
    return new;
  end if;

  -- `on conflict do nothing` contra el índice único parcial de `update_id`:
  -- el reintento de la cola no duplica la incidencia. El predicado se repite
  -- porque el índice es parcial y sin él Postgres no lo encuentra (42P10).
  insert into public.order_incidents (
    order_id, company_id, update_id, category, severity,
    description, requires_revisit, created_by, occurred_at
  )
  values (
    new.order_id,
    new.company_id,
    new.id,
    -- Categoría y severidad fijas: el instalador describe y saca fotos.
    -- Clasificar es trabajo del coordinador, que ya tiene la pantalla para
    -- editarla, no de quien está resolviendo el problema en el sitio.
    'technical_issue',
    'high',
    left(coalesce(nullif(new.note, ''), 'Bloqueo reportado desde el campo'), 2000),
    false,
    coalesce(new.created_by, new.installer_id),
    coalesce(new.client_created_at, new.created_at)
  )
  on conflict (update_id) where update_id is not null do nothing;

  return new;
end;
$$;

drop trigger if exists order_updates_blocker_to_incident on public.order_updates;
create trigger order_updates_blocker_to_incident
  after insert on public.order_updates
  for each row execute function public.blocker_to_incident();

comment on function public.blocker_to_incident() is
  'Un bloqueo del campo abre una incidencia formal. En trigger y no en la aplicación porque el área installer escribe por dos caminos (acción online y cola offline).';

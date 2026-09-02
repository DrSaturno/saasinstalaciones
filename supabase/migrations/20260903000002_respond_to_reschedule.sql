-- Fase 2 de confiabilidad: el instalador contesta la reprogramación.
--
-- **Qué se valida y qué no.** Se valida que quien contesta sea el instalador
-- de esa reprogramación, que el aviso exista, que no haya sido superada por
-- otra y que no esté ya contestada. Lo que **no** se valida es que la respuesta
-- llegue dentro del plazo, y es a propósito: el requisito no dice que una
-- respuesta tardía se rechace, dice que la falta de respuesta puede afectar la
-- confiabilidad. Alguien que contesta tarde igual está diciendo algo que la
-- empresa necesita saber; cerrarle la puerta la dejaría peor. Si llegó en
-- término o no se deriva después comparando `responded_at` con el plazo, que
-- es lo que hace `rescheduleState` en el dominio.
--
-- Esto además evita duplicar la aritmética de días hábiles en SQL. Vive en
-- `lib/domain/business-days.ts` y tiene que vivir en un solo lugar: dos
-- implementaciones de la misma regla terminan discrepando justo en el feriado
-- que importa.
--
-- **Darse de baja desvincula.** El requisito dice que dentro del plazo el
-- instalador "podrá desvincularse del trabajo sin afectar su nivel de
-- confiabilidad". Desvincularse es quedar fuera de la orden, así que la
-- respuesta `declined` la desasigna y avisa a la empresa — que es justamente
-- el tiempo de reorganización que el plazo busca proteger.
--
-- El estado de la orden NO se toca. Queda como estaba pero sin instalador, que
-- es lo que la empresa necesita ver para reasignarla. Cambiar de estado es
-- potestad de `transitionOrder`.

create or replace function public.respond_to_reschedule(
  p_reschedule_id uuid,
  p_response text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.order_reschedules%rowtype;
  v_order public.work_orders%rowtype;
  v_installer_name text;
begin
  if p_response not in ('accepted', 'declined') then
    raise exception 'Respuesta inválida';
  end if;

  select * into v_row
  from public.order_reschedules r
  where r.id = p_reschedule_id
  for update;
  if not found then raise exception 'Reprogramación no encontrada'; end if;

  if v_row.installer_id is distinct from auth.uid() then
    raise exception 'Sólo el instalador asignado puede responder';
  end if;
  if v_row.notified_at is null then
    raise exception 'Esta reprogramación todavía no fue notificada';
  end if;
  if v_row.superseded_at is not null then
    raise exception 'La fecha volvió a cambiar: respondé la reprogramación vigente';
  end if;
  if v_row.response is not null then
    raise exception 'Esta reprogramación ya fue respondida';
  end if;

  update public.order_reschedules
  set response = p_response,
      responded_at = now()
  where id = p_reschedule_id;

  if p_response = 'declined' then
    select * into v_order
    from public.work_orders w where w.id = v_row.order_id
    for update;

    -- `installer_accepted_at` se limpia junto con la asignación: dejarlo
    -- haría ver como aceptado un compromiso que ya no existe.
    update public.work_orders
    set assigned_installer_id = null,
        installer_accepted_at = null
    where id = v_row.order_id;

    select pr.full_name into v_installer_name
    from public.profiles pr where pr.id = v_row.installer_id;

    -- Mismo criterio de destinatarios que `notify_order_update`: gerencia de
    -- la empresa más la coordinación responsable del proyecto.
    insert into public.notifications (user_id, type, title, body, data)
    select
      p.id,
      'reschedule_declined',
      case when p.locale = 'pt'
        then 'Instalador saiu após o reagendamento'
        else 'El instalador se dio de baja por la reprogramación' end,
      coalesce(v_order.order_number, '') || ' · ' ||
      coalesce(v_installer_name,
        case when p.locale = 'pt' then 'O instalador' else 'El instalador' end) ||
      case when p.locale = 'pt'
        then ' não pode manter a nova data.'
        else ' no puede sostener la fecha nueva.' end,
      jsonb_build_object(
        'url',
        case
          when p.role = 'company_manager' and p.company_id = v_row.company_id
            then '/orders/' || v_row.order_id
          else '/coordination/' || v_row.order_id
        end,
        'order_id', v_row.order_id,
        'reschedule_id', p_reschedule_id,
        'installer_id', v_row.installer_id,
        'company_id', v_row.company_id,
        'locale', p.locale
      )
    from public.profiles p
    where (
      p.role = 'company_manager'
      and p.company_id = v_row.company_id
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
      where pr.id = v_order.project_id
        and pr.company_id = v_row.company_id
        and p.id = pr.coordinator_id
    );
  end if;
end;
$$;

revoke all on function public.respond_to_reschedule(uuid, text) from public;
grant execute on function public.respond_to_reschedule(uuid, text) to authenticated;

comment on function public.respond_to_reschedule(uuid, text) is
  'Registra la respuesta del instalador a una reprogramación. No rechaza respuestas fuera de plazo: si llegó en término se deriva de responded_at contra el deadline, que se calcula en el dominio para no duplicar la regla de días hábiles.';

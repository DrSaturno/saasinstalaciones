-- Una orden creada ya asignada debe notificar igual que una asignación posterior.

create or replace function public.notify_order_assignment()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.assigned_installer_id is not null
     and (
       tg_op = 'INSERT'
       or new.assigned_installer_id is distinct from old.assigned_installer_id
     ) then
    insert into public.notifications (user_id, type, title, body, data)
    select
      p.id,
      'order_assigned',
      case when p.locale = 'pt' then 'Nova ordem atribuída' else 'Nueva orden asignada' end,
      new.order_number || ' · ' || new.title,
      jsonb_build_object(
        'url', '/tasks/' || new.id,
        'order_id', new.id,
        'company_id', new.company_id,
        'locale', p.locale
      )
    from public.profiles p
    where p.id = new.assigned_installer_id;
  end if;
  return new;
end;
$$;

create trigger work_orders_notify_assignment_on_insert
  after insert on public.work_orders
  for each row
  when (new.assigned_installer_id is not null)
  execute function public.notify_order_assignment();


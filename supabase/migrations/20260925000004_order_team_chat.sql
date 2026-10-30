-- Bloque 5 (docs/specs/2026-09-24-multi-instalador): chat grupal por orden.
--
-- Una orden con equipo tiene UN hilo de conversación, no uno por integrante
-- (MULTIINST-R5.1): participan el responsable, los ayudantes activos y quien
-- opera la orden (gerente, o el coordinador de ese proyecto). El hilo 1:1 de
-- siempre (`chat_threads`) no se toca: sigue sirviendo para hablar con una
-- persona a través de todas sus órdenes.
--
-- **La orden ES el hilo.** No hay tabla de hilos: los mensajes cuelgan de
-- `order_id`, así que no puede haber dos hilos para la misma orden ni un hilo
-- huérfano de una orden. La membresía no se guarda en ningún lado, se deriva en
-- cada consulta de quién opera la orden y del plantel activo: quien se quita del
-- equipo deja de leer y de escribir en el mismo instante, sin nada que limpiar.
--
-- **Sólo texto** en esta primera versión: sin adjuntos, sin respuestas
-- citadas y sin tildes de leído. El aviso de mensaje nuevo sale por la bandeja
-- de notificaciones, como en el chat 1:1.
--
-- Migración de expand: tabla nueva y funciones nuevas; no toca nada existente.

-- ---------------------------------------------------------------------------
-- 1. Quién puede usar el chat de una orden
-- ---------------------------------------------------------------------------

create or replace function public.auth_can_use_order_chat(
  p_order_id uuid,
  p_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.company_is_active(p_company_id)
    and exists (
      select 1
      from public.work_orders w
      where w.id = p_order_id
        and w.company_id = p_company_id
        and (
          w.assigned_installer_id = auth.uid()
          or public.auth_is_order_helper(w.id)
          or public.auth_can_operate_work_order(w.id, w.company_id)
        )
    )
$$;

revoke all on function public.auth_can_use_order_chat(uuid, uuid) from public, anon;
grant execute on function public.auth_can_use_order_chat(uuid, uuid) to authenticated;

-- Cuántos ayudantes activos tiene la orden. Lo necesita el responsable, que por
-- RLS no ve las filas del plantel (sólo quien opera la orden las ve todas) pero
-- sí tiene que saber si hay un chat grupal que mostrar.
create or replace function public.order_team_size(p_order_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.work_orders w
      where w.id = p_order_id
        and public.auth_can_use_order_chat(w.id, w.company_id)
    )
    then (
      select count(*)::integer
      from public.work_order_team_members m
      where m.order_id = p_order_id and m.status = 'active'
    )
    else 0
  end
$$;

revoke all on function public.order_team_size(uuid) from public, anon;
grant execute on function public.order_team_size(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Mensajes
-- ---------------------------------------------------------------------------

create table public.order_chat_messages (
  -- Lo genera el cliente: reenviar el mismo mensaje tras un corte no lo duplica.
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.work_orders (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  -- Copia del nombre al escribir. Un instalador no puede leer el perfil de un
  -- gerente, y el chat tiene que mostrar quién habló; se guarda acá, por
  -- trigger, en vez de abrir la lectura de `profiles`.
  sender_name text not null default '',
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index order_chat_messages_order_created_idx
  on public.order_chat_messages (order_id, created_at);

alter table public.order_chat_messages enable row level security;

comment on table public.order_chat_messages is
  'Chat grupal de una orden con equipo (bloque 5). La orden es el hilo; la membresía se deriva del plantel activo y de quien opera la orden, no se guarda.';

create policy order_chat_messages_read on public.order_chat_messages
  for select to authenticated
  using (public.auth_can_use_order_chat(order_id, company_id));

create policy order_chat_messages_insert on public.order_chat_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.auth_can_use_order_chat(order_id, company_id)
  );

-- El chat es un registro: no se edita ni se borra. Sin policies de update ni
-- delete ya no se podría, pero los privilegios por defecto de Supabase le dan
-- TODO a `authenticated` y `anon` sobre una tabla nueva, así que además se
-- quitan de raíz — una policy agregada por error más adelante no debería
-- reabrir la edición de mensajes.
revoke all on public.order_chat_messages from anon, authenticated;
grant select, insert on public.order_chat_messages to authenticated;

create or replace function public.order_chat_messages_fill_sender()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(nullif(btrim(p.full_name), ''), '') into new.sender_name
  from public.profiles p
  where p.id = new.sender_id;
  new.sender_name := coalesce(new.sender_name, '');
  new.body := btrim(new.body);
  return new;
end;
$$;

revoke all on function public.order_chat_messages_fill_sender() from public, anon, authenticated;

create trigger order_chat_messages_fill_sender
  before insert on public.order_chat_messages
  for each row execute function public.order_chat_messages_fill_sender();

-- ---------------------------------------------------------------------------
-- 3. Aviso de mensaje nuevo
-- ---------------------------------------------------------------------------

-- Va en la base porque la RLS de `notifications` impide escribir en la bandeja
-- ajena. Avisa al responsable, a los ayudantes activos, a los gerentes de la
-- empresa y al coordinador del proyecto; nunca a quien escribió. Cada uno cae
-- en su pantalla: los instaladores en la tarea, la empresa en la orden.
create or replace function public.notify_order_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.work_orders%rowtype;
  v_coordinator uuid;
begin
  select * into v_order from public.work_orders w where w.id = new.order_id;
  if not found then
    return new;
  end if;

  select p.coordinator_id into v_coordinator
  from public.projects p where p.id = v_order.project_id;

  insert into public.notifications (user_id, type, title, body, data)
  select
    r.user_id,
    'chat_message',
    coalesce(nullif(new.sender_name, ''), v_order.order_number),
    v_order.order_number || ' · ' || left(new.body, 120),
    jsonb_build_object(
      'url', case when r.is_installer then '/tasks/' else '/orders/' end || v_order.id,
      'order_id', v_order.id,
      'company_id', v_order.company_id,
      'locale', p.locale
    )
  from (
    select v_order.assigned_installer_id as user_id, true as is_installer
    where v_order.assigned_installer_id is not null
    union
    select m.installer_id, true
    from public.work_order_team_members m
    where m.order_id = new.order_id and m.status = 'active'
    union
    select pr.id, false
    from public.profiles pr
    where pr.company_id = v_order.company_id and pr.role = 'company_manager'
    union
    select v_coordinator, false
    where v_coordinator is not null
  ) r
  join public.profiles p on p.id = r.user_id
  where r.user_id <> new.sender_id;

  return new;
end;
$$;

revoke all on function public.notify_order_chat_message() from public, anon, authenticated;

create trigger order_chat_messages_notify
  after insert on public.order_chat_messages
  for each row execute function public.notify_order_chat_message();

-- ---------------------------------------------------------------------------
-- 4. Tiempo real
-- ---------------------------------------------------------------------------

-- Realtime respeta la RLS de lectura: cada integrante recibe sólo los mensajes
-- de las órdenes donde participa. Condicional para que una base sin la
-- publicación (un entorno mínimo de pruebas) no rompa la migración.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'order_chat_messages'
     ) then
    alter publication supabase_realtime add table public.order_chat_messages;
  end if;
end;
$$;

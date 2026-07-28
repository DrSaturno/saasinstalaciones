-- Dos cosas independientes:
--   1. Avisar por notificación cuando llega un mensaje de chat (hoy no avisa
--      nada: el mensaje aparece en la conversación y listo).
--   2. Fecha y hora de ocurrencia de la incidencia, separada de la de carga.
--
-- Idempotente: se puede re-ejecutar sin daño.

-- ---------------------------------------------------------------------------
-- 1. Notificación al recibir un mensaje
-- ---------------------------------------------------------------------------
-- Un hilo es empresa <-> instalador. Quien no envió, recibe el aviso:
--   * si escribe el instalador  -> avisa al gerente y a los coordinadores
--   * si escribe alguien de la empresa -> avisa al instalador
-- La notificación es lo que dispara el push, así que esto cubre ambos canales.

create or replace function public.notify_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_installer uuid;
  v_company uuid := new.company_id;
  v_sender_name text;
  v_company_name text;
  v_preview text;
begin
  select installer_id into v_installer
  from public.chat_threads where id = new.thread_id;

  select full_name into v_sender_name
  from public.profiles where id = new.sender_id;

  select name into v_company_name
  from public.companies where id = v_company;

  -- Vista previa corta; si sólo hay adjuntos, se avisa como archivo.
  v_preview := case
    when char_length(trim(coalesce(new.body, ''))) > 0
      then left(new.body, 120)
    else null
  end;

  if new.sender_id = v_installer then
    -- Instalador -> empresa: gerente y coordinadores de esa empresa.
    insert into public.notifications (user_id, type, title, body, data)
    select
      p.id,
      'chat_message',
      coalesce(v_sender_name, case when p.locale = 'pt' then 'Instalador' else 'Instalador' end),
      coalesce(
        v_preview,
        case when p.locale = 'pt' then 'Enviou um anexo' else 'Envió un archivo adjunto' end
      ),
      jsonb_build_object(
        'url', '/messages/' || v_installer,
        'thread_id', new.thread_id,
        'company_id', v_company,
        'locale', p.locale
      )
    from public.profiles p
    where p.company_id = v_company
      and p.role in ('company_manager', 'coordinator')
      and p.id <> new.sender_id;
  else
    -- Empresa -> instalador.
    insert into public.notifications (user_id, type, title, body, data)
    select
      p.id,
      'chat_message',
      coalesce(v_company_name, case when p.locale = 'pt' then 'Mensagem' else 'Mensaje' end),
      coalesce(
        v_preview,
        case when p.locale = 'pt' then 'Enviou um anexo' else 'Envió un archivo adjunto' end
      ),
      jsonb_build_object(
        'url', '/messages',
        'thread_id', new.thread_id,
        'company_id', v_company,
        'locale', p.locale
      )
    from public.profiles p
    where p.id = v_installer
      and p.id <> new.sender_id;
  end if;

  return new;
end;
$$;

drop trigger if exists chat_messages_notify on public.chat_messages;
create trigger chat_messages_notify
  after insert on public.chat_messages
  for each row execute function public.notify_chat_message();


-- ---------------------------------------------------------------------------
-- 2. Fecha y hora de ocurrencia de la incidencia
-- ---------------------------------------------------------------------------
-- `created_at` es cuándo se cargó. `occurred_at` es cuándo pasó, que puede ser
-- antes (el instalador la carga al volver, o sin señal). Se completa con la
-- fecha de carga para las incidencias que ya existen.

alter table public.order_incidents
  add column if not exists occurred_at timestamptz;

update public.order_incidents
set occurred_at = created_at
where occurred_at is null;

alter table public.order_incidents
  alter column occurred_at set default now();

comment on column public.order_incidents.occurred_at is
  'Momento en que ocurrió la incidencia, informado por quien la carga. Distinto de created_at, que es cuándo se registró.';

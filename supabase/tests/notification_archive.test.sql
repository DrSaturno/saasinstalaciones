-- Punto 23: archivar y descartar es estado POR DESTINATARIO, y nunca borra.
--
-- Lo que este archivo cuida es la promesa central del pedido: sacar un aviso
-- de la vista de una persona no puede tocar el registro ni la bandeja de
-- otra. Como cada notificación ya es una fila por destinatario, eso sale del
-- modelo — pero es exactamente el tipo de garantía que se rompe sola en un
-- refactor si nadie la afirma.

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

insert into public.companies (id, name, country, order_prefix)
values ('c9000000-0000-0000-0000-000000000001', 'Empresa Avisos', 'AR', 'EAV');

insert into auth.users (id, email, raw_user_meta_data) values
  ('c9000000-0000-0000-0000-000000000011', 'uno.eav@test.dev',
   '{"role":"installer"}'::jsonb),
  ('c9000000-0000-0000-0000-000000000012', 'dos.eav@test.dev',
   '{"role":"installer"}'::jsonb);

-- El mismo aviso, dos destinatarios: una fila cada uno.
insert into public.notifications (id, user_id, type, title, body, data, read_at) values
  ('c9000000-0000-0000-0000-0000000000a1', 'c9000000-0000-0000-0000-000000000011',
   'announcement', 'Comunicado', 'Corte de calle', '{"severity":"critical"}'::jsonb, now()),
  ('c9000000-0000-0000-0000-0000000000a2', 'c9000000-0000-0000-0000-000000000012',
   'announcement', 'Comunicado', 'Corte de calle', '{"severity":"critical"}'::jsonb, now()),
  -- Sin leer: no se puede archivar (NOT-R2).
  ('c9000000-0000-0000-0000-0000000000a3', 'c9000000-0000-0000-0000-000000000011',
   'order_assigned', 'Orden asignada', 'EAV-0001', '{}'::jsonb, null);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"c9000000-0000-0000-0000-000000000011","role":"authenticated"}';

update public.notifications set archived_at = now()
 where id = 'c9000000-0000-0000-0000-0000000000a1'
   and read_at is not null;

select is(
  (select count(*)::integer from public.notifications
    where id = 'c9000000-0000-0000-0000-0000000000a1' and archived_at is not null),
  1,
  'el destinatario archiva su propia notificación'
);

select is(
  (select count(*)::integer from public.notifications
    where id = 'c9000000-0000-0000-0000-0000000000a1'),
  1,
  'y la fila sigue existiendo: archivar no borra'
);

-- La del otro destinatario, intacta.
set local request.jwt.claims to
  '{"sub":"c9000000-0000-0000-0000-000000000012","role":"authenticated"}';

select is(
  (select count(*)::integer from public.notifications
    where id = 'c9000000-0000-0000-0000-0000000000a2' and archived_at is null),
  1,
  'el otro destinatario del mismo aviso no se entera: sigue en su bandeja'
);

select is(
  (select count(*)::integer from public.notifications
    where id = 'c9000000-0000-0000-0000-0000000000a1'),
  0,
  'y ni siquiera ve la notificación ajena: la RLS sigue acotando por usuario'
);

-- Descartar: tampoco borra.
set local request.jwt.claims to
  '{"sub":"c9000000-0000-0000-0000-000000000011","role":"authenticated"}';

update public.notifications set dismissed_at = now()
 where id = 'c9000000-0000-0000-0000-0000000000a1'
   and read_at is not null;

select is(
  (select count(*)::integer from public.notifications
    where id = 'c9000000-0000-0000-0000-0000000000a1'
      and dismissed_at is not null and archived_at is not null),
  1,
  'descartar conserva la marca de archivado y tampoco borra la fila'
);

-- Sin leer, la guarda de la acción (read_at not null) no deja archivar.
update public.notifications set archived_at = now()
 where id = 'c9000000-0000-0000-0000-0000000000a3'
   and read_at is not null;

select is(
  (select count(*)::integer from public.notifications
    where id = 'c9000000-0000-0000-0000-0000000000a3' and archived_at is null),
  1,
  'una notificación sin leer no se archiva: las pendientes siguen visibles'
);

reset role;

select * from finish();
rollback;

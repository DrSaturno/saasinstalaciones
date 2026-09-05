-- Punto 23: archivar y descartar notificaciones, sin borrar el registro.
--
-- Hoy la bandeja acumula todo lo leído para siempre: `notifications` sólo
-- tiene `read_at`, y la policy `notifications_own` es `for all`, así que la
-- única forma de sacar algo de la vista sería un `delete`. Eso es
-- exactamente lo que el pedido prohíbe — el registro tiene que quedar para
-- trazabilidad, y lo que cambia es qué ve ese destinatario.
--
-- **Por qué dos timestamps y no un `status`.** El resto del schema ya habla
-- así (`read_at`, `finalized_at`, `sites.archived_at`): un timestamp dice
-- cuándo además de si, y no hay que migrar un enum cada vez que aparece un
-- estado nuevo. Y hacen falta las dos fechas por separado: archivar y
-- descartar son acciones distintas, y una archivada que después se descarta
-- conserva las dos marcas.
--
-- Como cada notificación ya es una fila POR DESTINATARIO, el archivado
-- resulta naturalmente independiente entre personas: dos instaladores del
-- mismo anuncio tienen filas distintas y se archivan sin tocarse (AC-13-A).
alter table public.notifications
  add column if not exists archived_at timestamptz,
  add column if not exists dismissed_at timestamptz;

comment on column public.notifications.archived_at is
  'Sale de la bandeja principal pero se puede ver y recuperar en Archivadas. No borra nada.';
comment on column public.notifications.dismissed_at is
  'Oculta la notificación para ese destinatario, de forma definitiva. La fila queda para trazabilidad.';

-- La bandeja normal nunca mira lo descartado: el índice parcial es lo que
-- hace que ese filtro no cueste.
create index if not exists notifications_user_inbox_idx
  on public.notifications (user_id, created_at desc)
  where dismissed_at is null;

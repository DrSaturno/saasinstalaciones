# Diseño

## Fase 0 — Estado por destinatario

Dos columnas nuevas en `notifications`, nada más:

```sql
alter table public.notifications
  add column archived_at timestamptz,
  add column dismissed_at timestamptz;

create index notifications_user_inbox_idx
  on public.notifications (user_id, created_at desc)
  where dismissed_at is null;
```

**Por qué dos timestamps y no un `status`.** El resto del schema ya usa
este vocabulario (`read_at`, `finalized_at`, `archived_at` en `sites`): un
timestamp dice *cuándo* además de *si*, y no hay que migrar un enum cada vez
que aparece un estado nuevo. Además hacen falta las dos fechas por separado
— archivar y descartar son acciones distintas (NOT-R3), y una archivada que
después se descarta conserva ambas marcas.

**El índice parcial** es lo que hace barata la bandeja: la consulta normal
nunca mira lo descartado.

La RLS no cambia: `notifications_own` ya es `for all` sobre `user_id =
auth.uid()`, así que archivar y descartar son `update` sobre la propia fila.
Lo que sí cambia es que **deja de haber motivo para borrar**.

`lib/data/notifications.ts` pasa a leer `data->>'severity'` (hoy lo
descarta) y a filtrar por estado. `NotificationItem` gana `severity` y
`archivedAt`.

## Fase 1 — La bandeja

**Dónde vive.** `app/(inbox)/notifications/page.tsx`, un route group nuevo
que sirve a las dos áreas con un solo archivo — mismo patrón que
`app/(messaging)/messages/layout.tsx`, que ya resuelve exactamente esto
decidiendo el nav según el rol. Poner la página en `(company)` y otra en
`(installer)` sería el mismo build error de rutas paralelas que ya apareció
en el punto 21: los route groups no prefijan la URL.

**Las tres vistas** salen de un `searchParam` (`?filter=pending|archived|all`),
no de estado de cliente: así el enlace es compartible y el filtro sobrevive
a la recarga. Por defecto, `pending` — la bandeja arranca mostrando lo que
falta atender, que es el principio funcional del pedido.

**Severidad accesible** (NOT-R4): el mismo trío de colores que ya usa el
resto del producto (`destructive` / `warning` / neutro) más la palabra —
"Urgente" / "Atención" / "Información" — y un ícono. Nunca sólo el color.
Se reutiliza el vocabulario visual de `ORDER_STATUS`/`StatusBadge`, no se
inventa uno nuevo.

La campanita sigue existiendo igual (12 ítems, acceso rápido), pero suma un
enlace "Ver todas" a la página. No se la reemplaza: para el 90% de los
casos el dropdown alcanza.

## Fase 2 — Segmentación combinable, preview e idempotencia

**El modelo de audiencia cambia de forma.** Hoy:

```
audience_type text check (in ('all','zone','project'))
audience_ref  text
```

Un enum de un valor y una referencia suelta no pueden expresar "Buenos
Aires + disponibles". Pasa a:

```sql
alter table public.announcements
  add column audience jsonb not null default '{}'::jsonb;
```

con la forma `{ "zones": ["Buenos Aires"], "projectIds": ["…"], "availableOnly": true }`.
Las columnas viejas **se conservan** y se siguen escribiendo para el
histórico ya publicado: reescribir 
`audience_type`/`audience_ref` sería reescribir el pasado, y el historial de
la empresa los lee.

**Una sola consulta para contar y para enviar** (COM-R2). Se extrae el
público a una función:

```sql
create function public.announcement_audience(p_company uuid, p_audience jsonb)
returns table (installer_id uuid)
```

`announcement_audience_count()` la usa para el preview y
`publish_announcement()` la usa para el fan-out. No hay dos definiciones de
"quién lo recibe" que puedan divergir.

**Disponibilidad** (`availableOnly`) se resuelve con lo que ya existe:
`installers.available` (el interruptor de la persona) y ninguna ausencia
aprobada vigente en `installer_unavailability`. No se inventa una tabla
nueva: es la misma noción de "hoy puede trabajar" que usa el dashboard.

**Idempotencia** (COM-R3): el fan-out pasa a insertar con
`dedupe_key = 'announcement:' || v_id || ':' || destinatario`, sobre el
índice único parcial que ya existe (`notifications_dedupe_key_idx`), con
`on conflict (dedupe_key) do nothing`. Republicar el mismo anuncio no
duplica.

**Preview en el compositor**: un conteo que se pide al cambiar los
criterios, antes de publicar. Si da cero, se avisa — hoy publicar a cero
personas es silencioso, que es cómo el bug del selector de provincias pasó
desapercibido.

## Fase 3 — Push y el selector de provincias

**Push** (COM-R6, AC-23-H): `announcement` se suma al union `PushEvent`
(`lib/push/events.ts`) y a la constante `EVENTS` de la Edge Function
(`supabase/functions/send-event-push/index.ts`), con su rama en
`notificationFilter()` (`type = 'announcement'`). `publishAnnouncement`
llama a `requestPushDelivery` en el mismo `after()` donde ya manda los
emails — best-effort, sin bloquear la publicación, igual que el resto.

**El selector de provincias** deja de alimentarse de `sites.zone` (dónde
hay obra) y pasa a alimentarse de `installers.zones` del roster activo
(dónde hay gente que puede recibir el aviso). Es una función de datos nueva
y chica, `fetchRosterZones`, que responde la pregunta correcta: *¿a qué
provincias puedo comunicarme?*

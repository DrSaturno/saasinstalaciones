# 23. Notificaciones y mensajería interna

## Contexto

Traza a `REQ-13` de `docs/specs/2026-08-04-evolucion-producto/`, con las
tareas `R6-NOT-01/02` y `R8-COM-01..04` — todas sin marcar.

Auditando el código real antes de escribir nada, el reparto es desparejo:
la mitad de la infraestructura existe y funciona, y la otra mitad no existe
en absoluto.

**Ya existe y se reutiliza:**

- `notifications` con `read_at` y **una fila por destinatario**, que es
  exactamente la base correcta para archivar por usuario sin tocar el
  registro de origen (AC-13-A sale casi gratis sobre este modelo).
- RLS `notifications_own` por `user_id`, realtime, marcar leída / todas.
- `announcements` con severidad `info|warning|critical` y segmentos
  `all|zone|project`, con email best-effort por Resend.
- Web Push funcionando de punta a punta (Edge Function `send-event-push`,
  `push_subscriptions`, permisos desde la campanita) — para **6 eventos
  operativos**.
- `notification_outbox` + `notification_deliveries` +
  `persist_in_app_notification()`: infra idempotente ya construida.

**No existe:**

- Archivar / descartar. Ni columna ni acción. Hoy la única forma de sacar
  algo de la bandeja sería un `DELETE` — justo lo que el pedido prohíbe
  ("sin eliminar necesariamente el registro original… por trazabilidad").
- Una bandeja de verdad: hoy son **12 ítems fijos** en el dropdown de la
  campanita, sin paginación, sin filtros, sin página propia. Las leídas
  empujan a las no leídas fuera de la lista — el problema exacto que
  describe el pedido.
- Prioridad visible en la campanita: la severidad **sí viaja** en
  `notifications.data->>'severity'`, pero `lib/data/notifications.ts` la
  descarta al mapear. El único color es un punto azul/gris de leído/no
  leído, sin texto ni ícono (falla accesibilidad de REQ-13.2).
- Segmentos por localidad, tipo de instalador o disponibilidad, y
  **criterios combinables** (hoy `audience_type` es un enum de un solo
  valor + un `audience_ref` de texto).
- Preview/conteo antes de enviar, e idempotencia: republicar el mismo aviso
  duplica notificaciones para todos.

**Bug encontrado en la auditoría:** la UI le promete al gerente que el
anuncio llega "al celular" por push (`Announcements.description` y
`deliveryNote` en `messages/es.json`), y eso **no ocurre**:
`requestPushDelivery` nunca se llama desde `lib/actions/announcements.ts`, y
`announcement` no está en la lista de eventos de la Edge Function.

**Segundo bug:** el selector de provincias del compositor se llena con
`sites.zone` (provincias donde hay *sitios*), pero el fan-out matchea contra
`installers.zones` (provincias que declaró el *instalador*). Una provincia
con instaladores pero sin sitios activos no aparece en la lista; y elegir
`"Sin zona"` publica a cero personas sin ninguna advertencia.

## Decisiones tomadas con Nicolás antes de empezar

- **Archivar y descartar son dos acciones distintas.** Archivar saca de la
  bandeja principal pero se puede ver y recuperar; descartar oculta para
  siempre *para ese usuario*. **Ninguna de las dos borra la fila** — el
  registro queda para trazabilidad, que es lo que el pedido pide
  explícitamente.
- **Segmentación: disponibilidad + criterios combinables.** Se suma
  "disponibles" como filtro y los criterios pasan a combinarse (ej.
  Buenos Aires + disponibles). **No** se agrega "tipo de instalador"
  (`installers.skills` existe en la base pero está muerto: se lee, nunca se
  escribe — habría que construir primero la carga de oficios) ni
  "localidad" (`installers.base_city` es texto libre sin catálogo, el
  filtro sería frágil). Ambos quedan documentados como trabajo futuro.
- **Se implementa el push para anuncios**, en vez de corregir el texto a la
  baja: un aviso urgente que no suena en el celular no sirve para una
  alerta climática ni para un cambio de último momento, que es justamente
  el caso de uso que el pedido nombra.

## Lo que NO se toca

- La separación con la Bolsa de Trabajo ya se cumple de hecho:
  `publish_announcement` no escribe en `broadcasts`, `broadcast_applications`
  ni `work_orders` — su único `insert` fuera de `announcements` es a
  `notifications`. No hay trigger sobre `announcements`. **Se agrega un test
  que lo blinde** (`R8-COM-04`), pero no hay nada que reparar.
- El fan-out sigue arrancando de `company_installers` acotado por
  `company_id`: es tenant-safe y así se queda (AC-13-C).

## Fases

1. **Fase 0** — Estado por destinatario: `archived_at`/`dismissed_at`,
   acciones, y que la severidad deje de descartarse al leer.
2. **Fase 1** — La bandeja: página propia `/notifications` en un route group
   compartido (mismo patrón que `(messaging)`, que ya sirve a las dos áreas
   con un solo archivo), filtros pendientes/archivadas, severidad con color
   **y** texto, paginación.
3. **Fase 2** — Segmentación combinable + disponibilidad + preview con
   conteo + idempotencia por `dedupe_key`.
4. **Fase 3** — Push para anuncios y arreglo del selector de provincias.

## Archivos clave

- `supabase/migrations/20260728000005_announcement_notification_url.sql` —
  última definición de `publish_announcement`, la que hay que reemplazar.
- `lib/data/notifications.ts` — bandeja (12 ítems, descarta severidad).
- `lib/actions/notifications.ts` — `markNotificationRead`, `markAll…`.
- `components/notifications/notification-menu.tsx` — la campanita.
- `lib/actions/announcements.ts` + `components/company/announcement-composer.tsx`.
- `lib/push/events.ts` + `supabase/functions/send-event-push/index.ts` —
  los 6 eventos de push a los que hay que sumar `announcement`.
- `app/(messaging)/messages/layout.tsx` — el patrón de route group
  compartido entre áreas que evita el choque de rutas.

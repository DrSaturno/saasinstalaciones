# Tareas

Trazan a `REQ-13` de la spec madre (`R6-NOT-01/02`, `R8-COM-01..04`).

## Fase 0 — Estado por destinatario

- [x] **NOT-ST-01** — Migración: `archived_at` / `dismissed_at` en
  `notifications` + índice parcial de bandeja. → NOT-R1
- [x] **NOT-ST-02** — `archiveNotification`, `unarchiveNotification`,
  `dismissNotification` en `lib/actions/notifications.ts`, todas exigiendo
  que la notificación esté leída. → NOT-R2, NOT-R3, AC-23-C
- [x] **NOT-ST-03** — `lib/data/notifications.ts` deja de descartar
  `data.severity` y filtra por estado; `NotificationItem` gana `severity` y
  `archivedAt`. → NOT-R5
- [x] **NOT-ST-04** — Test pgTAP: archivar/descartar es por destinatario y
  no borra la fila; el otro destinatario del mismo anuncio no se entera.
  → AC-23-A, AC-23-B

## Fase 1 — La bandeja

- [x] **NOT-UI-01** — `app/(inbox)/notifications/page.tsx` en un route group
  compartido (patrón `(messaging)`), con filtro pendientes/archivadas/todas
  por `searchParam`.
- [x] **NOT-UI-02** — Severidad con color **y** texto e ícono. → NOT-R4,
  AC-23-D
- [x] **NOT-UI-03** — Acciones de archivar/desarchivar/descartar en la
  bandeja, y enlace "Ver todas" desde la campanita.

## Fase 2 — Segmentación combinable, preview e idempotencia

- [x] **COM-SEG-01** — `announcements.audience jsonb`, conservando
  `audience_type`/`audience_ref` para el histórico ya publicado.
- [x] **COM-SEG-02** — `announcement_audience()` como única definición del
  público; `publish_announcement()` reescrita para usarla. → COM-R1, COM-R5
- [x] **COM-SEG-03** — Criterio de disponibilidad (`installers.available` +
  sin ausencia aprobada vigente).
- [x] **COM-SEG-04** — `announcement_audience_count()` y preview en el
  compositor con la misma consulta. → COM-R2, AC-23-E
- [x] **COM-SEG-05** — `dedupe_key` en el fan-out. → COM-R3, AC-23-F
- [x] **COM-SEG-06** — Test pgTAP: segmentos combinados, tenant-safety,
  idempotencia, y que publicar no crea bolsa/postulación/OT. → COM-R4,
  AC-23-G

## Fase 3 — Push y selector de provincias

- [x] **COM-PUSH-01** — `announcement` en `PushEvent` y en la Edge Function.
  → COM-R6, AC-23-H
- [x] **COM-PUSH-02** — `requestPushDelivery` desde `publishAnnouncement`.
- [x] **COM-FIX-01** — El selector de provincias sale del roster
  (`installers.zones`), no de `sites.zone`.

## Verificación

Contra Demo (empresa de prueba `77000000-…-0001`, borrada al terminar), con
RLS activa y el server apuntado a Demo sin tocar `.env.local`.

- **pgTAP** — `notification_archive` 6/6, `announcement_audience` 8/8.
- **Instalador** (`/notifications`) — los tres filtros; chips de severidad
  con color **y** texto ("Urgente" / "Atención" / "Información"); marca "Sin
  leer"; archivar y descartar deshabilitados mientras la notificación está
  sin leer y habilitados una vez leída; ciclo completo archivar →
  "Archivadas" → "Recuperar".
- **Gerente** (compositor en `/dashboard`) — las provincias salen del
  roster (Buenos Aires, Córdoba), no de `sites.zone`; el preview siguió a
  cada cambio de criterio (2 → 1 al marcar Córdoba, y combinando con "sólo
  disponibles"); publicar con severidad `warning` segmentado a Córdoba
  llegó a **un solo** destinatario, el instalador de esa provincia, con
  `severity` y `dedupe_key` correctos en la fila.
- **Sin compromiso** — después de publicar, la empresa seguía con cero
  bolsa, cero órdenes y cero asignaciones: el masivo avisa, no compromete
  (AC-23-G).

## Fuera de alcance, a propósito

- **Tipo de instalador / oficio** — `installers.skills` existe pero está
  muerto: se lee en tres pantallas, no lo escribe ningún formulario.
  Segmentar por un array siempre vacío daría cero destinatarios siempre.
  Primero habría que construir la carga de oficios en el perfil; Nicolás lo
  dejó afuera de esta entrega.
- **Localidad** — `installers.base_city` es texto libre sin catálogo
  ("CABA" vs "Capital Federal" vs "Ciudad de Buenos Aires" son la misma
  ciudad y tres filtros distintos). Necesita normalización previa.
- **"Equipo"** — no existe como entidad en el dominio (confirmado: cero
  resultados de `team`/`crew`/`cuadrilla` en migraciones). Lo más cercano
  es el segmento por proyecto, que ya existe. Mismo criterio que en el
  punto 22.
- **`R3-NOT-01/02`: worker que drene `notification_outbox`** — es
  infraestructura de entrega durable, no lo que pide el punto 23. Las
  tablas siguen creadas y sin drenar, igual que antes de esta entrega.

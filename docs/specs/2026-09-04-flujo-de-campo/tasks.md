# Tareas

Trazan a `REQ-14` de la spec madre (`R5-CMD-02/03/04`, `R5-CMD-05`,
`R5-UI-01/02`, `R5-QA-01`).

## Fase 0 — Estados nuevos y trazabilidad estructurada

- [x] **FLD-ST-01** — Migración: `en_camino` y `en_sitio` en el check de
  `work_orders.status`, en `validate_order_transition` y en
  `project_order_to_activity` (ambos a `scheduled`). Se conserva
  `planificada → en_proceso` y se agrega `finalizada → en_proceso`.
  → FLD-R1.1, DEC-24-01, DEC-24-02
- [x] **FLD-ST-02** — Migración: `from_status` / `to_status` en
  `order_updates`. → FLD-R2.1
- [x] **FLD-ST-03** — `OrderStatus` en `database-domain-aliases.ts`,
  regenerar tipos y correr `narrow-database-types.mjs`.
- [x] **FLD-ST-04** — `ORDER_TRANSITIONS`, `ORDER_STATUS`,
  `ORDER_STATUS_ORDER` y `orderTransitionBlock` con los estados nuevos;
  `transitionOrder` escribe `from_status`/`to_status`. → FLD-R2.1, FLD-R2.4
- [x] **FLD-ST-05** — Test pgTAP: tabla de transiciones válidas e
  inválidas, y que sólo el instalador asignado marca en camino / llegada.
  → FLD-R1.2, AC-24-A, AC-24-G, R5-QA-01

## Fase 1 — Evidencia mínima configurable

- [x] **FLD-EV-01** — Migración: `min_completion_photos` en `companies`
  (default 3) y en `projects` (nullable), más
  `order_min_photos(p_order)`. → FLD-R4.2
- [x] **FLD-EV-02** — El trigger rechaza `en_proceso → en_revision` sin
  evidencia suficiente, contando las fotos de toda la orden.
  → FLD-R4.1, FLD-R4.3, FLD-R4.4
- [x] **FLD-EV-03** — `lib/domain/field-flow.ts` (puro): conteo, faltante y
  si la acción se ofrece. Con tests. → FLD-R4.5
- [x] **FLD-EV-04** — La Server Action de finalizar valida antes de
  encolar, con mensaje que dice cuántas faltan.
- [x] **FLD-EV-05** — Configuración del mínimo en ajustes de empresa y en
  la ficha del proyecto. La escritura del valor de empresa va por
  `set_company_min_completion_photos()`: `companies` no tiene policy de
  UPDATE, así que un update directo afectaba cero filas en silencio, y una
  policy amplia habría dejado al gerente tocar también `status`.
- [x] **FLD-EV-06** — Test pgTAP: 2 fotos con mínimo 3 rechaza; override de
  proyecto en 1 acepta. → AC-24-B, AC-24-C

## Fase 2 — Bloqueo visible

- [x] **FLD-BL-01** — Migración: `order_incidents.update_id`, con índice
  ÚNICO parcial para que el reintento de la cola no duplique la incidencia.
  **La RLS ya permitía** al instalador asignado insertar y leer
  (`order_incidents_installer_insert/read`): el muro estaba sólo en
  `requireOperatorForOrder`, en la capa de aplicación. → FLD-R5.1
- [x] **FLD-BL-02** — `createIncident` admite al instalador asignado (no a
  cualquiera), y `resolveIncident` sigue siendo sólo de la empresa: reportar
  y dar por resuelto son cosas distintas. El puente bloqueo→incidencia vive
  en el trigger `blocker_to_incident` y no en la acción, porque el área
  installer escribe por dos caminos y el bloqueo sin señal —el caso más
  probable— nunca habría llegado al dashboard. → FLD-R5.1, FLD-R5.2
- [x] **FLD-BL-03** — Evento de push `blocker_reported`. Matiz del
  diagnóstico: el bloqueo **ya** notificaba, pero con el mismo tipo y título
  que un avance rutinario ("Nuevo avance de OT-0001"). Ahora tiene tipo,
  título y severidad propios. → FLD-R5.3
- [x] **FLD-BL-04** — Test pgTAP: el bloqueo crea incidencia, no cambia el
  estado, y un instalador no asignado no puede. → AC-24-D, FLD-R5.4

## Fase 3 — Decisiones del coordinador

- [x] **FLD-RV-01** — `reviewOrderDelivery(orderId, decision, reason)` con
  las cuatro decisiones, motivo obligatorio salvo aprobar.
  → FLD-R6.1..6.5
- [x] **FLD-RV-02** — Notificación al instalador en las cuatro, con lo que
  se le pide visible en la orden. → FLD-R6.5, REQ-14.6
- [x] **FLD-RV-03** — UI de revisión para el coordinador; se conserva la
  no-autoaprobación. **Aprobar NO se duplicó**: ya existía `RatingDialog
  mode="finalize"`, que aprueba y además pide la calificación. El diálogo
  nuevo aporta las tres que no existían. → FLD-R6.6, AC-24-F
- [x] **FLD-RV-04** — Test pgTAP: reapertura desde `finalizada` exige
  motivo; autoaprobación rechazada. → AC-24-B, AC-24-E, AC-24-F

## Fase 4 — UI del instalador y del historial

- [x] **FLD-UI-01** — `StatusStepper` con las dos etapas nuevas.
- [x] **FLD-UI-02** — `task-actions.tsx` por estado: "Voy en camino" →
  "Llegué" (fotos opcionales) → "Empezar". → FLD-R3.1, FLD-R3.2
- [x] **FLD-UI-03** — Botón de finalizar con el conteo de fotos y el motivo
  del bloqueo visible. → FLD-R4.5
- [x] **FLD-UI-04** — Historial de campo con autor, ambos timestamps,
  estado anterior → nuevo, nota y fotos. → FLD-R2.2, FLD-R2.3, R5-UI-01
- [x] **FLD-UI-05** — Estados nuevos en filtros y badges de la empresa;
  traducciones es/pt.

## Verificación

Contra Demo con RLS activa, empresa de prueba borrada al terminar, y el dev
server apuntado a Demo por env vars del proceso (`.env.local` apunta a
Producción y no se toca).

- **pgTAP** — `field_flow_states` 10/10, `completion_evidence` 6/6,
  `blocker_incident` y `review_decision` verificados por SQL equivalente.
- **Unitarios** — 437 en verde, incluidos `field-flow` (10) y
  `review-decision` (10).
- **Instalador, flujo completo en el navegador** — el historial quedó
  `travel [planificada → en_camino] | checkin [→ en_sitio] | checkin [→
  en_proceso] | blocker`, con una acción por etapa: "Voy en camino" →
  "Llegué al sitio" (con "No son obligatorias" sobre las fotos) → "Iniciar
  trabajo".
- **Evidencia mínima** — con cero fotos, "Marcar terminado" aparece
  **deshabilitado** y dice *"Faltan 3 fotos para poder cerrar (el mínimo es
  3)"*. Antes de apretar, no después (FLD-R4.5).
- **Bloqueo** — reportarlo dejó la orden en `en_proceso` (FLD-R5.4), creó la
  incidencia `technical_issue/high`, avisó al gerente como
  `blocker_reported` / "Trabajo bloqueado en CVE-0002", y apareció en el
  dashboard: *"Estación Centro · La persiana está tapiada…"*.
- **Stepper** — las ocho etapas dibujadas, con "En camino" y "En el sitio"
  entre "Planificada" y "En proceso".
- **Revisión del coordinador** — el diálogo ofrece "Pedir más fotos" y
  "Pedir correcciones" (no "Aprobar", que ya tiene su camino con
  calificación), el motivo aparece al elegir y "Confirmar" se habilita
  recién con el motivo escrito. Al confirmar, la orden volvió a
  `en_proceso`, quedó `en_revision -> en_proceso` en columnas, y el
  instalador recibió `delivery_returned` / "Revisar CVE-0003" con el motivo
  completo en el cuerpo.

### Dos cosas que sólo aparecen contra un entorno real

1. **`refresh_site_status` hacía retroceder el sitio.** Clasificaba por
   listas cerradas con un `else 'pendiente'`, así que una orden que avanzaba
   a `en_camino` devolvía el punto de `planificada` a `pendiente` justo
   cuando el instalador salía para allá. Corregido en la migración y
   afirmado en el pgTAP.
2. **Los UUID de fixture con versión 0 los acepta Postgres y los rechaza
   Zod 4.** Una orden sembrada como `88000000-0000-0000-0000-000000000041`
   entra a la base sin problema, pero `z.string().uuid()` valida el dígito
   de versión, así que la cola offline rechazaba la transición con "Datos
   inválidos" mientras el `order_update` —que se inserta directo, sin Zod—
   sí pasaba. No es un bug del producto: es cómo hay que sembrar datos de
   prueba de acá en más.

## Fuera de alcance, a propósito

- **Offline v2** (`R5-OFF-01..06`, `R5-CMD-01`): command envelope con
  versión esperada, outbox versionada con dependencias, bandeja de
  conflictos, carga de fotos resumible, purga por cambio de cuenta. Proyecto
  XL propio. La cola Dexie ya da idempotencia por id de cliente, que es lo
  que este flujo necesita. `AC-14-C` queda con ella.
- **Checklist configurable**: el pedido pide evidencia fotográfica mínima,
  no checklist. `work_conditions` cubre condiciones por otro camino.
- **Ubicación GPS del instalador**: capturar la posición de una persona es
  una decisión de privacidad que merece pedirse explícitamente, no colarse
  en una entrega de flujo. `sites` ya tiene coordenadas.

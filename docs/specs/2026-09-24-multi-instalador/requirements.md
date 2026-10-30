# Requisitos — MULTIINST-*

## Plantel de la orden

- **MULTIINST-R1.1** — Una orden tiene un plantel de 1 a 15 instaladores
  activos, con exactamente uno marcado como **responsable** (lead).
- **MULTIINST-R1.2** — Agregar un integrante pasa por el mismo chequeo de
  disponibilidad que hoy corre para el único asignado: elegibilidad
  (`company_installers.status = 'active'`), ausencia aprobada (bloqueo duro),
  solapamiento de agenda (bloqueo duro), traslado insuficiente (bloqueo con
  override y motivo). Cada candidato se chequea contra SU PROPIA agenda, cruce
  de empresas incluido — mismo criterio que ya usa `assign_installer_gate`.
- **MULTIINST-R1.3** — Quitar a un integrante nunca requiere el gate (mismo
  criterio que desasignar hoy). Si el integrante quitado era el responsable,
  la empresa debe elegir un nuevo responsable entre los que quedan antes de
  poder quitarlo, o la orden queda sin responsable (bloqueando transiciones
  que lo requieran, MULTIINST-R4.1).
- **MULTIINST-R1.4** — `work_orders.assigned_installer_id`,
  `installer_amount`, `payment_status`, `payment_status_changed_at` y
  `payment_status_changed_by` quedan como una **proyección de sólo lectura**
  del responsable actual, mantenida por trigger. Ningún código de aplicación
  les escribe directo (mismo patrón de guarda que ya existe para
  `assigned_installer_id` desde el bloque de agenda).

## Acceso

- **MULTIINST-R2.1** — Cualquier integrante activo del plantel tiene el mismo
  acceso operativo a la orden que hoy tiene el único asignado: verla, avanzar
  su estado (con las mismas reglas de negocio), cargar evidencia, ver y
  responder incidencias, aparecer en "mi ruta de hoy" y en "mis tareas".
- **MULTIINST-R2.2** — Un integrante fuera del plantel (aunque trabaje para la
  misma empresa) no gana acceso por eso.
- **MULTIINST-R2.3** — Las políticas que hoy comparan
  `assigned_installer_id = auth.uid()` para decidir acceso (no para mostrar un
  nombre) pasan a comprobar membresía en el plantel vía un helper nuevo,
  `auth_is_order_team_member(order_id)`.

## Dinero

- **MULTIINST-R3.1** — Cada integrante tiene su propio monto
  (`installer_amount`) y su propio estado de cobro (`payment_status`),
  independientes de los demás.
- **MULTIINST-R3.2** — Un instalador sólo ve, de esta orden, su propio monto y
  su propio estado de cobro — nunca el de otro integrante del mismo equipo, y
  nunca lo que la empresa le cobra al cliente (bloque 8, sin cambios).
- **MULTIINST-R3.3** — El PDF de la orden que baja un instalador muestra
  únicamente su propia paga.
- **MULTIINST-R3.4** — El tablero financiero de la empresa (`/finance`) sabe
  sumar el costo de instaladores por orden cuando hay varios (no asume una
  sola fila de costo por orden).

## Reglas de transición (mirror TS/DB)

- **MULTIINST-R4.1** — "Sólo el instalador puede iniciar/enviar a revisión" se
  reinterpreta como "sólo un integrante activo del plantel puede…". Sin
  responsable definido, no se puede pasar a `en_proceso` (mismo motivo que hoy
  exige `assignedInstallerId`, `needsInstaller`).
- **MULTIINST-R4.2** — ADR-001 (no autoaprobación) sigue aplicando por
  identidad: quien ejecutó no puede aprobar su propia entrega, sea o no el
  responsable.

## Chat y notificaciones

- **MULTIINST-R5.1** — Cada orden con plantel tiene **un** hilo de chat
  grupal (no uno por integrante). Participan los integrantes activos del
  plantel más el gerente/coordinador que opera la orden.
- **MULTIINST-R5.2** — Un evento de la orden (asignación, cambio de fecha,
  incidencia, revisión) notifica (push + in-app) a **todos** los integrantes
  activos, no sólo al responsable.
- **MULTIINST-R5.3** — La función que autoriza la entrega de push
  (`send-event-push`) comprueba membresía en el plantel, no igualdad contra
  una columna única.

## Completitud y bolsa de trabajo

- **MULTIINST-R6.1** — Cada orden declara `required_installers` (entero, 1 a
  15, default 1). La orden aparece como **incompleta** en la bolsa de trabajo
  y en los KPIs de "sin asignar" mientras el plantel activo tenga menos
  integrantes que ese número.
- **MULTIINST-R6.2** — Una orden sin responsable es incompleta sin importar
  `required_installers` (no puede operarse sin uno, MULTIINST-R4.1).

## Calificación (fuera de cambio, documentado a propósito)

- **MULTIINST-R7.1** — La calificación post-obra sigue acreditándose sólo al
  responsable de la orden en el momento de calificar. Decisión explícita de
  Nicolás (24-09-2026): no repartir reputación por integrante todavía.

## Trazabilidad

Cada requisito de arriba traza a un caso de prueba pgTAP en
`supabase/tests/work_order_team.test.sql` (y a los tests de regresión
listados en `tasks.md` Fase 3) y a las decisiones de `design.md`.

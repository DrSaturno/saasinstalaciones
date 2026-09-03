# Agenda, disponibilidad y prevención de conflictos

Implementa **REQ-11** de la [evolución de producto](../2026-08-04-evolucion-producto/README.md) y el bloque **R3-AG** del backlog: que la agenda sea un módulo propio, y que ninguna vía de asignación pueda comprometer a alguien con dos trabajos incompatibles.

- [Requisitos](requirements.md)
- [Diseño](design.md)
- [Tareas](tasks.md)

## El caso de fundación muerta más extremo hasta ahora

La migración `20260805000004_activities_agenda_outbox.sql` —1583 líneas, aplicada el 12-08-2026— ya trae casi toda la capa de datos de este punto:

| Ya existe en la base | Qué resuelve del pedido |
|---|---|
| `work_activities.scheduled_start_at/end_at`, `estimated_duration_minutes`, `schedule_precision` | Horarios reales, con precisión declarada para lo viejo |
| `work_assignments.schedule_range` (`tstzrange` generado) + índice GiST | La estructura exacta para buscar solapamientos |
| `installer_global_weekly_availability` / `installer_global_unavailability` | Disponibilidad de la persona **entre empresas** |
| `assignment_command_receipts` | Idempotencia y los códigos opacos de respuesta |
| `assignment_override_audit` | Auditar cuándo alguien forzó un conflicto |
| `calendar_connections` / `calendar_order_events` | Sincronización con Google Calendar |

Y **nada de `app/` la usa**. Cero referencias a `work_assignments`, a las tablas globales y a la auditoría de override.

## Dos correcciones al backlog, verificadas contra la base

1. **`R3-AG-01` dice "con exclusión por GiST". No hay ninguna restricción de exclusión.** Consultado `pg_constraint` en producción: `work_assignments` sólo tiene dos `unique`. Existe un *índice* GiST sobre `schedule_range`, que acelera la búsqueda de solapamientos pero no impide ninguno. La diferencia importa: hoy la base aceptaría dos asignaciones superpuestas sin protestar.
2. **El comentario del schema promete una RPC que no existe.** Dice que gerentes y coordinadores "sólo reciben un código opaco por RPC"; `assignment_command_receipts` guarda esos códigos, pero la función que los emite nunca se escribió (`R3-AG-02`).

## El cuello de botella no es el algoritmo

**Es que hoy nadie carga horarios.** Las órdenes se agendan con fecha (`type="date"` en el formulario) y `schedule_precision` arranca en `'unknown'`. Sin hora de inicio y de fin no hay nada entre lo cual detectar un conflicto: el ejemplo del pedido —14:00-18:00 contra un trabajo que arranca 14:30— hoy es inexpresable.

Por eso este punto empieza capturando horarios, no previniendo choques. Todo lo demás depende de eso.

## Las decisiones

**DEC-18 — El traslado se estima con las coordenadas que ya tenemos.** Distancia entre puntos por una velocidad promedio configurable, más un margen mínimo. Sin costo, sin dependencia externa, sin latencia en cada asignación y explicable ante un reclamo. Es aproximado, así que **se calibra conservador**: es mejor marcar un conflicto de más que dejar pasar uno imposible de cumplir. `REQ-11.6` ya contemplaba exactamente esto, con un proveedor vial como fase posterior.

**DEC-19 — Bloqueo duro para el solapamiento, override auditado sólo para el traslado.** Nicolás eligió "bloqueo con excepción auditada", y `REQ-11.7`/`DEC-09` afinan dónde vale la excepción: **un solapamiento es un hecho y no se puede forzar; el tiempo de traslado es una estimación nuestra y sí.** Si la plataforma pudiera equivocarse con una estimación y dejar a la empresa trabada sin salida, la gente terminaría moviendo fechas para engañar al control — que es peor que un override que queda escrito.

## El vínculo con confiabilidad, que es la mitad del objetivo

El pedido es explícito: *"Si existe un conflicto que la plataforma podía detectar previamente, no deberá trasladarse automáticamente la responsabilidad al instalador ni afectar su índice de confiabilidad"*.

Traducido a lo que ya está construido en el punto 16: **una baja causada por un conflicto que la empresa forzó tiene que entrar como `cancel_justified`**, que pesa 0. No alcanza con no culpar al instalador en el discurso; el evento tiene que nacer sin penalización.

## Frontera

- **No se toca el índice de confiabilidad ni la reputación.** Este punto los protege; no los modifica.
- **Google Calendar queda afuera** (`R3-AG-06`). Sincronizar eventos horarios es un frente propio, y sobre todo: el calendario externo **no puede volverse fuente de verdad** de la disponibilidad.
- **Sin proveedor vial** en esta versión, por DEC-18.
- **No se rediseña la máquina de estados de la orden.** Los estados que el pedido enumera (planificado, relevamiento pendiente, en ejecución…) ya existen entre `work_orders.status` y `work_activities.lifecycle`; la agenda los muestra y filtra, no los redefine.

# Tareas

Trazan al bloque **R3** del backlog de la spec madre, subsección "Actividades y relevamiento".

## Fase 0 — Conectar lo que ya existe

- [x] **REL-SPEC-01** — Confirmar DEC-15 (quién aprueba) y la proyección como estrategia de convivencia. → `R3-SPEC-01`
- [x] **REL-SRV-01** — Comando para crear actividades de una orden, idempotente por `operation_id` como el resto del módulo.
- [x] **REL-SRV-02** — Comando `draft → submitted` de una submission.
- [x] **REL-SRV-02b** — Comando de asignación a una actividad. **No estaba planificado:** apareció al probar, cuando `submit_survey_submission` falló porque la asignación vive en `work_assignments` y no en la orden. Asigna y nada más; la agenda sigue siendo ADR-004.
- [x] **REL-DB-01** — Backfill: una actividad de ejecución por cada una de las 30 órdenes vivas, respetando su estado actual. Sin fabricar relevamientos ni aprobaciones que no ocurrieron — y de hecho no hay ninguno que preservar: verificado el 02-09-2026, **ninguna** de las 30 tiene un relevamiento del modelo viejo (27 `pendiente`, 3 `finalizada`).
- [x] **REL-QA-01** — pgTAP de los tres comandos, incluido `AC-07-C` con un coordinador de rol dual. La proyección se prueba en la Fase 1, junto con el trigger que la implementa. → `R3-QA`

## Fase 1 — Relevamiento como trabajo independiente

> **REL-SRV-03 se movió acá desde la Fase 0.** Al leer `validate_order_transition`
> quedó claro que la proyección y "el relevamiento se cierra solo" tocan el mismo
> trigger: no tiene compuerta de bypass, exige instalador asignado para salir de
> `pendiente`, y exige una fila de `order_updates` tipo `survey` para pasar de
> `relevamiento` a `planificada`. Hacerlos en fases distintas significaría tocar
> dos veces el trigger más sensible del sistema.

- [x] **REL-SRV-03** — Proyección de `work_activities.lifecycle` a `work_orders.status`, para que nada de lo que hoy lee el estado escalar se entere.

- [x] **REL-SRV-04** — Una orden de sólo relevamiento se cierra al aprobarse, sin pasar por `planificada` ni `en_proceso`. Y en una orden combinada aprobar el relevamiento **habilita** la ejecución en vez de terminar la orden, que es la distinción fácil de romper.
- [x] **REL-UI-01** — Al crear la orden, elegir si es sólo relevamiento, sólo ejecución, o relevamiento y después ejecución.
- [x] **REL-QA-02** — Probar `AC-07-A`: se finaliza sin ejecución ficticia.

## Fase 2 — La revisión del coordinador

- [x] **REL-SRV-05** — Aplicar DEC-15: coordinador responsable, gerente sólo como fallback registrado cuando no hay coordinador. El fallback queda en `used_manager_fallback`, para poder contar cuántas veces la empresa decidió en lugar de un coordinador.
- [x] **REL-UI-02** — Aprobar o pedir cambios con motivo. Un solo control con motivo, no cuatro botones: pedir más información, más fotos, más mediciones o una nueva visita son la misma decisión.
- [x] **REL-UI-03** — El instalador ve qué le pidieron y puede enviar una versión nueva.
- [x] **REL-QA-03** — Probar `AC-07-B` (cambios solicitados bloquean la ejecución y se conserva cada versión) y `AC-07-C` (autoaprobación rechazada).

## Fase 3 — El formulario de verdad

- [x] **REL-SRV-06** — Plantilla versionada por empresa, con los campos del oficio (medidas de la superficie, acceso, corriente, obstáculos). La definición se **copia** a la actividad al crearla: editar la plantilla después no cambia un relevamiento en curso, porque nadie puede quedar respondiendo un formulario que le cambiaron mientras estaba en el punto.
- [x] **REL-SRV-07** — Trigger que le da plantilla a las empresas nuevas. **No estaba planificado:** apareció probando con una empresa creada después del seed, cuyo instalador habría visto un formulario vacío. El caso sólo se ve si el fixture no viene del mismo lote que la migración.
- [x] **REL-UI-04** — Checklist, mediciones y descripciones reemplazando la nota de texto libre. Cada tipo va a su columna: una medición es un número comparable entre relevamientos y un texto no.
- [ ] **REL-UI-07** — Fotos atadas a la versión del relevamiento. **Queda pendiente a propósito:** las mutaciones del área instalador tienen que pasar por la cola offline (`lib/offline/sync.ts`, regla no negociable #5), y un relevamiento se hace justo donde no hay señal. Requiere un tipo de operación nuevo en la cola, que es un frente propio. Mientras tanto el instalador puede adjuntar fotos a la orden por el panel de evidencia del punto 13; lo que falta es que queden atadas a la versión.

## Fase 4 — Trabajo con relevamiento incluido

- [x] **REL-UI-05** — Mostrar el prerrequisito y por qué la ejecución está bloqueada.
- [x] **REL-UI-06** — Waiver del prerrequisito con motivo, que la base ya exige de 10 a 500 caracteres. **Lo dispensa quien puede aprobar (DEC-15), no cualquiera que opere la orden:** si el gerente pudiera dispensar, DEC-15 quedaría decorativa — saltearía el requisito en vez de aprobar, y la ejecución arrancaría sin que el coordinador viera nada.
- [x] **REL-QA-04** — Probar que la ejecución no arranca sin relevamiento aprobado, y que el waiver queda auditado.

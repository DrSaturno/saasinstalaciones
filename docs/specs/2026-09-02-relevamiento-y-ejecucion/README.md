# Relevamiento y ejecución como actividades distintas

Implementa **REQ-07** de la [evolución de producto](../2026-08-04-evolucion-producto/README.md): que un relevamiento pueda ser un trabajo en sí mismo o una etapa dentro de otro, que su aprobación sea del coordinador, y que las fechas de una cosa y de la otra no se confundan.

- [Requisitos](requirements.md)
- [Diseño](design.md)
- [Tareas](tasks.md)

## El punto de partida es raro y conviene decirlo primero

**La capa de datos ya está construida y no la usa nadie.** La migración `20260805000004_activities_agenda_outbox.sql` se aplicó el 12-08-2026 con `work_activities`, `survey_submissions` versionadas y `survey_submission_decisions`, más sus políticas RLS, sus triggers de validación y el comando idempotente `decide_survey_submission`. En producción hay **0 filas** en las tres tablas y **cero referencias desde `app/`**.

Es el mismo patrón que `business-days.ts` en el punto 16: cimiento colado por adelantado, correcto, y desconectado.

Así que esto no es "construir el modelo de actividades". Es **conectarlo**, agregar las tres piezas que le faltan del lado servidor, y no romper las 30 órdenes que hoy viven sobre el modelo viejo.

## Frontera

No se rediseña la máquina de estados de `work_orders`: sigue existiendo y sigue siendo lo que ve la empresa. Lo que cambia es quién es la fuente de verdad de una actividad.

Tampoco se toca la agenda ni la disponibilidad, que son la otra mitad de R3 y tienen su propio ADR (ADR-004).

**Corrección del 02-09-2026, a mitad de la Fase 0.** Las tablas muertas eran **tres**, no dos: `work_assignments` también estaba en producción con 0 filas y sin nada que la creara. Y `auth_is_activity_assignee` lee de ahí, no de `work_orders.assigned_installer_id` — así que sin asignaciones el instalador no puede ni ver ni enviar un relevamiento, y la fase entera no se sostiene.

Se agregó un comando de asignación mínimo: vincula a la persona con la actividad y nada más. Los horarios, la disponibilidad y las superposiciones siguen afuera, que es lo que ADR-004 gobierna.

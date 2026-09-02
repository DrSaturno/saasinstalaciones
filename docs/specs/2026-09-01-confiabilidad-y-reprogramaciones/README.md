# Confiabilidad, cancelaciones y reprogramaciones

Esta especificación implementa **REQ-06** de la [evolución de producto](../2026-08-04-evolucion-producto/README.md): que una reprogramación o una baja no rompan la planificación de la empresa, y que ningún instalador quede penalizado por algo que no le fue comunicado.

- [Requisitos](requirements.md)
- [Diseño](design.md)
- [Tareas](tasks.md)

## Frontera

No inventa requisitos ni numeración propia: los requisitos son **REQ-06.1..06.9** y los criterios de aceptación **AC-06-A/B/C** de la spec madre, y las decisiones ya están tomadas en [ADR-009](../2026-08-04-evolucion-producto/adr/ADR-009-reprogramacion-y-cancelacion.md) (plazos, calendario, silencio, revisión) y [ADR-011](../2026-08-04-evolucion-producto/adr/ADR-011-reputacion.md) (confiabilidad explicable, modo sombra). Las tareas locales `CONF-*` trazan al bloque `R6-*` del backlog.

Lo que esta spec agrega es el paso que faltaba: **cerrar DEC-07** y bajar todo eso a un diseño ejecutable por fases.

## DEC-07 — cerrada el 01-09-2026

La minuta original no fijaba el ancla de la baja común y dejaba un baseline recomendado. El pedido de Nicolás lo define de forma explícita: el instalador tiene **dos días hábiles para pedir la baja sin penalización**, contados **hacia atrás desde el inicio programado**, "para que la empresa tenga tiempo suficiente para reorganizar la asignación". Coincide con el baseline, así que se adopta sin cambios y `canCancelWithoutReview` lo implementa.

Para la reprogramación el ancla ya estaba fijada y no se toca: corre **desde la notificación persistida**, nunca desde el cambio de fecha.

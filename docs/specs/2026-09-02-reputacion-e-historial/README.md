# Reputación e historial profesional del instalador

Implementa **REQ-10** de la [evolución de producto](../2026-08-04-evolucion-producto/README.md) y el bloque **R8-REP** del backlog: que el perfil de un instalador refleje no sólo cuántos trabajos hizo, sino cuáles estuvo dispuesto a asumir y con qué constancia cumplió.

- [Requisitos](requirements.md)
- [Diseño](design.md)
- [Tareas](tasks.md)

## Por una vez, el punto de partida es que no hay nada

Los cuatro puntos anteriores encontraron cimiento ya colado: tablas migradas meses antes, a veces sin usar, a veces enteras y funcionando. Acá no. Buscando en todo el repositorio:

- `dificultad` / `complexity`: **cero coincidencias**
- `racha` / `streak`: **cero coincidencias**
- `installer_performance_events`, `reputation_rule_versions`, `installer_reputation_summary`, las tres tablas que D10 ya había diseñado: **ninguna existe**

Hoy "reputación" es una sola cosa: el promedio de estrellas (`installers.rating_avg`) con sus reseñas, que se muestra en el perfil propio, en la ficha que ve la empresa y junto a cada postulante de la bolsa.

## Pero la dependencia que faltaba ya se cumplió

El backlog condicionaba este bloque: *"Reputación debe esperar a que confiabilidad y eventos reales estén estables"*. Eso pasó con el punto 16. `installer_reliability_events` está en producción, con eventos reales, fórmula versionada, reversa auditable y su job agendado.

Y hay más base aprovechable de la que parece:

| Lo que el pedido necesita | De dónde sale hoy |
|---|---|
| Con cuánta anticipación se aceptó | `work_orders.installer_accepted_at` contra `scheduled_date`, medido con `business_days_between` — la misma autoridad de calendario que ya gobierna el plazo de cancelación |
| Incidencias resueltas | `order_incidents`: categoría, severidad, `resolved_at`, `requires_revisit` |
| Que una baja justificada no perjudique | Ya está clasificado: `cancel_in_notice` y `cancel_justified` pesan **0** en confiabilidad |
| Dos condiciones de dificultad | `work_orders.indoor` y `requires_freight` ya se registran en cada orden |

Así que esto no es partir de cero: es agregar la taxonomía que falta, un segundo libro de eventos y su proyección.

## Las dos decisiones que estaban abiertas, cerradas

**DEC-16 — La dificultad sale de condiciones objetivas, no de un nivel que alguien elige.** Un campo "baja/media/alta" lo llena cada empresa con su propia vara, y entonces "7 trabajos complejos" deja de significar lo mismo entre dos inquilinos — que es exactamente lo que rompe una reputación pensada para cruzar empresas. "Altura + nocturno + acceso restringido" es verificable y comparable. REQ-10.3 además prohíbe inferir la dificultad de `priority` o de texto libre, así que el campo `priority` que ya existe **no** se usa para esto.

**DEC-17 — Entre empresas viaja el agregado, nunca el detalle.** Una empresa que evalúa a alguien ve "94/100, racha de 8, 42 completados, 7 complejos, 98% de cumplimiento" y sus reconocimientos. No ve para quién fueron esos trabajos, ni dónde, ni por qué se canceló alguno. Es lo que fija AC-10-C, y es coherente con la ficha de instalador, que ya evita deliberadamente revelar para qué otras empresas trabaja la persona.

## La distinción que da sentido a todo el punto

El pedido dedica una sección entera a separar reputación de confiabilidad. La separación se vuelve concreta en la forma de cada número:

| | Confiabilidad (ya existe) | Reputación (este punto) |
|---|---|---|
| Arranca en | **100**, y las faltas restan | **0**, y la trayectoria suma |
| Qué mide | Cumplimiento reciente | Trayectoria acumulada |
| Ventana | 180 días, corte duro | Decaimiento lento, sin corte |
| Pregunta que responde | ¿Va a cumplir? | ¿Qué hizo hasta acá? |

Un instalador nuevo no arranca con mala reputación: arranca **sin** reputación, que no es lo mismo. Y arranca con confiabilidad intacta, porque todavía no faltó a nada.

## Frontera

- **No se toca el índice de confiabilidad.** Este punto lo *lee* y no lo modifica. Sigue en modo sombra (`CONF-GATE-01`).
- **La reputación tampoco gatea nada.** No filtra ofertas, no ordena candidatos por sí sola, no bloquea a nadie. Se muestra. Que un número empiece a decidir quién trabaja es una decisión aparte, con su propio gate (`R8-GATE`).
- **No se rediseñan las estrellas.** Las reseñas siguen como están y entran como un insumo más.

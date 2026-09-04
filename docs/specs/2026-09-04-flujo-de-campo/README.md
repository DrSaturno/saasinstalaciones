# 24. Flujo de progreso del trabajo en campo

## Contexto

Traza a `REQ-14` de `docs/specs/2026-08-04-evolucion-producto/`
(`REQ-14.1..14.7`, `AC-14-A/B/C`), cuyas tareas viven en el bloque **R5 —
Flujo de campo y offline v2**, todas sin marcar.

Auditando el código antes de escribir nada: **el esqueleto existe y
funciona**. No es una fundación muerta como en los puntos 16-18, ni algo
inexistente como el 20. Es un flujo real al que le faltan dos etapas, una
validación y un puente.

### Ya existe y se reutiliza

- **Aceptación** — `work_orders.installer_accepted_at`, con
  `AcceptOrderButton`. Es precondición del arranque, validada por el trigger
  `validate_order_transition`: sin aceptar, la orden no puede empezar.
- **`order_updates` es ya un log append-only** con todo lo que `REQ-14.2`
  pide menos el estado: `id` generado en el **cliente** (idempotencia
  offline), autor (`installer_id` + `created_by`), fotos, nota,
  `client_created_at` (= `occurred_at`) y `created_at` (= `received_at`).
  Esa distinción, que `REQ-14.7` exige, **ya está construida**.
- **Avance y bloqueo** — tipos `progress` y `blocker`, con nota y fotos, por
  la cola Dexie, idempotentes.
- **Aprobación con estados diferenciados** — `en_revision` ("finalizado por
  el instalador") y `finalizada` ("aprobado") ya son estados distintos, que
  es el corazón del punto 7 del pedido. El coordinador aprueba
  (`en_revision → finalizada`) o reabre (`en_revision → en_proceso`), y hay
  segregación de funciones: quien ejecutó no puede aprobar su propia entrega
  aunque además sea coordinador (ADR-001, enforced en trigger y en dominio).
- **`StatusStepper`** — ya dibuja el ciclo de vida lineal de la orden. Es
  donde entran las etapas nuevas, no hay que inventar la vista.
- **`order_incidents`** — incidencias formales con categoría, severidad y
  `requires_revisit`, que ya alimentan las alertas críticas del dashboard y
  la tasa de incidencias del punto 22.

### No existe

- **"En camino"**. Cero coincidencias en todo el repositorio. Es la etapa 2
  del flujo pedido y no está en ninguna forma.
- **"Llegué al sitio" como paso propio**. El tipo `checkin` existe, pero
  `startTask` encola el check-in y la transición a `en_proceso` de un solo
  golpe, con una nota fija y sin pedir foto ni estado inicial de la
  locación. No es una etapa: es un efecto secundario de "Iniciar".
- **Mínimo de evidencia para finalizar**. Se puede mandar a revisión con
  **cero fotos**. No hay ningún mínimo, ni fijo ni configurable, en el
  dominio, ni en la acción, ni en el trigger (`AC-14-A` sin cubrir).
- **Estado anterior / nuevo estado en el historial**. `transitionOrder`
  deja el cambio como **texto en prosa traducido** ("Estado cambiado a
  Finalizada"). Reconstruir el historial obliga hoy a parsear una frase
  cuyo idioma depende de quién la ejecutó.
- **"Pedir evidencia" y "pedir corrección" como acciones**. El coordinador
  sólo puede aprobar o reabrir. `REQ-14.5` pide cuatro caminos, siempre con
  motivo.

### El hallazgo que más importa: dos canales desconectados

El instalador reporta un bloqueo → se guarda como `order_updates` tipo
`blocker` → **muere en el historial**. No notifica a nadie, no genera
alerta, no aparece en ningún panel de la empresa. El coordinador se entera
sólo si abre esa orden y scrollea.

Al mismo tiempo, `createIncident` rechaza a todo el que no sea gerente o
coordinador: **el instalador no puede originar una incidencia formal**.

Es decir: quien está parado en el sitio y ve el problema escribe en un
canal que nadie mira; quien tiene el canal visible no está ahí para verlo.
El pedido pide exactamente lo contrario — "el bloqueo deberá quedar visible
para los usuarios autorizados y permitir que el coordinador intervenga".

## Decisiones tomadas antes de diseñar

Confirmadas con Nicolás:

1. **"En camino" y "llegada" son estados propios de la orden**, no hitos con
   timestamp dentro de `en_proceso`. La máquina pasa de 7 a 9 estados. Es
   más caro —toca el trigger, el grafo, los tests y los filtros— pero es lo
   que hace que el coordinador vea "¿ya salió?" en la lista de órdenes y en
   la agenda sin derivarlo de otra tabla, y es lo que el pedido enumera.
2. **El mínimo de fotos es un valor de empresa (3) con override por
   proyecto.** Cubre "según el tipo de trabajo" —una obra exigente pide 6,
   un mantenimiento simple 1— sin pedir configuración orden por orden.
3. **El bloqueo del instalador crea una incidencia** en `order_incidents`.
   Entra solo al dashboard, a las alertas críticas y a la tasa de
   incidencias que ya existen, en vez de construir un canal nuevo.

## Alcance

Este punto cubre el **flujo funcional** de `REQ-14`: las etapas, la
evidencia mínima, las decisiones de revisión y la trazabilidad estructurada
(`R5-CMD-02/03/04`, `R5-UI-01`, `R5-QA-01`, y `R5-CMD-05` en su lectura
literal: adaptar `order_updates` como proyección).

**No cubre la reingeniería de offline v2** (`R5-OFF-01..06`, `R5-CMD-01`
con event envelope y versión esperada, ADR-007/008, carga resumible). Eso
es un proyecto propio, de tamaño XL, y mezclarlo acá haría que ninguna de
las dos cosas se termine. La cola Dexie existente ya da idempotencia por id
de cliente, que es lo que este flujo necesita para funcionar en el campo.

Ver `requirements.md` para el detalle, `design.md` para el cómo y
`tasks.md` para el plan por fases.

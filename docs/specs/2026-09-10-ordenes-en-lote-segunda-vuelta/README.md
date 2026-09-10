# Órdenes en lote: segunda vuelta sobre locaciones ya trabajadas

## Contexto

Traza a `REQ-04` de `docs/specs/2026-08-04-evolucion-producto/` (alta de
órdenes) y extiende lo que resolvió
[`2026-09-09-google-calendar`](../2026-09-09-google-calendar/README.md) sobre el
panel de locaciones y órdenes del proyecto.

## El caso que lo motiva

Una marca con 200 locales, el proyecto ya ejecutado, y aparece un imprevisto
que obliga a intervenir **en todos los puntos otra vez**. Hoy eso son 200
órdenes cargadas a mano.

## Auditoría: qué existe y por qué no alcanza

**El alta masiva existe y funciona.** `createOrdersForProject` toma los datos
del formulario una sola vez —título, fecha, prioridad, logística, instalador,
importes— y crea una orden por locación, cada una con su número. Para el primer
alta de un proyecto de 200 locales, ya está resuelto.

**Lo que lo bloquea es una guarda deliberada.** En `lib/actions/orders/bulk.ts`:

> `// Puntos que YA tienen una orden no cancelada: los salteamos.`

Existe para que apretar dos veces el botón no duplique el proyecto entero, y
para el primer alta es correcta. Pero define el alcance como *"las locaciones
que todavía no tienen orden"*, y en una segunda vuelta **ese conjunto está
vacío**: las 200 ya tienen. El generador crea cero y muestra "Todos los puntos
ya tienen una orden".

O sea: la app sabe hacer un alta masiva **una vez por proyecto**, y no tiene
forma de hacer la segunda.

**Lo que no se puede reusar, verificado antes de diseñar:**

- `work_orders.visit_count` cuenta revisitas **dentro de una misma orden** (lo
  incrementa un trigger al reabrirla) y alimenta la tasa de resolución en
  primera visita. No modela un lote nuevo.
- `work_orders.source` es `roster | broadcast`: cómo se dotó la orden, no cómo
  se creó.

No hay ninguna columna que agrupe un lote, así que la idempotencia hay que
construirla.

## Los tres documentos

- [requirements.md](requirements.md)
- [design.md](design.md)
- [tasks.md](tasks.md)

## Frontera: qué NO toca

- **No quita la guarda existente.** El alta normal sigue salteando lo que ya
  tiene orden; la segunda vuelta es un camino aparte y explícito.
- **No toca la numeración.** Cada orden sigue tomando su número por el mismo
  mecanismo; el lote no cambia eso.
- **No agrupa las órdenes en la interfaz** por lote. Se marca el lote para
  poder detectar reintentos, no para ofrecer una vista de lotes.

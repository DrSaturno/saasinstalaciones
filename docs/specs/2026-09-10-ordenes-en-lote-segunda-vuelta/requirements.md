# Requisitos

## LOTE-R1 — Elegir sobre qué locaciones se genera

- **LOTE-R1.1** — Al generar órdenes, se puede abrir la lista de locaciones del
  proyecto y **tildar** cuáles entran.
- **LOTE-R1.2** — Un control **«Todas»** tilda y destilda las 200 de una vez.
  Tildar 200 a mano es el trabajo que esto viene a eliminar.
- **LOTE-R1.3** — La lista dice, por locación, **si ya tiene una orden viva**.
  Es el dato que distingue el primer alta de la segunda vuelta.
- **LOTE-R1.4** — Se puede buscar dentro de la lista, para acotar sin scrollear
  200 filas.

## LOTE-R2 — La segunda vuelta

- **LOTE-R2.1** — Se pueden generar órdenes sobre locaciones **que ya tienen
  una orden viva**, algo que hoy es imposible.
- **LOTE-R2.2** — Eso nunca pasa por omisión: hay que haber elegido esas
  locaciones explícitamente.
- **LOTE-R2.3** — El alta normal —«generar en las que faltan»— sigue existiendo
  y sigue salteando lo que ya tiene orden.

## LOTE-R3 — No crear de más

- **LOTE-R3.1** — Antes de crear, se muestra **cuántas órdenes** se van a crear
  y **cuántas caen sobre locaciones que ya tenían**.
- **LOTE-R3.2** — Reenviar el mismo lote —doble clic, reintento de red, volver
  atrás y confirmar otra vez— **no duplica**. La segunda ejecución no crea
  nada.
- **LOTE-R3.3** — La protección vive en la base, no sólo en la pantalla: dos
  peticiones simultáneas no pueden crear el lote dos veces.

## Criterios de aceptación

- **AC-LOTE-A** — En un proyecto con 200 locaciones ya trabajadas, se generan
  200 órdenes nuevas en menos de un minuto, cargando los datos una sola vez.
- **AC-LOTE-B** — Confirmar dos veces el mismo lote deja 200 órdenes, no 400.
- **AC-LOTE-C** — El alta normal sobre un proyecto a medio cargar sigue
  creando sólo las que faltan.

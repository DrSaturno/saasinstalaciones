# Requisitos

## MAPA-R1 — Ver el circuito completo

- **MAPA-R1.1** — Toda locación programada con coordenadas cargadas aparece
  como un pin, todas a la vez, no una por una.
- **MAPA-R1.2** — El mapa se encuadra solo para que entren todos los pines
  visibles.
- **MAPA-R1.3** — Un pin distingue su estado (planificada, en camino,
  retrasada…) igual que la lista de al lado, para que color y lista cuenten la
  misma historia.

## MAPA-R2 — Selección conectada con la lista

- **MAPA-R2.1** — Clic en un ítem de la lista resalta su pin en el mapa.
- **MAPA-R2.2** — Clic en un pin resalta su fila en la lista y muestra los
  datos de esa orden (como hoy: número, estado, link a la orden).

## MAPA-R3 — Se degrada sin romperse

- **MAPA-R3.1** — Sin `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` configurada, el bloque
  lo dice explícitamente y no intenta cargar un mapa roto.
- **MAPA-R3.2** — Las locaciones sin `lat`/`lng` se listan igual (como hoy),
  simplemente no ponen pin. No hacen fallar el mapa entero.

## Criterios de aceptación

- **AC-MAPA-A** — Con 5 locaciones programadas y coordenadas cargadas, las 5
  aparecen como pin al mismo tiempo, con el mapa encuadrado para que entren
  todas.
- **AC-MAPA-B** — Elegir una locación en la lista mueve el foco a su pin sin
  recargar la página.
- **AC-MAPA-C** — Sin la API key configurada, el tablero no muestra un mapa
  gris ni un error de consola: muestra que falta configuración.

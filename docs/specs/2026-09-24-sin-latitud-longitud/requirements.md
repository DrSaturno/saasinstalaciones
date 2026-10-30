# Requisitos

## LATLNG-R1 — Nadie tiene que escribir coordenadas

- **LATLNG-R1.1** — Ningún formulario de la aplicación pide latitud ni longitud: ficha del local,
  convocatoria, cobertura del instalador.
- **LATLNG-R1.2** — La plantilla de importación de locales no tiene columnas de coordenadas, y el
  instructivo que la acompaña no las menciona.
- **LATLNG-R1.3** — La exportación de locales no emite columnas de coordenadas.
- **LATLNG-R1.4** — La ficha de una locación no muestra números de latitud y longitud.

## LATLNG-R2 — La ubicación se obtiene de la dirección

- **LATLNG-R2.1** — Al crear un local con dirección, se calcula su ubicación.
- **LATLNG-R2.2** — Al editar un local, se recalcula **sólo si cambió** la dirección, la ciudad, la
  provincia o el estado; si no cambió, se conserva la que tenía.
- **LATLNG-R2.3** — Si la dirección cambió y no se pudo ubicar la nueva, la ubicación anterior se
  descarta: es preferible «sin ubicación» a un punto que ya no corresponde.
- **LATLNG-R2.4** — La base de un instalador (dirección y ciudad) se ubica sola al guardar su
  cobertura, y con eso funciona el radio de servicio.
- **LATLNG-R2.5** — Una convocatoria puede llevar una dirección aproximada opcional; con ella se
  ubica el trabajo y el matching afina por radio, como antes con coordenadas.
- **LATLNG-R2.6** — Los locales importados se ubican solos, con un tope por importación; los que
  queden sin ubicar se completan con una acción explícita (LATLNG-R3.1).

## LATLNG-R3 — Lo que ya existe se completa

- **LATLNG-R3.1** — El gerente puede pedir «Completar ubicaciones»: se procesan los locales con
  dirección y sin ubicación, con un tope por pedido, y se informa cuántos se ubicaron y cuántos no.

## LATLNG-R4 — Se degrada sin romperse

- **LATLNG-R4.1** — Sin clave de geocodificación configurada, todo funciona como hoy con las
  coordenadas en blanco: los locales se guardan sin ubicación y no hay errores.
- **LATLNG-R4.2** — Si el servicio de Google falla, tarda o no encuentra la dirección, guardar el
  local **no falla**: queda sin ubicación.
- **LATLNG-R4.3** — Un resultado vago (coincidencia parcial de nivel aproximado) se trata como «no
  ubicado»: una ubicación con falsa precisión puede bloquear una asignación por traslado.

## LATLNG-R5 — Privacidad

- **LATLNG-R5.1** — Las direcciones no se escriben en los logs.
- **LATLNG-R5.2** — La clave es secreta y sólo del servidor; nunca con prefijo `NEXT_PUBLIC_`.

## Criterios de aceptación

- **AC-LATLNG-A** — Crear un local con dirección «Av. Corrientes 1234, CABA» lo deja con
  coordenadas cargadas sin que nadie las haya escrito (con la clave configurada).
- **AC-LATLNG-B** — Editar sólo el teléfono de un local no consulta a Google y conserva sus
  coordenadas; editar la dirección sí las recalcula.
- **AC-LATLNG-C** — Sin clave configurada, crear y editar locales funciona igual que hoy.
- **AC-LATLNG-D** — Una dirección que Google no encuentra guarda el local sin ubicación y sin error.
- **AC-LATLNG-E** — La plantilla descargada, la exportación y la ficha no contienen «lat», «lng»,
  «latitud» ni «longitud».

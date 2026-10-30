# Diseño

## LATLNG-DEC-01 — Se conserva el dato, cambia quién lo escribe

`lat`/`lng` quedan como columnas internas. Todo lo que hoy las lee (mapa, clima, matching, traslado,
ruta) sigue igual. Sólo se cambia el origen: en vez de un formulario, un geocodificador de servidor.

## LATLNG-DEC-02 — Google Geocoding API, desde el servidor, con clave propia

La clave del mapa del navegador (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`) está **restringida por
dominio**: una llamada desde el servidor la rechazaría. Se define una clave aparte,
`GOOGLE_GEOCODING_API_KEY`, secreta, restringida a la Geocoding API (y, si se quiere, por IP).

**Lo que necesita Nicolás:** crear esa clave en Google Cloud (habilitar «Geocoding API»), y cargarla
en Vercel y en `.env.local`. **Costo:** Google factura por consulta (del orden de USD 5 cada 1000);
un proyecto de 2000 puntos son unos USD 10, una sola vez, más lo que se edite. Sin la clave nada se
rompe (LATLNG-R4.1).

**Alternativa descartada:** geocodificadores gratuitos (Nominatim). Sus condiciones de uso no
admiten volumen comercial ni importaciones de miles de filas.

## LATLNG-DEC-03 — Cuándo se consulta

Sólo cuando hace falta: alta, cambio real de dirección/ciudad/provincia, ubicación faltante al
importar, cobertura del instalador, convocatoria con dirección y la acción «Completar
ubicaciones». Comparar antes de consultar evita pagar por cada edición de teléfono (AC-LATLNG-B).

## LATLNG-DEC-04 — Qué se acepta como resultado

Se toma el primer resultado de Google **salvo** que sea `partial_match` con `location_type =
APPROXIMATE`: eso es una conjetura de barrio o ciudad. Se restringe por país del proyecto
(`components=country:AR|BR`) para que «Belgrano 500» no se resuelva en otro país.

**Por qué tan estricto en lo vago:** el matching y la viabilidad de traslado deciden con estos
números. Un punto aproximado puede bloquear una asignación legítima o dejar pasar una imposible.
Sin ubicación, esos controles se saltan en silencio, que es el comportamiento de hoy con la
coordenada en blanco.

## LATLNG-DEC-05 — Una falla no falla el guardado

Guardar el local es lo importante; ubicarlo es una mejora. Cualquier falla (sin clave, timeout de 8 s,
cuota, dirección inexistente) devuelve `null` y el local se guarda sin ubicación. Se registra el
motivo (`no_key`, `timeout`, `zero_results`, `over_query_limit`…), **nunca la dirección**.

## LATLNG-DEC-06 — Importaciones y reintentos

Importar miles de filas no puede geocodificar dentro de la misma solicitud sin límite. Se ubican
hasta un tope por importación, con concurrencia acotada y un presupuesto de tiempo; el resto queda
sin ubicar y se completa con «Completar ubicaciones», que procesa por tandas. No hay columna de
estado: «sin coordenadas y con dirección» es el criterio. Consecuencia aceptada: una dirección que
Google no encuentra se reintenta cada vez que se aprieta el botón (tope por pedido, costo acotado).

## LATLNG-DEC-07 — La convocatoria gana una dirección aproximada, que no se guarda

`broadcasts` no tiene columna de dirección. En vez de sumar una (migración), el campo opcional se
usa sólo para ubicar el trabajo al publicar y se descarta: se guarda el resultado, no la dirección.

## LATLNG-DEC-08 — Sin migración

No hay cambios de esquema ni de RLS: producción no se ve afectada por este bloque hasta que se
despliegue el código y se cargue la clave.

# Requisitos

Trazan a `REQ-13` de `docs/specs/2026-08-04-evolucion-producto/requirements.md`
(tareas `R6-NOT-01/02`, `R8-COM-01..04`). De ese requisito madre, esta
entrega cubre 13.1, 13.2, 13.4, 13.6 completos, y 13.3 parcialmente
(provincia + proyecto + disponibilidad combinables; localidad y tipo de
servicio quedan fuera con motivo). 13.7 (worker que drene la outbox) no
entra: es infraestructura de entrega, no lo que pide el punto 23.

## Reglas

- **NOT-R1** — Archivar y descartar **nunca borran la fila**. Son estado por
  destinatario sobre su propia notificación; el registro queda para
  trazabilidad. Es la diferencia con el `DELETE` que la policy `for all` ya
  permitiría hoy.
- **NOT-R2** — Sólo se archiva o descarta lo **ya leído**. Una notificación
  pendiente no puede desaparecer de la bandeja sin que la persona la haya
  visto: el pedido es "mantener visibles las pendientes".
- **NOT-R3** — Descartar es más fuerte que archivar: lo archivado se puede
  ver y recuperar; lo descartado no vuelve a aparecer en ninguna vista de
  ese usuario. Ninguna de las dos afecta lo que ven otros destinatarios del
  mismo anuncio.
- **NOT-R4** — La prioridad se muestra con color **y** con una etiqueta
  textual. El color solo no alcanza (REQ-13.2): quien no lo distingue tiene
  que poder leerlo.
- **NOT-R5** — La prioridad de una notificación sale de lo que ya guarda su
  `data.severity`. No se inventa una columna nueva ni se infiere del `type`:
  el dato ya viaja, sólo hay que dejar de descartarlo al leer.
- **COM-R1** — Los criterios de audiencia se **combinan** (AND). "Buenos
  Aires + disponibles" es un público válido, no dos envíos.
- **COM-R2** — El conteo previo y el envío usan **la misma consulta**. Un
  preview que no sea la consulta real es una promesa que se puede romper
  sola (REQ-13.4).
- **COM-R3** — Publicar dos veces el mismo aviso no duplica la notificación
  del destinatario: el fan-out es idempotente por `dedupe_key` (AC-13-B).
- **COM-R4** — Una comunicación **nunca** crea una oferta, una postulación
  ni una orden. Hoy se cumple de hecho; pasa a estar blindado por un test
  (REQ-13.6, `R8-COM-04`).
- **COM-R5** — El fan-out sigue acotado por `company_id` sobre el roster
  activo de esa empresa. Ningún criterio nuevo puede ampliar el alcance
  fuera del tenant (AC-13-C).
- **COM-R6** — Lo que la UI promete sobre canales de entrega tiene que ser
  cierto. Si dice que llega al celular, llega al celular.

## Criterios de aceptación

- **AC-23-A** — Dada una notificación leída y archivada por el usuario A,
  entonces desaparece de su bandeja principal, sigue disponible en
  "Archivadas", y el usuario B —destinatario del mismo anuncio— la sigue
  viendo intacta en su propia bandeja.
- **AC-23-B** — Dada una notificación descartada, entonces no vuelve a
  aparecer en ninguna vista de ese usuario, y la fila sigue existiendo en
  la base.
- **AC-23-C** — Dada una notificación sin leer, entonces la acción de
  archivar/descartar no está disponible para ella (NOT-R2).
- **AC-23-D** — Dado un anuncio crítico, entonces en la bandeja se ve el
  color rojo **y** la palabra que lo nombra, sin depender del color para
  entenderlo.
- **AC-23-E** — Dado el público "Buenos Aires + disponibles", entonces el
  conteo que se muestra antes de publicar coincide exactamente con la
  cantidad de notificaciones creadas al publicar.
- **AC-23-F** — Dado un anuncio publicado dos veces con el mismo contenido y
  la misma clave, entonces cada destinatario tiene una sola notificación.
- **AC-23-G** — Dado un anuncio publicado, entonces no aparece ninguna fila
  nueva en `broadcasts`, `broadcast_applications` ni `work_orders`.
- **AC-23-H** — Dado un instalador con push activado, cuando la empresa
  publica un anuncio, entonces le llega la notificación al celular con la
  app cerrada.

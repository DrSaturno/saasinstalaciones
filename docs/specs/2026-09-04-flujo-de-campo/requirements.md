# Requisitos

Trazan a `REQ-14.1..14.7` y `AC-14-A/B/C` de la spec madre. Cada regla
lleva el número de etapa del pedido de Nicolás entre paréntesis.

## FLD-R1 — La secuencia completa queda modelada (etapas 1-8)

El ciclo de vida de una orden debe poder recorrer, en orden:

```
aceptada → en camino → llegada al sitio → en proceso (avance)
        → [bloqueo, si aplica] → finalización solicitada
        → revisión del coordinador → aprobada
```

- **FLD-R1.1** — `en_camino` y `en_sitio` son estados de `work_orders`, con
  una única definición de transiciones válidas, validada en dominio **y**
  en la base (REQ-14.3).
- **FLD-R1.2** — Sólo el instalador asignado puede marcar "en camino" y
  "llegué": son hechos que sólo sabe quien se está moviendo.
- **FLD-R1.3** — El bloqueo **no** es un estado. Es un hecho que puede
  ocurrir durante la ejecución sin sacar la orden de su curso — el pedido
  lo marca como opcional y "cuando exista una situación que impida o
  dificulte", no como una etapa obligatoria del camino.
- **FLD-R1.4** — Las órdenes que hoy están en cualquier estado siguen
  pudiendo terminar su ciclo. Ninguna queda trabada por estados que no
  existían cuando se crearon.

## FLD-R2 — Cada cambio de estado es reconstruible (REQ-14.2)

- **FLD-R2.1** — Todo cambio de estado registra **estado anterior y estado
  nuevo en columnas propias**, no en prosa. Hoy la única traza es una frase
  traducida al idioma de quien la ejecutó.
- **FLD-R2.2** — Cada evento conserva autor, `occurred_at` (reloj del
  cliente) y `received_at` (reloj del servidor), nota y fotos. Los dos
  timestamps ya existen (`client_created_at` / `created_at`): se preservan
  y se exponen (REQ-14.7).
- **FLD-R2.3** — El historial se puede leer completo desde la orden, en
  orden cronológico, con las fotos asociadas a cada evento.
- **FLD-R2.4** — El registro es append-only: ningún evento se edita ni se
  borra al cambiar el estado.

## FLD-R3 — Llegada al sitio (etapa 3)

- **FLD-R3.1** — "Llegué al sitio" es una acción propia, separada de
  "empezar a trabajar".
- **FLD-R3.2** — Puede acompañarse de fotos y una nota del estado inicial
  de la locación. **No** son obligatorias: exigir evidencia para poder
  declarar que se llegó dejaría a alguien sin señal parado en la puerta sin
  poder registrar nada.

## FLD-R4 — Evidencia mínima para finalizar (etapa 6, REQ-14.4)

- **FLD-R4.1** — Solicitar la finalización exige un mínimo de fotos.
- **FLD-R4.2** — El mínimo es configurable: un valor por empresa, con
  override por proyecto. Baseline **3**.
- **FLD-R4.3** — Se cuentan **todas** las fotos de la orden, no sólo las
  del evento de cierre. Quien documentó bien durante la ejecución no tiene
  que volver a fotografiar lo mismo para poder cerrar.
- **FLD-R4.4** — La regla se valida en dominio, en el servidor **y en la
  base** (AC-14-A). Que el botón esté deshabilitado no alcanza: la cola
  offline escribe por otro camino.
- **FLD-R4.5** — Cuando falta evidencia, el mensaje dice cuántas fotos hay
  y cuántas faltan. "No se puede finalizar" no le dice a nadie qué hacer.

## FLD-R5 — Bloqueo visible (etapa 5)

- **FLD-R5.1** — El instalador puede reportar un bloqueo con descripción y
  fotos, y eso **crea una incidencia** con él como autor.
- **FLD-R5.2** — La incidencia entra a los mismos lugares donde la empresa
  ya mira: alertas del dashboard, tasa de incidencias, ficha de la
  locación.
- **FLD-R5.3** — El bloqueo notifica al coordinador del proyecto y a la
  empresa. Un bloqueo que nadie ve no es un bloqueo reportado.
- **FLD-R5.4** — Reportar un bloqueo **no** cambia el estado de la orden ni
  la traba: el instalador puede seguir cargando avances o cerrar si el
  problema se resolvió.

## FLD-R6 — Decisiones del coordinador (etapa 7, REQ-14.5)

Desde `en_revision`, el coordinador puede:

- **FLD-R6.1** — **Aprobar** → `finalizada`.
- **FLD-R6.2** — **Pedir evidencia adicional** → vuelve a `en_proceso` con
  el motivo registrado y el pedido visible para el instalador.
- **FLD-R6.3** — **Pedir corrección** → vuelve a `en_proceso`, ídem.
- **FLD-R6.4** — **Reabrir** un trabajo ya aprobado → de `finalizada` a
  `en_proceso`, con motivo obligatorio (AC-14-B).
- **FLD-R6.5** — Todas exigen motivo salvo aprobar, y **todas** notifican
  al instalador asignado (REQ-14.6).
- **FLD-R6.6** — Se conserva la regla vigente: quien ejecutó la orden no
  puede aprobarla ni reabrirla, aunque además sea coordinador del proyecto
  (ADR-001).

## Criterios de aceptación

- **AC-24-A** — Dada una orden aceptada, cuando el instalador marca "en
  camino" y luego "llegué", entonces los dos cambios quedan en el historial
  con estado anterior, estado nuevo, autor y ambos timestamps; y el
  coordinador los ve en la lista de órdenes sin abrir la orden.
- **AC-24-B** — Dada una orden con 2 fotos y un mínimo de 3, cuando se
  intenta solicitar la finalización, entonces la rechazan el dominio, el
  servidor **y** la base, con un mensaje que dice cuántas faltan
  (AC-14-A).
- **AC-24-C** — Dado un proyecto con mínimo 1 en una empresa cuyo default
  es 3, cuando se cierra una orden de ese proyecto con 1 foto, entonces se
  acepta.
- **AC-24-D** — Dado un instalador que reporta un bloqueo, entonces se crea
  una incidencia con él como autor, aparece en las alertas del dashboard, y
  el coordinador recibe notificación — sin que la orden cambie de estado.
- **AC-24-E** — Dado un coordinador que pide corrección sobre una entrega,
  entonces la orden vuelve a `en_proceso`, el motivo queda en el historial,
  el instalador recibe notificación y ve qué le piden.
- **AC-24-F** — Dado un instalador que además es coordinador del proyecto,
  cuando intenta aprobar su propia entrega, entonces la base lo rechaza.
- **AC-24-G** — Dada una orden creada antes de esta entrega, en cualquier
  estado, entonces puede completar su ciclo sin quedar trabada.
- **AC-24-H** — Dado un evento offline que llega tarde, entonces no
  duplica (mismo id de cliente) y conserva su `occurred_at` original.

## Fuera de alcance, a propósito

- **Offline v2** (`R5-OFF-01..06`, `R5-CMD-01`): command envelope con
  versión esperada, outbox versionada con dependencias, bandeja de
  conflictos por elemento, carga de fotos resumible, purga por cambio de
  cuenta. Es un proyecto XL propio. La cola Dexie actual ya da idempotencia
  por id de cliente, que es lo que este flujo necesita. `AC-14-C`
  (conflicto resoluble por versión esperada) queda con ella, no acá.
- **Checklist configurable** (parte de REQ-14.4): el pedido de Nicolás pide
  evidencia fotográfica mínima, no checklist. `work_conditions` ya cubre
  condiciones de la orden por otro camino.
- **Ubicación GPS en los eventos** (REQ-14.2, "ubicación cuando
  corresponda"): `sites` ya tiene coordenadas y el pedido no menciona
  geolocalizar al instalador. Capturar posición de una persona es una
  decisión de privacidad que merece pedirse explícitamente, no colarse en
  una entrega de flujo.

# Diseño

## DEC-LOTE-01 — El alcance pasa a ser explícito, no derivado

Hoy el alcance se **deduce**: "las locaciones sin orden". Pasa a ser una lista
de ids que manda la pantalla.

**Por qué el cambio es de fondo y no un filtro más:** mientras el alcance se
deduzca del estado, la segunda vuelta es inexpresable — el conjunto que la
regla produce está vacío justo cuando más se lo necesita. No alcanza con
agregar un `?incluirTodas=true`: hay que dejar de derivar.

El alta normal se conserva (`LOTE-R2.3`) porque sigue siendo lo correcto la
primera vez, cuando nadie quiere tildar 200 casilleros para decir "todas las
que faltan".

## DEC-LOTE-02 — La idempotencia va en la base, no en el botón

Se agrega `work_orders.batch_id uuid` y un índice único
`(batch_id, site_id)`.

La pantalla genera el uuid **antes** de enviar y lo manda con el lote. Si la
misma confirmación llega dos veces —doble clic, reintento de red, el usuario
volviendo atrás— la segunda choca contra el índice y no inserta.

**Por qué no alcanza con deshabilitar el botón:** eso cubre el doble clic y
nada más. No cubre dos pestañas, ni un reintento del navegador, ni dos
peticiones que llegan en paralelo. Con 200 órdenes por lote, el modo de fallo
es crear 400 y tener que borrarlas a mano una por una.

Es además el patrón que la app ya usa para la cola offline del instalador
—idempotencia por uuid generado en cliente—, así que no introduce una idea
nueva.

`batch_id` es nullable: las órdenes que ya existen y las que se crean de a una
no pertenecen a ningún lote.

## DEC-LOTE-03 — Se muestra cuántas caen sobre locaciones ya trabajadas

La confirmación no dice sólo "vas a crear 200 órdenes": dice cuántas de esas
caen sobre locaciones **que ya tenían una orden viva**.

**Por qué ese número y no otro:** es el único que distingue "estoy terminando
de cargar el proyecto" de "estoy mandando a todo el equipo a rehacer 200
locales". Un total sin ese desglose se ve igual en los dos casos, y son
decisiones de peso muy distinto.

## DEC-LOTE-04 — Se conserva el tope por lote

La inserción sigue yendo en tandas de 500 (`BATCH_SIZE`). No se toca: 200
entran en una sola, y el mecanismo ya está probado para proyectos más grandes.

# Diseño

## La máquina de estados, de 7 a 9

```
pendiente ─┬─→ relevamiento ─→ planificada ─→ en_camino ─→ en_sitio ─→ en_proceso
           └─→ planificada                                                  │
                                                                            ↓
                                          finalizada ←── en_revision ───────┘
                                              │              │
                                              └──────────────┴──→ en_proceso (reapertura)
```

Cambios respecto de hoy:

- `planificada → en_camino → en_sitio → en_proceso` reemplaza el salto
  directo `planificada → en_proceso` como camino guiado.
- Se **conserva** `planificada → en_proceso` (DEC-24-01, abajo).
- `finalizada → en_proceso` es nuevo: hoy `finalizada` es terminal y
  `FLD-R6.4` pide poder reabrir un trabajo ya aprobado.
- `en_camino` y `en_sitio` pueden cancelarse, igual que `planificada`.

### DEC-24-01 — Se conserva el salto directo `planificada → en_proceso`

Podría parecer más limpio forzar el camino largo, pero rompería tres cosas
reales: las órdenes que hoy están en `planificada` y venían de un flujo sin
estas etapas; la proyección desde `work_activities` (`in_progress` mapea a
`en_proceso`, y esa actividad no sabe de traslados); y el trabajo que
empieza sin traslado — el instalador ya estaba en el sitio por otra orden.

El camino largo es el que ofrece la UI; el corto queda como transición
válida para esos casos. **La secuencia se guía, no se impone.**

### DEC-24-02 — El bloqueo no es un estado

`FLD-R1.3`. El pedido lo marca como opcional y condicional. Un estado
`bloqueada` obligaría a salir de él para seguir, y a decidir a dónde vuelve;
y una orden bloqueada **sigue estando en proceso** — el instalador puede
cargar avances de lo que sí pudo hacer. Se modela como incidencia abierta
sobre la orden, que es lo que ya existe.

### Mapeo con `work_activities`

Hay proyección bidireccional entre `work_orders.status` y
`work_activities.lifecycle`. El `case` de `project_order_to_activity`
devuelve `null` para estados que no conoce y sale sin escribir, así que los
estados nuevos **no rompen** la sincronización — pero dejarlos sin mapeo
haría que la actividad se quede quieta mientras la orden avanza, lo cual
sería correcto sólo por accidente.

Se mapean explícitamente los dos a `scheduled`: el traslado y la llegada
son preparación, la actividad de ejecución todavía no empezó. El trabajo
arranca en `en_proceso → in_progress`, como hoy.

Esto además evita un rebote: si `en_sitio` mapeara a `in_progress`, el
camino inverso (`in_progress → en_proceso`) devolvería la orden a
`en_proceso` sola, saltándose la etapa que el instalador acaba de marcar.

## Trazabilidad estructurada

`order_updates` ya es el log append-only correcto —id de cliente, autor,
fotos, nota, `client_created_at` y `created_at`—. Le faltan dos columnas:

```sql
alter table public.order_updates
  add column from_status text,
  add column to_status text;
```

`transitionOrder` las escribe además de la frase traducida. La nota en prosa
se conserva para no romper lo ya escrito, pero deja de ser la fuente:
`FLD-R2.1`.

### Por qué no una tabla de eventos nueva

`R5-CMD-01` de la spec madre pide un event store append-only con envelope y
versión esperada. Construirlo acá significaría escribir dos veces cada
evento (a la tabla nueva y a `order_updates`, que alimenta el historial, la
búsqueda de evidencia del punto 13 y el chat de la orden) o migrar todas
esas vistas de una. `R5-CMD-05` dice literalmente "adaptar `order_updates`
como proyección hasta migrar todas las vistas": esta entrega hace eso.

## Evidencia mínima configurable

```sql
alter table public.companies
  add column min_completion_photos smallint not null default 3
    check (min_completion_photos between 0 and 20);

alter table public.projects
  add column min_completion_photos smallint
    check (min_completion_photos between 0 and 20);
```

El de proyecto es nullable a propósito: `null` significa "usá el de la
empresa", no "cero". Un default numérico en `projects` obligaría a retocar
cada proyecto existente cuando la empresa cambie su política.

Una función `order_min_photos(p_order uuid)` resuelve la precedencia
—proyecto, si no empresa— y es la **única** definición. La usan el dominio
(vía la data que ya trae la página), la Server Action y el trigger.

### Dónde se valida, y por qué en los tres lados

- **Dominio** (`lib/domain/field-flow.ts`, puro): decide si el botón se
  ofrece y arma el mensaje de cuántas faltan.
- **Server Action**: rechaza con mensaje claro.
- **Trigger** (`validate_order_transition`): rechaza `en_proceso →
  en_revision` si el conteo no llega. **Es el único que la cola offline no
  puede esquivar** — `installerTransition` escribe por otro camino cuando
  vuelve la señal. `AC-14-A` pide explícitamente "servidor y DB".

El conteo suma las fotos de **todos** los `order_updates` de la orden
(`FLD-R4.3`), no las del evento de cierre.

## El puente bloqueo → incidencia

Hoy hay dos caminos que no se tocan. Se unen en el que ya tiene consumidores:

- `createIncident` deja de exigir gerente o coordinador y admite además **al
  instalador asignado a esa orden** — no a cualquier instalador de la
  empresa. La autorización es por asignación, igual que `addUpdate`.
- Reportar un bloqueo escribe las dos cosas en la misma operación: el
  `order_updates` tipo `blocker` (el historial de campo, con las fotos) y
  la fila en `order_incidents` (lo que ve la empresa), enlazadas por una
  columna nueva `order_incidents.update_id`.
- Categoría por defecto `technical_issue` y severidad `high`. El instalador
  no clasifica: describe y saca fotos. Clasificar es trabajo del
  coordinador, que ya tiene la pantalla para editarla.
- Notifica al coordinador del proyecto y a la empresa, por el mismo
  `requestPushDelivery` que ya usan los otros eventos, con un evento nuevo
  `blocker_reported`.

## Decisiones del coordinador

`en_revision` gana dos salidas más, pero **no dos estados más**: pedir
evidencia y pedir corrección devuelven a `en_proceso`, igual que reabrir.
Lo que las distingue es el evento que dejan en el historial y lo que ve el
instalador.

```
review_decision: 'approve' | 'request_evidence' | 'request_changes' | 'reopen'
```

Un solo Server Action `reviewOrderDelivery(orderId, decision, reason)` con
las cuatro. Motivo obligatorio en las tres últimas (`FLD-R6.5`), y la regla
de no-autoaprobación se conserva tal cual está en el trigger.

`reopen` es la única que parte de `finalizada`; las otras tres de
`en_revision`.

## UI

- **`StatusStepper`** suma los dos pasos. Ya dibuja el ciclo lineal: es el
  "Flujo general" del pedido, sin construir nada nuevo.
- **`task-actions.tsx`** deja de tener un botón "Iniciar" que hace tres
  cosas. Pasa a ofrecer la acción que corresponde al estado: "Voy en
  camino" → "Llegué" (con fotos opcionales) → "Empezar", y desde
  `en_proceso` avance / bloqueo / finalizar.
- **El botón de finalizar** muestra el conteo (`2 de 3 fotos`) y se
  deshabilita hasta llegar, con el motivo visible. No un error después de
  apretar.
- **Órdenes de la empresa**: los dos estados nuevos aparecen en filtros,
  badges y colores. `ORDER_STATUS` y `ORDER_STATUS_ORDER` son la única
  fuente; alcanza con agregarlos ahí.

## Compatibilidad

`FLD-R1.4` / `AC-24-G`: no hay backfill ni migración de datos. Los estados
nuevos son destinos posibles, no obligatorios; las órdenes existentes
siguen su curso por el camino corto, que se conserva. El mínimo de fotos
nace en 3 por empresa, así que una orden vieja en `en_proceso` con 0 fotos
va a necesitar 3 para cerrar — es el comportamiento pedido, y por eso el
override por proyecto permite bajarlo donde no aplique.

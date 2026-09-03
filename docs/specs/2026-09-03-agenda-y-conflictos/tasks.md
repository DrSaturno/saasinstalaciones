# Tareas

Trazan al bloque **R3-AG** del backlog. `R3-AG-01` (la capa de datos) está hecho; `R3-AG-02..06` no.

El orden no es negociable: sin horarios cargados no hay conflicto que detectar, y sin un único gate el control se esquiva usando otra vía.

## Fase 0 — Los horarios, que es lo que falta para que algo sea detectable

- [x] **AG-TIME-01** — Hora de inicio y fin al crear y editar una orden, con la precisión derivada de lo que efectivamente se cargó. Las órdenes existentes quedan en `unknown`. → `R3-AG-01`, REQ-11.1
- [x] **AG-TIME-02** — Duración estimada; el fin se deriva de ella cuando sólo se carga el inicio. → REQ-11.1
- [x] **AG-TIME-03** — `lib/domain/schedule-precision.ts` con la regla AG-R10 y 13 tests.

**La puerta se construyó ahora, aunque todavía no chequee nada.** El trigger de
la base ya exigía pasar por `app.assignment_gate` para mover un horario, y esa
compuerta existe porque ahí van los controles de la Fase 3. Si esta fase la
hubiera abierto desde una Server Action, cada pantalla que agenda sería un
llamador suelto que después habría que salir a cazar — y bastaría olvidarse de
uno para que el control entero quede decorativo. `set_activity_schedule` es esa
puerta: hoy compone el horario y escribe; los controles se agregan adentro sin
tocar ninguna pantalla.

**Los instantes se arman en SQL, no en TypeScript.** Combinar fecha, hora y huso
da un momento en el tiempo, y `timestamp at time zone` conoce los husos de
verdad. El módulo de dominio trabaja con las piezas sueltas (`YYYY-MM-DD`,
`HH:MM`) y no toca calendarios.

**Verificado contra demo**, con bloques que revierten: 14:00-18:00 en Buenos
Aires se guarda como 17:00-21:00 UTC; un trabajo de 22:00 a 01:00 cierra al día
siguiente; 09:00 más 240 minutos da las 13:00; sólo fecha da `day` con los
timestamps en null; sin fecha da `unknown`; y la compuerta queda cerrada
después de escribir.

## Fase 1 — Disponibilidad

- [x] **AG-AVL-01** — `GlobalAvailabilityCard` en el perfil del instalador, sobre las dos tablas globales que existían sin usarse. Las ausencias propias **no piden aprobación**: es su tiempo. → REQ-11.8
- [x] **AG-AVL-02** — `lib/domain/availability-precedence.ts`: lo efectivo es la **intersección**, con 12 tests. → REQ-11.8

**Por qué intersección y no precedencia a secas.** Si una empresa pudiera
ampliar la ventana que la persona ofrece, la disponibilidad personal no serviría
de nada: bastaría con que una empresa declarara horario corrido para que alguien
quedara disponible un domingo que dijo que no trabajaba. Con intersección, una
empresa puede pedir menos horas, nunca más. Y **no declarar nada no es declarar
que no**: quien todavía no cargó su disponibilidad queda sin restricción propia,
no bloqueado en todas partes.

**Bug encontrado al conectar la fundación muerta.** `installer_global_unavailability`
estaba **rota desde el 12-08-2026**: el trigger compartido evaluaba
`new.timezone` —columna que esa tabla no tiene— porque PL/pgSQL no cortocircuita
la condición, así que *todo* insert fallaba. Nadie lo notó porque ninguna
pantalla usaba la tabla. Arreglado en `20260906000001` anidando el `if`, con la
validación de huso todavía viva y un test que lo fija.

**Verificado contra demo:** la persona ve su semanal y sus ausencias; el
**gerente de su propia empresa ve cero** en las dos tablas; otro instalador del
mismo equipo también ve cero; y cargar una ausencia en nombre de otro se frena
con `GLOBAL_AVAILABILITY_OWNER_MISMATCH`.

## Fase 2 — El cálculo de conflicto

- [x] **AG-CONF-01** — `installer_overlapping_assignments` y `installer_absence_blocks`, internas y cruzando empresas. → `R3-AG-02`
- [x] **AG-CONF-02** — **Restricción de exclusión** sobre `work_assignments`, con `btree_gist`. Verificado: una asignación superpuesta ahora falla con `23P01`. → `R3-AG-02`
- [x] **AG-CONF-03** — `estimated_travel_minutes` sobre `haversine_km`, con velocidad, factor de rodeo y margen en `schedule_rule_versions`. → `R3-AG-04`

**El cerrojo cubre exactamente lo inapelable, y eso no es casualidad.** La
restricción impide el solapamiento, que `DEC-09` trata como bloqueo duro. El
traslado insuficiente —que sí admite override, porque es una estimación
nuestra— se calcula y no se restringe. La regla del pedido quedó traducida a la
forma de la base.

**La estimación es deliberadamente conservadora.** Velocidad efectiva baja
(28 km/h) más un factor de rodeo de 1,35 sobre la línea recta: errar hacia el
conflicto cuesta un override con motivo, y no detectarlo cuesta una
cancelación. Está sin calibrar contra recorridos reales, y en viajes largos
sobreestima bastante — por eso el override existe.

**Verificado contra demo:** una asignación superpuesta falla con `23P01`; un
trabajo que termina 18:00 en un punto y otro que empieza 18:10 a 1,5 km da *no
factible* (necesita 25 minutos, hay 10) — el caso literal del pedido; con una
hora de margen da factible; y un vecino sin coordenadas devuelve
`NO_COORDINATES`, no «está bien».

## Fase 3 — El gate

- [ ] **AG-GATE-01** — RPC transaccional con lock por instalador, idempotente por `operation_id` sobre `assignment_command_receipts`, que devuelve veredicto y **código opaco** (AC-21-D). → `R3-AG-02`
- [ ] **AG-GATE-02** — Migrar **todas** las vías al gate: alta, edición, asignación directa, lote, bolsa y reasignación. Una sola vía que lo esquive vuelve decorativo el control entero. → `R3-AG-03`
- [ ] **AG-GATE-03** — Override de traslado con motivo, auditado en `assignment_override_audit`, y **sólo** para traslado: el solapamiento y la ausencia no se fuerzan (AG-R4, AG-R5). → `R3-AG-04`
- [ ] **AG-GATE-04** — Marcar la asignación como forzada y hacer que una baja atribuible a ese conflicto nazca `cancel_justified`, sin penalizar al instalador (AG-R7, AC-21-H). **Es la mitad del objetivo del pedido**, y la parte que más fácil se olvida.

## Fase 4 — El módulo de Agenda

- [ ] **AG-UI-01** — `/agenda` de empresa: trabajos, instalador, fecha, horario y estado. → `R3-AG-05`
- [ ] **AG-UI-02** — `/agenda` del instalador con sus compromisos de todas las empresas. Es el único que ve su agenda completa. → `R3-AG-05`
- [ ] **AG-UI-03** — Filtros por provincia, instalador, proyecto, orden, estado, fecha y tipo de actividad, **iguales en todo el rango**, desde un mes antes hacia adelante (AG-R8, AC-21-I). → `R3-AG-05`

## Verificación

- [ ] **AG-QA-01** — Dos asignaciones concurrentes desde empresas distintas: gana exactamente una (AC-21-F). → `R3-QA-02`
- [ ] **AG-QA-02** — Ninguna vía elude una ausencia aprobada (AC-21-E). → `R3-QA-02`
- [ ] **AG-QA-03** — La respuesta cross-company no filtra ningún dato del compromiso ajeno (AC-21-D). Mismo estilo que el test de forma del retorno en reputación: si alguien agrega una clave con datos de terceros, falla.

## Decisiones cerradas

- **DEC-18** — Traslado estimado con coordenadas y parámetros versionados; proveedor vial en una fase posterior. Cerrada por Nicolás el 03-09-2026, coincide con `REQ-11.6`.
- **DEC-19** — Solapamiento y ausencia: bloqueo duro. Traslado insuficiente: bloqueo con override auditado del gerente. Nicolás eligió "bloqueo con excepción auditada" y `REQ-11.7`/`DEC-09` precisan dónde vale la excepción.

## Correcciones al backlog encontradas en la auditoría

- **`R3-AG-01` afirma "con exclusión por GiST" y no es cierto.** `pg_constraint` en producción muestra sólo dos `unique` sobre `work_assignments`; lo que hay es un *índice* GiST. Queda como `AG-CONF-02`.
- **El comentario del schema promete una RPC de códigos opacos que nunca se escribió.** La tabla de recibos existe; el emisor no.

## Fuera de alcance, a propósito

- **Google Calendar** (`R3-AG-06`): un calendario externo puede reflejar la agenda, nunca decidirla.
- **Proveedor vial**, por DEC-18.
- **Sugerir o priorizar candidatos.** Este punto impide lo imposible; recomendar a quién asignar es otra cosa.

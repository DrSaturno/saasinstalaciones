# Tareas

Trazan al bloque **R3-AG** del backlog. `R3-AG-01` (la capa de datos) está hecho; `R3-AG-02..06` no.

El orden no es negociable: sin horarios cargados no hay conflicto que detectar, y sin un único gate el control se esquiva usando otra vía.

## Fase 0 — Los horarios, que es lo que falta para que algo sea detectable

- [ ] **AG-TIME-01** — Capturar hora de inicio y fin al crear y editar una orden, con `schedule_precision` derivado de lo que efectivamente se cargó. Las órdenes existentes quedan en `unknown` y **no se les inventa franja** (AC-21-G). → `R3-AG-01`, REQ-11.1
- [ ] **AG-TIME-02** — Duración estimada por actividad, que es lo que permite proponer un fin cuando sólo se carga el inicio. → REQ-11.1
- [ ] **AG-TIME-03** — Módulo de dominio de precisión: qué se puede afirmar con `exact`, `day` y `unknown`, con tests. La regla a fijar es AG-R10: **no verificable no es lo mismo que sin conflicto.**

## Fase 1 — Disponibilidad

- [ ] **AG-AVL-01** — Conectar `installer_global_weekly_availability` e `installer_global_unavailability`, que existen y nadie usa: pantalla del instalador para declarar cuándo no trabaja, valga para qué empresa valga. → REQ-11.8
- [ ] **AG-AVL-02** — Precedencia entre la disponibilidad global de la persona y las preferencias por empresa (AG-R9). → REQ-11.8

## Fase 2 — El cálculo de conflicto

- [ ] **AG-CONF-01** — Detección de solapamiento sobre `schedule_range`, con el índice GiST que ya existe. → `R3-AG-02`
- [ ] **AG-CONF-02** — **Restricción de exclusión** sobre `work_assignments`. Hoy **no existe** —verificado en producción, el backlog dice lo contrario— así que la base acepta dos asignaciones superpuestas. El gate es la puerta; esto es el cerrojo por si alguna vía lo esquiva. → `R3-AG-02`
- [ ] **AG-CONF-03** — Estimación de traslado con coordenadas, velocidad y margen **versionados** (DEC-18), con tests. Sin coordenadas devuelve "no verificable", no una estimación mala. → `R3-AG-04`

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

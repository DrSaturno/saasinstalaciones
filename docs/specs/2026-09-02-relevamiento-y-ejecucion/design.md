# Diseño

## Lo que ya existe, para no volver a construirlo

Verificado contra producción el 02-09-2026. **Nada de esto hay que escribirlo de nuevo:**

| Pieza | Qué resuelve |
|---|---|
| `work_activities` | `activity_type` (`survey` \| `execution`), `lifecycle` de 8 estados, `prerequisite_activity_id` con waiver auditado (motivo de 10 a 500 caracteres), y **fechas propias** con `timezone` y `schedule_precision` (`unknown` \| `day` \| `exact`) |
| `survey_submissions` | Versionadas, con `form_data`, `measurements`, `checklist_responses`, `evidence`, `content_hash`; estados `draft` → `submitted` → `changes_requested` \| `approved` |
| `survey_submission_decisions` | `approved` \| `changes_requested`, con motivo obligatorio de 3 a 1000 caracteres cuando pide cambios |
| `decide_survey_submission` | Comando **idempotente** por `operation_id`, que detecta reúso con datos distintos, prohíbe autoaprobarse, exige la última versión y notifica al autor en su idioma |
| `validate_work_activity` | Enforcea el prerrequisito: una ejecución no arranca sin su relevamiento aprobado |
| RLS + triggers | Las tres tablas con políticas y validación |

Dos de esas cosas merecen subrayarse porque son justo las que se suelen implementar mal: **la prohibición de autoaprobarse está en un CHECK de la tabla**, no sólo en el comando, y `schedule_precision = 'unknown'` es exactamente el "la fecha del relevamiento puede quedar pendiente" del requisito, modelado sin recurrir a un null ambiguo.

## Lo que falta, que es poco y es preciso

1. **Nada crea actividades.** No hay ningún comando ni trigger que inserte en `work_activities`. Es el eslabón que deja todo lo demás inerte.
2. **Nada envía una submission.** La política deja al asignado insertar el borrador, pero no existe el comando `draft → submitted` con su idempotencia.
3. **No hay proyección de vuelta a `work_orders.status`.** Sin eso los dos modelos divergen y la empresa ve un estado que no refleja la realidad.
4. **No hay capa de aplicación.** Cero.

## La decisión que ordena la convivencia

**Las actividades son la fuente de verdad; `work_orders.status` pasa a ser una proyección.**

La alternativa —migrar de golpe— obligaría a reescribir el tablero, la vista de la empresa, el PDF, las finanzas y la app del instalador en un solo movimiento, con 30 órdenes vivas. Y el otro extremo —dejar los dos modelos escribiéndose por separado— garantiza que en algún momento discrepen, y ahí nadie sabe cuál creer.

Con proyección: la actividad manda, un trigger mantiene `work_orders.status` coherente, y todo lo que hoy lee el estado escalar sigue andando sin enterarse. Es el mismo patrón que ya usa `project_survey_submission_status`.

## DEC-15 — quién aprueba el relevamiento

Hay una tensión real entre dos textos aprobados:

- **REQ-07.6** admite al gerente como *fallback* "sólo si la regla se documenta".
- **Tu punto 17** dice que la aprobación "no deberá depender directamente de la empresa como instancia operativa, sino del coordinador responsable".

Hoy `decide_survey_submission` usa `auth_can_operate_work_activity`, que incluye al gerente. Es decir: **hoy la empresa puede aprobar**, y eso contradice el punto 17.

**Propuesta:** el coordinador responsable del proyecto es quien aprueba. El gerente queda como fallback **sólo cuando el proyecto no tiene coordinador asignado** — que es un caso real, porque `projects.coordinator_id` es nullable a propósito para que una empresa nueva pueda crear su primer proyecto. Sin ese fallback, un relevamiento de un proyecto sin coordinador quedaría imposible de aprobar para siempre.

El fallback queda registrado en la decisión, para que se pueda auditar cuántas veces se usó.

**Confirmada por Nicolás el 02-09-2026.**

## Relevamiento como trabajo independiente

Es el caso que hoy es imposible y el que más valor da primero.

Una orden cuyo único contenido es una actividad de tipo `survey` puede cerrarse cuando esa actividad queda `approved`. En la proyección, eso lleva la orden a `finalizada` **sin pasar por `planificada` ni `en_proceso`** — hoy el camino obligado inventa una ejecución que nunca ocurrió, que es literalmente lo que `AC-07-A` prohíbe.

## Fechas

Cada actividad trae las suyas y no se pisan con las de la orden:

- Relevamiento sin fecha: `schedule_precision = 'unknown'`, ambos timestamps nulos.
- Relevamiento con día pero sin hora: `'day'`.
- Ejecución planificada: `'exact'`, que por CHECK exige los dos timestamps.

La regla del requisito —fecha de inicio obligatoria para planificar, fin opcional— ya la cumple la máquina de estados actual y se mantiene.

## Fases

| Fase | Entrega | Por qué en este orden |
|---|---|---|
| 0 | Comandos que faltan: crear actividad, enviar submission, proyectar el estado. Backfill de las 30 órdenes vivas. | Sin esto todo lo demás no tiene sobre qué pararse |
| 1 | **Relevamiento como trabajo independiente**, de punta a punta | Es el caso hoy imposible; da valor sin tocar nada existente |
| 2 | Revisión del coordinador en la UI: aprobar o pedir cambios con motivo | Depende de DEC-15 |
| 3 | Formulario real: checklist, mediciones y fotos en vez de una nota de texto | Reemplaza lo que hoy es una nota de 3 caracteres |
| 4 | Trabajo con relevamiento incluido: prerrequisito visible y bloqueo en la UI | La regla ya está en la base; falta mostrarla |

Cada fase se prueba contra demo antes de ir a producción, y en ese orden — que es el que me salteé en el punto 16 y costó una corrección.

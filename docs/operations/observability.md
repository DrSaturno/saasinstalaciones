# Observabilidad y alertas

Cierra la parte de instrumentación y alertas de **R0-PLAT-05**. Los umbrales de referencia viven en [`environment-matrix.md`](environment-matrix.md); acá se define qué se emite y qué dispara una alerta.

## Formato

Todo evento sale por `lib/observability.ts` como **una línea JSON** por registro, con `timestamp`, `level`, `event` y el contexto. No se usa `console.log` suelto: el sanitizador recorta profundidad, limita arrays y **redacta por nombre de clave** todo lo que matchee `authorization|cookie|password|secret|token|body|content|message|signed url|file`.

Consecuencias prácticas:

- Un `Error` nunca se serializa entero: sólo `name` y `cause`. El mensaje puede traer datos del usuario o fragmentos de URL firmada.
- Nunca se registra una URL de activación, un `token_hash` ni una URL firmada de Storage. Si hace falta correlacionar, se usa `correlation_id`.
- Los identificadores de tenant y de fila (`company_id`, `order_id`, `user_id`) sí se registran: son necesarios para investigar y no son secretos.

`correlation_id` es el hilo de una operación con varios pasos. En el alta master se acepta desde el header `x-correlation-id`; en el resto se genera.

## Catálogo de eventos

| Evento | Nivel | Dónde | Qué significa |
|---|---|---|---|
| `master.company_onboarding.completed` | info | `app/api/master/companies/route.ts` | Alta de empresa terminada. `email_status: "manual"` = falta pasar el link a mano. |
| `master.company_onboarding.failed` | error | idem | Falló un paso; `step` dice cuál (`company_insert`, `generate_invitation`, `send_activation_email`). |
| `master.company_onboarding.rolled_back` | warn | idem | La compensación limpió empresa y cuenta. No quedaron huérfanos. |
| `master.company_onboarding.rollback_failed` | error | idem | **La compensación falló.** Quedaron datos huérfanos: requiere limpieza manual. |
| `invite_signup.completed` | info | `lib/actions/invite-signup.ts` | Instalador dado de alta y sumado al equipo. |
| `invite_signup.rolled_back` | warn | idem | Se borró la cuenta recién creada; `step` dice en qué paso se cortó. |
| `invite_signup.rollback_failed` | error | idem | **Quedó una cuenta huérfana** que además bloquea reintentar con ese email. |
| `orders.bulk_create.completed` | info | `lib/actions/orders/bulk.ts` | Alta masiva terminada, con `created` y `skipped`. |
| `orders.bulk_create.failed` | error | idem | Un lote cortó a la mitad: `created` entraron, `pending` no. |
| `offline.transition.rejected` | warn/error | `lib/actions/tasks.ts` | El servidor rechazó una transición de campo. `retryable: false` ⇒ nivel error. |
| `offline.transition.failed` | error | idem | Excepción inesperada procesando la transición. |
| `offline.sync.flushed` | info/warn | `lib/offline/sync.ts` | Resumen de un vaciado de cola: `sent`, `failed`, `pending`. |
| `offline.sync.item_failed` | warn | idem | Un elemento falló y se reintenta. `tries` y `age_ms` distinguen corte pasajero de operación que nunca va a entrar. |
| `offline.sync.item_blocked` | error | idem | **El elemento no se reintenta más.** Es pérdida de trabajo de campo si nadie lo atiende. |

## Alertas

Ordenadas por lo que cuesta no verlas. Se activan recién cuando staging tiene volumen real; antes generan ruido sin señal.

| # | Condición | Severidad | Por qué |
|---|---|---|---|
| 1 | Cualquier `*.rollback_failed` | Crítica, avisa siempre | Hay datos huérfanos ahora. Es el único caso donde el sistema ya quedó inconsistente y no se arregla solo. |
| 2 | `offline.sync.item_blocked` > 0 en 1 h | Alta | Trabajo de campo que no va a entrar nunca. El instalador cree que lo mandó. |
| 3 | `master.company_onboarding.failed` con `step: send_activation_email` ≥ 3 en 1 h | Alta | Apunta a Resend/dominio caído, no a un caso aislado. |
| 4 | `offline.sync.item_failed` con `age_ms` > 24 h | Alta | Supera el umbral de edad p95 de outbox de la matriz de entornos. |
| 5 | Tasa de `offline.transition.rejected` > 0,5 % de las transiciones en 24 h | Media | El umbral de éxito de comandos es 99,5 % fuera de validaciones esperadas. |
| 6 | `orders.bulk_create.failed` con `pending` > 0 | Media | Quedó un proyecto con órdenes parciales; hay que decidir si se completa o se revierte. |
| 7 | `master.company_onboarding.completed` con `email_status: "manual"` | Baja, sólo digest | No es una falla, pero es un alta a medio terminar esperando acción humana. |

Las alertas 1 y 2 son las que justifican despertar a alguien. El resto entra en revisión diaria.

## Pendiente

- Instrumentar el resto de las Server Actions de empresa (proyectos, equipo, finanzas) y los jobs de notificación.
- Definir el destino de los logs: hoy salen por `stdout` y los recoge Vercel. Para alertar por umbral hace falta un colector con retención y consultas.
- Métricas de duración: `observeOperation()` ya emite `duration_ms`, pero todavía no se usa en ningún camino.

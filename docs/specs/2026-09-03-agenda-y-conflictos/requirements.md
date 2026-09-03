# Requisitos

Trazan a **REQ-11** de la spec madre, que ya cubría casi todo el pedido del 03-09-2026. Lo que el pedido agrega es sobre todo énfasis: la agenda como módulo con histórico, y el vínculo explícito con confiabilidad.

## Qué pide el punto 21 y qué de eso ya estaba previsto

| Lo pedido | Requisito madre | Estado hoy |
|---|---|---|
| Horarios, duración, zona horaria y precisión para lo viejo | REQ-11.1 | **Schema sí, aplicación no.** Nadie carga horas |
| Agenda dedicada con mes anterior y filtros | REQ-11.2 | No existe ninguna pantalla |
| Chequeo transaccional de solapamiento, ausencia y disponibilidad entre empresas | REQ-11.3 | La RPC no está escrita |
| La empresa recibe sólo disponible/no disponible y un código opaco | REQ-11.4 | Los códigos tienen tabla; nadie los emite |
| Todas las vías de asignación por el mismo gate, con lock | REQ-11.5 | Hoy cada vía escribe por su cuenta |
| Margen y traslado entre locaciones | REQ-11.6 | No existe |
| Solapamiento/ausencia bloquean; traslado admite override auditado | REQ-11.7 | `assignment_override_audit` vacía y sin uso |
| Precedencia entre disponibilidad global y preferencias por empresa | REQ-11.8 | Sin definir |
| **Vínculo con confiabilidad: un conflicto evitable no penaliza** | — (énfasis nuevo) | No existe |

## Reglas

- **AG-R1** — Una actividad puede tener horario exacto, sólo día, o nada. La precisión se declara (`schedule_precision`) y **no se infiere**: una orden vieja sin hora no puede recibir una franja inventada para poder bloquearla o penalizarla (AC-11-C).
- **AG-R2** — El control corre **antes** de confirmar la asignación y dentro de la misma transacción, con lock por instalador. Dos empresas asignando a la vez no pueden ganar las dos (AC-11-A).
- **AG-R3** — **Todas** las vías de asignación pasan por el mismo gate: alta de orden, edición, asignación directa, lote, bolsa de trabajo y reasignación. Una vía que lo esquive vuelve decorativo al control entero (REQ-11.5, AC-11-B).
- **AG-R4** — Un solapamiento de horarios o una ausencia aprobada son **bloqueo duro, sin override**. Son hechos, no estimaciones.
- **AG-R5** — El traslado insuficiente **bloquea con override del gerente**, que exige un motivo y queda auditado. Es una estimación nuestra y podemos estar equivocados (DEC-18, DEC-19).
- **AG-R6** — La empresa que consulta recibe **disponible / no disponible y un código opaco**. Nunca empresa, cliente, proyecto, orden, dirección ni horario del compromiso ajeno (REQ-11.4).
- **AG-R7** — Si la asignación se forzó por override, una baja posterior atribuible a ese conflicto entra como **`cancel_justified`** y no penaliza al instalador. La plataforma avisó y la empresa decidió igual.
- **AG-R8** — La agenda muestra desde **al menos un mes antes** hasta el futuro, con los mismos filtros en todo el rango (REQ-11.2).
- **AG-R9** — La disponibilidad personal global tiene precedencia sobre las preferencias por empresa: es la persona quien decide cuándo no trabaja (REQ-11.8).
- **AG-R10** — El conflicto se detecta con la información disponible. Entre dos actividades sin horario exacto **no se afirma** un choque: se informa que no se puede verificar, que es distinto de decir que no lo hay.

## Criterios de aceptación

- **AC-21-A** — Dado un instalador con un trabajo de 14:00 a 18:00, cuando se le intenta asignar otro de 16:00 a 20:00, entonces la asignación se rechaza y **no** hay override disponible.
- **AC-21-B** — Dado un trabajo que termina 14:00 en una locación y otro que empieza 14:30 a 40 minutos de distancia estimados, entonces se rechaza por traslado insuficiente **y** se ofrece override con motivo.
- **AC-21-C** — Dado ese mismo caso con override ejercido, entonces queda una fila en `assignment_override_audit` con quién, cuándo y por qué.
- **AC-21-D** — Dado un compromiso del instalador con **otra** empresa, cuando la empresa A consulta disponibilidad, entonces recibe "no disponible" y un código, y en ninguna parte de la respuesta aparecen datos del compromiso ajeno (AC-11-A).
- **AC-21-E** — Dada una ausencia aprobada, ninguna vía —alta, edición, lote, bolsa, reasignación— consigue asignar en ese período (AC-11-B).
- **AC-21-F** — Dadas dos asignaciones concurrentes al mismo instalador y horario desde empresas distintas, entonces exactamente una gana.
- **AC-21-G** — Dada una orden legacy sin hora, entonces se muestra como precisión desconocida y no bloquea ni es bloqueada por una franja inventada (AC-11-C).
- **AC-21-H** — Dada una baja posterior a una asignación forzada por override, entonces el evento de confiabilidad es `cancel_justified` y el índice del instalador no baja.
- **AC-21-I** — Dada la agenda con filtros aplicados, cuando se navega al mes anterior, entonces los filtros siguen valiendo y el histórico se ve completo.

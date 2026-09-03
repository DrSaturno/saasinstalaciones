# Diseño

## Primero los horarios, porque sin ellos no hay conflicto que detectar

`schedule_precision` ya modela tres niveles, y son exactamente los que hacen falta:

| Precisión | Qué se sabe | Qué se puede afirmar |
|---|---|---|
| `exact` | Inicio y fin con hora | Solapamiento y viabilidad de traslado |
| `day` | El día, no la hora | Que hay dos compromisos el mismo día. **No** que se pisan |
| `unknown` | Ni eso | Nada |

La regla que se desprende (AG-R10) es la que evita el error más fácil de cometer: **no confundir "no puedo verificarlo" con "no hay conflicto".** Dos trabajos el mismo día en ciudades distintas, ambos sin hora, no son un choque demostrable — pero tampoco son un visto bueno. La respuesta honesta es una advertencia que no bloquea, y el incentivo natural a cargar la hora.

Y al revés, lo que `AC-11-C` prohíbe: inventarle una franja a una orden vieja para poder bloquearla. Las 30 órdenes que hoy viven en producción no tienen hora; ninguna puede empezar a generar conflictos retroactivos.

## El gate: una sola puerta

Hoy cada vía escribe la asignación por su cuenta — alta de orden, edición, lote, bolsa, reasignación. Mientras exista una que no consulte, el control es decorativo: basta usar esa (REQ-11.5, AG-R3).

Entonces: **una RPC transaccional** que hace todo junto y es la única que puede asignar.

```
lock por instalador  →  ausencias  →  solapamiento  →  traslado  →  escribe
```

- **El lock es por persona, no por orden.** El caso que hay que ganar es el de `AC-11-A`: dos empresas asignando a la misma persona en el mismo instante. Bloquear la orden no sirve, porque son órdenes distintas; lo que está en disputa es la agenda de alguien.
- **Corre dentro de la transacción que escribe.** Chequear antes y escribir después deja la ventana abierta justo donde importa.
- **Idempotente por `operation_id`**, con `assignment_command_receipts`, que ya existe para eso. Un reintento no crea una segunda asignación.

## La privacidad es la forma de la respuesta, otra vez

La consulta cruza empresas —tiene que hacerlo, o no detecta nada— pero devuelve un veredicto y un código, nunca filas:

```
{ "available": false, "code": "SCHEDULE_OVERLAP", "receipt_id": "..." }
```

Nada de empresa, cliente, proyecto, orden, dirección ni horario ajeno (AG-R6). Es el mismo principio que ya se aplicó en reputación: **lo que impide la fuga no es una policy que alguien puede leer mal, sino que la función no tiene el detalle para dar.**

El código sirve para dos cosas: que la pantalla explique *por qué* sin saber *de qué*, y que soporte pueda rastrear un caso concreto sin abrir datos de terceros.

## El traslado, y por qué se calibra conservador

```
minutos = (distancia_km / velocidad_kmh) * 60 + margen_fijo
```

La distancia sale de las coordenadas que las locaciones ya tienen. La velocidad y el margen son **parámetros versionados**, no constantes en el código: igual que los pesos de reputación, calibrarlos no puede exigir un despliegue.

Tres cosas que conviene decir en voz alta:

1. **Es una subestimación de la distancia real.** La línea recta nunca es el camino. Por eso la velocidad efectiva tiene que ser bastante menor a la de manejo real — el factor absorbe el rodeo.
2. **Errar hacia el conflicto es lo correcto acá.** Un falso conflicto cuesta un override con motivo; un conflicto no detectado cuesta una cancelación, que es lo que todo este punto existe para evitar.
3. **Sin coordenadas no se inventa.** Una locación sin lat/lng no produce una estimación mala: produce "no verificable", igual que la precisión desconocida.

## Lo que pasa cuando la empresa fuerza igual

El override es la parte del diseño donde se decide quién carga con el error, y por eso no alcanza con auditarlo:

- Queda la fila en `assignment_override_audit` con quién, cuándo y el motivo (AC-21-C).
- **La asignación queda marcada como forzada**, y esa marca sobrevive a la asignación. Si después hay una baja atribuible a ese conflicto, el evento de confiabilidad nace `cancel_justified` — peso 0 (AG-R7, AC-21-H).

Eso último es la mitad del objetivo del pedido y es fácil de perder de vista: si la plataforma detectó el conflicto, avisó, y la empresa siguió igual, **el que no puede pagar la consecuencia es el instalador**.

## El módulo de Agenda

Una pantalla por área, sobre la misma consulta:

- **Empresa**: los trabajos de su operación, con instalador, fecha, horario y estado.
- **Instalador**: los suyos, de todas las empresas — es su agenda, y es el único que la ve completa.

Filtros pedidos: provincia, instalador, proyecto, orden, estado, fecha y tipo de actividad. Rango: desde un mes antes hacia adelante, **con los mismos filtros en todo el rango** (AG-R8). Que el histórico se filtre distinto que el futuro es el defecto que el pedido nombra explícitamente.

Los estados no se inventan: salen de `work_orders.status` y `work_activities.lifecycle`, que ya cubren lo que el pedido enumera.

## Lo que este diseño deliberadamente no hace

- **No convierte a Google Calendar en fuente de verdad.** Un calendario externo puede reflejar la agenda, nunca decidirla: si alguien borra un evento en su Google, no queda libre para la plataforma.
- **No usa un proveedor vial** todavía (DEC-18). La interfaz del cálculo queda aislada para poder enchufarlo sin tocar el gate.
- **No decide por la empresa a quién asignar.** Impide lo imposible; no sugiere ni ordena candidatos.

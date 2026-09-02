# Diseño

## Dos libros, no uno

Confiabilidad y reputación se alimentan de hechos distintos y responden preguntas distintas, así que llevan libros distintos:

- `installer_reliability_events` (ya existe) — aceptó, completó, canceló, no respondió.
- `installer_performance_events` (nuevo) — completó **un trabajo con estas características**, aceptó **con esta anticipación**, resolvió **esta incidencia**.

La tentación es derivar la reputación al vuelo de las órdenes y evitar el segundo libro. No sirve, por una razón concreta: si la reputación se recalcula leyendo las condiciones actuales de la orden, entonces marcar una orden como "trabajo en altura" **después** de terminada le cambiaría la reputación a alguien por un trabajo que ya hizo. Un libro de eventos congela lo que pasó cuando pasó, y por eso cada evento guarda un `context jsonb` con la foto de las características en ese momento (AC-20-I).

## La taxonomía de dificultad (DEC-16)

Condiciones objetivas declaradas sobre la orden, cada una con un peso en una versión de reglas. La dificultad del trabajo es la suma de las condiciones presentes; por encima de un umbral, el trabajo es "complejo".

| Condición | Nota |
|---|---|
| `altura` | Requiere andamio, elevador o arnés |
| `electrico` | Requiere intervención eléctrica |
| `nocturno` | Fuera de horario comercial |
| `gran_formato` | La pieza no la maneja una sola persona |
| `acceso_restringido` | Permisos, centro comercial, aeropuerto, zona de seguridad |
| `exterior` | A la intemperie — **ya existe** como `work_orders.indoor = false` |
| `flete` | **Ya existe** como `work_orders.requires_freight` |

Dos de las siete ya se registran hoy en cada orden, así que la taxonomía no arranca vacía ni obliga a recargar el pasado a mano.

**La condición tiene que estar declarada antes de que la persona acepte.** El reconocimiento es por haber estado dispuesta a tomar ese trabajo, y no se puede haber estado dispuesta a algo que no se sabía. Las condiciones agregadas después no vuelven complejo un trabajo ya aceptado — cuentan para el siguiente.

## La anticipación se mide con el mismo calendario que el plazo

Días hábiles entre `installer_accepted_at` y `scheduled_date`, con `business_days_between` y el calendario del país de la empresa. Reusar esa función no es comodidad: si "poca anticipación" se midiera en días corridos y el plazo de cancelación en días hábiles, habría casos donde la plataforma premia por aceptar algo que después considera fuera de plazo. Con una sola autoridad de calendario eso no puede pasar.

## La racha se lee del libro de confiabilidad, no del propio

La racha necesita saber si una baja fue justificada. Esa clasificación **ya existe y ya está probada** en confiabilidad: `cancel_in_notice` y `cancel_justified` pesan 0; `cancel_late` y `reschedule_no_response` son faltas.

Duplicar esa clasificación en el libro de reputación crearía dos tablas capaces de discrepar sobre si una misma cancelación fue justificada — y el día que discrepen, ninguna de las dos es creíble. Así que la racha se deriva recorriendo `installer_reliability_events` en orden cronológico, y por eso **no se guarda como contador** (REP-R5): un contador incrementable no se puede auditar contra los hechos, y se desincroniza en el primer evento revertido.

## La forma del número

Confiabilidad arranca en 100 y descuenta. Reputación hace lo contrario, y la asimetría es el punto:

```
aporte  = peso(evento) × recencia(evento)
total   = Σ aportes            (los negativos también)
score   = round(100 × (1 − e^(−max(0, total) / K)))
```

Tres propiedades salen de esa curva sin necesidad de recortes ni topes artificiales:

- **Rendimientos decrecientes.** Los primeros trabajos mueven mucho; el trabajo número 200 mueve poco. La reputación distingue a quien recién empieza de quien ya tiene trayectoria, sin premiar infinitamente el volumen — que es textualmente lo que el pedido descarta: *"no depender exclusivamente de la cantidad de trabajos realizados"*.
- **Nunca se termina.** La curva es asintótica: no se llega a 100. Siempre queda algo por mejorar y nadie "completa" su reputación.
- **Se puede caer y recuperar.** Las faltas restan del total antes del mapeo, y trabajos posteriores lo vuelven a subir.

`K` es la constante que define cuánta trayectoria hace falta para llegar a ~63/100. Hay que **calibrarla contra los datos reales** antes de mostrar el número, no elegirla de memoria.

Debajo de la muestra mínima no se afirma un número (REP-R6, AC-20-H): se dice que todavía no hay historia suficiente. Igual que confiabilidad, y por el mismo motivo.

## Por qué esta fórmula vive en SQL y la de confiabilidad vive en TypeScript

No es inconsistencia, es la misma regla aplicada a dos situaciones distintas.

Confiabilidad se calcula en una función pura de TypeScript porque **quien la mira ya tiene permiso para leer los eventos que la componen**: el instalador ve los suyos, la empresa ve los de su operación. Nada se computa con datos que el que mira no podría ver.

Reputación no cumple esa condición. Su valor viene justamente de cruzar empresas, y ningún usuario puede leer ese conjunto completo. Entonces el cálculo tiene que ocurrir donde está el privilegio: dentro de una función `security definer`.

Y de ahí sale la mejor propiedad del diseño: **la frontera de privacidad es la forma de lo que la función devuelve, no una política que alguien pueda leer mal.** `reputation_summary(installer)` devuelve agregados y reconocimientos. No devuelve filas de trabajos. No hay manera de pedirle el detalle, porque no lo tiene para dar (DEC-17, AC-20-E).

El detalle explicable —el aporte de cada hecho, que el pedido exige para el propio instalador— sale de una función distinta que sí valida quién pregunta: el instalador ve todo lo suyo; la empresa, sólo lo ocurrido en su propia operación, igual que hoy con confiabilidad.

## Los reconocimientos se derivan, no se guardan

"Disponibilidad inmediata", "Trabajo de alta dificultad", "Racha de cumplimiento", "Compromiso sostenido": son lecturas del resumen, no filas en una tabla.

Guardarlos obligaría a un backfill cada vez que se ajusta un umbral, y dejaría badges viejos contradiciendo el número que se muestra al lado. Derivados, el umbral es un parámetro de la versión de reglas y no hay nada que quede desactualizado.

## Modo sombra primero

Igual que confiabilidad (`R8-REP-03`): el número se calcula y se compara antes de mostrarse a las empresas. Sirve para calibrar `K`, para ver si reputación y confiabilidad se contradicen en casos reales, y para descubrir si alguna condición de la taxonomía casi nunca se usa o se usa siempre — que sería señal de que está mal definida.

## Lo que este diseño deliberadamente no hace

- **No ordena candidatos por reputación.** Mostrar un número al lado de cada postulante es informar; ordenar la lista por ese número es decidir. Lo segundo es `R8-GATE` y necesita aprobación explícita.
- **No mezcla reputación con la tarifa.** Nada de esto toca precios ni sugerencias de monto.
- **No expone el detalle histórico anonimizado.** Se evaluó y quedó afuera: fechas y rubro juntos permiten deducir de quién era el trabajo en un mercado chico donde todos se conocen.

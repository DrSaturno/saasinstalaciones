# Tareas

Trazan al bloque **R8-REP** del backlog (`R8-REP-01..04`) y a `R8-QA-03`. Ninguna estaba empezada al 02-09-2026.

El orden importa: no se puede emitir un evento sobre la dificultad de un trabajo antes de que la dificultad exista como dato, y no se puede calibrar la fórmula antes de tener eventos reales.

## Fase 0 — La taxonomía, que es el dato que falta

- [x] **REP-DB-01** — Tabla `work_order_conditions` con RLS por `company_id` y test pgTAP (13 aserciones). `indoor` y `requires_freight` NO se copian: se derivan al leer, y el CHECK impide declararlas a mano. → `R8-REP-02`
- [x] **REP-UI-01** — Declarar condiciones al crear y al editar una orden, con un campo compartido por las dos pantallas. → `R8-REP-02`
- [x] **REP-DOM-01** — `lib/domain/work-conditions.ts` con la taxonomía y la composición de condiciones declaradas + derivadas, con tests. → `R8-REP-02`

**Desviación deliberada respecto de lo planificado.** La tarea original decía
"catálogo versionado de condiciones con su peso". El catálogo con pesos **no**
se construyó todavía, y no es un olvido: los pesos son parte de la fórmula, la
fórmula tiene su propia versión, y esa versión llega en la Fase 2. Construir
hoy el mecanismo de versionado no tendría nada que versionar, y obligaría a
elegir pesos antes de poder calibrarlos contra datos reales (`REP-CALC-05`).
La Fase 0 registra hechos; la Fase 2 les pone precio.

**Hallazgo del camino.** En este proyecto `authenticated` recibe todos los
privilegios sobre cada tabla nueva por default, así que los `grant` de las
migraciones son decorativos y quien restringe es la RLS. Como las políticas de
esta tabla son `for all`, hacía falta un `revoke update` explícito: sin él, un
gerente podía cambiar `condition` conservando el `created_at` original, y la
Fase 1 usa justamente esa fecha para saber si la condición estaba declarada
**antes** de que la persona aceptara. Queda cubierto por una aserción del test.

## Fase 1 — El libro de eventos

- [x] **REP-DB-02** — `installer_performance_events` con `context jsonb`, reversa auditable y RLS de sólo lectura. → `R8-REP-02`
- [x] **REP-SRV-01** — Emisión desde el ciclo de vida: aceptación (con la anticipación en días hábiles) y finalización (con las condiciones congeladas), por trigger, igual que `track_reliability_from_order`. → `R8-REP-02`
- [x] **REP-SRV-02** — Emisión del evento de incidencia resuelta, por trigger sobre `order_incidents`. → `R8-REP-02`
- [x] **REP-SRV-03** — `revert_performance_event`: deja el motivo y no borra el hecho. → `R8-REP-01`, AC-20-G

**La escritura la cierra la RLS, no los grants.** Siguiendo lo que apareció en
la Fase 0, esta tabla tiene **sólo políticas de SELECT**: con RLS activa y sin
política permisiva, insert/update/delete quedan denegados aunque el proyecto le
otorgue el privilegio a `authenticated` por default. Todo lo que escribe pasa
por funciones `security definer`. Es el mismo esquema que ya usa
`installer_reliability_events`, y por eso ahí tampoco hacía falta un revoke.

**Verificado contra la base de demo** (no sólo escrito), con bloques que
revierten al terminar: la foto junta lo declarado con lo derivado
(`["altura","exterior","flete"]`), la anticipación da 7 días hábiles para 10
corridos, sin fecha comprometida queda en `null`, volver a disparar el trigger
no duplica, una incidencia abierta no emite nada y al resolverse conserva su
severidad.

## Fase 2 — El cálculo

- [ ] **REP-CALC-01** — Racha derivada de `installer_reliability_events` en orden cronológico, con las bajas justificadas y en plazo sin efecto. Tests pgTAP de AC-20-B. → `R8-REP-03`
- [ ] **REP-CALC-02** — `reputation_summary(installer)`: `security definer`, cruza empresas, devuelve **sólo** agregados y reconocimientos. La forma del retorno es la frontera de privacidad. Test pgTAP de AC-20-E. → `R8-REP-03`
- [ ] **REP-CALC-03** — Función de detalle explicable, con el aporte de cada hecho: todo para el instalador, sólo la propia operación para la empresa. → `R8-REP-04`
- [ ] **REP-CALC-04** — Versionado de reglas y prueba de determinismo: mismos eventos y misma versión, mismo resultado (AC-20-A). → `R8-REP-01`
- [ ] **REP-CALC-05** — **Calibrar `K` contra datos reales** en modo sombra, y revisar si alguna condición de la taxonomía nunca se usa o se usa siempre. No mostrar el número antes de esto. → `R8-REP-03`

## Fase 3 — Lo que ve el instalador

- [ ] **REP-UI-02** — Perfil propio: reputación, racha, reconocimientos y el desglose de por qué. Va al lado del panel de confiabilidad que ya existe, y la pantalla tiene que dejar claro que son dos cosas distintas. → `R8-REP-04`
- [ ] **REP-UI-03** — Historial caracterizado: "Trabajo complejo — Completado", "Incorporación de último momento — Completado". → `R8-REP-04`, AC-20-C, AC-20-D

## Fase 4 — Lo que ve la empresa

- [ ] **REP-UI-04** — Bloque de reputación en la ficha del instalador, separado del de confiabilidad, con los indicadores del pedido: reputación, racha, completados, complejos, aceptados con poca anticipación y cumplimiento. → `R8-REP-04`
- [ ] **REP-UI-05** — Los mismos agregados junto a cada postulante de una oportunidad, que es el momento en que la reputación efectivamente sirve para conseguir trabajo. **Informar, no ordenar** (ver frontera). → `R8-REP-04`

## Verificación

- [ ] **REP-QA-01** — Recálculo, reversa, muestra mínima y privacidad histórica de punta a punta. → `R8-QA-03`

## Decisiones cerradas

- **DEC-16** — Dificultad por condiciones objetivas, no por nivel declarado. Cerrada por Nicolás el 02-09-2026.
- **DEC-17** — Entre empresas viaja el agregado, nunca el detalle. Cerrada por Nicolás el 02-09-2026.

## Fuera de alcance, a propósito

- Ordenar o filtrar candidatos por reputación (`R8-GATE`).
- Historial anonimizado trabajo por trabajo para empresas ajenas: en un rubro chico, fecha y tipo alcanzan para deducir de quién era.
- Tocar el índice de confiabilidad, que este punto lee y no modifica.

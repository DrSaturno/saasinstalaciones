# Tareas

Trazan al bloque **R8-REP** del backlog (`R8-REP-01..04`) y a `R8-QA-03`. Ninguna estaba empezada al 02-09-2026.

El orden importa: no se puede emitir un evento sobre la dificultad de un trabajo antes de que la dificultad exista como dato, y no se puede calibrar la fórmula antes de tener eventos reales.

## Fase 0 — La taxonomía, que es el dato que falta

- [ ] **REP-DB-01** — Tabla de condiciones por orden y catálogo versionado de condiciones con su peso. Incluye RLS por `company_id` y el test pgTAP correspondiente. `indoor` y `requires_freight` se mapean a condiciones desde el vamos, sin duplicar el dato. → `R8-REP-02`
- [ ] **REP-UI-01** — Declarar condiciones al crear y al editar una orden. Tienen que poder declararse **antes** de asignar, porque el reconocimiento es por haber aceptado sabiendo. → `R8-REP-02`
- [ ] **REP-DOM-01** — Módulo de dominio con la taxonomía, el cálculo de dificultad y el umbral de "complejo", con tests. → `R8-REP-02`

## Fase 1 — El libro de eventos

- [ ] **REP-DB-02** — `installer_performance_events` con `context jsonb` (la foto de las características al momento del hecho), reversa auditable y RLS espejo de la de confiabilidad. → `R8-REP-02`
- [ ] **REP-SRV-01** — Emisión desde el ciclo de vida: aceptación (con la anticipación en días hábiles ya resuelta) y finalización (con la dificultad congelada). Mismo patrón de trigger que `track_reliability_from_order`. → `R8-REP-02`
- [ ] **REP-SRV-02** — Emisión del evento de incidencia resuelta, leyendo `order_incidents`. → `R8-REP-02`
- [ ] **REP-SRV-03** — Reversa de evento con motivo, sin borrar el hecho. → `R8-REP-01`, AC-20-G

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

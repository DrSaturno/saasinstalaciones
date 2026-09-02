# Requisitos

Trazan a **REQ-10** de la spec madre. El pedido del 02-09-2026 no contradice nada de lo que ya estaba escrito ahí; agrega detalle sobre la racha, los reconocimientos y qué indicadores tiene que poder leer una empresa de un vistazo.

## Qué pide el punto 20, y qué de eso ya estaba previsto

| Lo pedido | Requisito madre | Estado hoy |
|---|---|---|
| Reputación y confiabilidad como dimensiones distintas | REQ-10.1 | Confiabilidad hecha; reputación es sólo estrellas |
| Considerar dificultad, anticipación, incidencias resueltas, rachas y reseñas | REQ-10.2 | Nada de esto se calcula |
| Dificultad, tipo de servicio y anticipación como atributos explícitos | REQ-10.3 | No existen |
| Fórmula versionada, reproducible y explicable | REQ-10.4 | Existe el precedente en confiabilidad |
| Detalle propio, agregados para terceros | REQ-10.5 | Sin resolver para reputación |
| Revisión/apelación y recálculo sin borrar eventos | REQ-10.6 | Existe el precedente (reversa de confiabilidad) |
| **Racha de cumplimiento con reinicio por baja injustificada** | — (detalle nuevo) | No existe |
| **Reconocimientos nombrados** (disponibilidad inmediata, alta dificultad, compromiso sostenido) | parcialmente en REQ-10.4 ("badges") | No existen |
| **Historial visible de qué tipo de trabajos asumió** | REQ-10.2 | La ficha lista órdenes, sin caracterizarlas |

## Reglas

- **REP-R1** — La reputación se calcula desde un libro de eventos propio (`installer_performance_events`), separado del de confiabilidad. Cada evento **congela** las características del trabajo tal como eran en el momento del hecho.
- **REP-R2** — La dificultad de un trabajo se deriva de condiciones objetivas declaradas sobre la orden (DEC-16). No se infiere de `priority`, del título ni de la descripción.
- **REP-R3** — La anticipación se mide en **días hábiles** entre la aceptación y la fecha comprometida, con `business_days_between` y el calendario del país de la empresa. Es la misma autoridad que gobierna el plazo de cancelación, así que "poca anticipación" y "fuera de plazo" no pueden contradecirse.
- **REP-R4** — La racha cuenta trabajos aceptados y completados de forma consecutiva. Se corta con una baja **injustificada** o fuera de plazo. Una baja en plazo o justificada **no la corta ni la penaliza**, y se lee de la clasificación que confiabilidad ya hace (`cancel_in_notice`, `cancel_justified`).
- **REP-R5** — La racha se **deriva** del libro de eventos en orden cronológico. No se guarda como contador incrementable: un contador se desincroniza y no se puede auditar contra los hechos.
- **REP-R6** — La reputación arranca en 0 y acumula; no arranca en 100 y descuenta. Un instalador sin historia se muestra **sin reputación**, no con reputación mala.
- **REP-R7** — El desempeño reciente pesa más que el antiguo, pero lo antiguo no desaparece de golpe: la trayectoria decae, no se corta.
- **REP-R8** — Una empresa que no originó un trabajo ve **agregados y reconocimientos**, nunca el detalle de ese trabajo (DEC-17). El límite lo impone la **forma de lo que devuelve la función**, no una política que alguien pueda leer mal.
- **REP-R9** — La reputación no filtra, no ordena por sí sola ni bloquea. Sólo se muestra.
- **REP-R10** — Revertir un evento cambia el número y **no borra el evento**: quedan asentados el hecho y su reversa, con motivo.

## Criterios de aceptación

- **AC-20-A** — Dado el mismo conjunto de eventos y la misma versión de reglas, el recálculo da exactamente el mismo resultado. (= AC-10-A)
- **AC-20-B** — Dado un instalador que acepta 8 trabajos y los completa, entonces su racha es 8. Dado que después cancela **en plazo**, la racha sigue en 8. Dado que en cambio cancela **fuera de plazo**, la racha vuelve a 0 y el hecho queda asentado.
- **AC-20-C** — Dado un trabajo marcado con condiciones que lo vuelven complejo, aceptado y completado, entonces aparece en el historial como "Trabajo complejo — Completado" y suma más que un trabajo sin condiciones.
- **AC-20-D** — Dado un trabajo aceptado con menos anticipación que el umbral, entonces queda registrado como "Incorporación de último momento" con la anticipación real que tuvo, medida en días hábiles.
- **AC-20-E** — Dado un perfil consultado por una empresa que **no** originó esos trabajos, entonces se ven los agregados y los reconocimientos, y **no** se ven nombres de empresas, clientes, direcciones ni motivos de cancelación. (= AC-10-C)
- **AC-20-F** — Dado un instalador consultando su propio perfil, entonces ve el aporte de cada hecho a su número, y por qué.
- **AC-20-G** — Dado un evento revertido tras revisión, entonces el número cambia y tanto el evento como su reversa siguen siendo auditables. (= AC-10-B)
- **AC-20-H** — Dado un instalador con menos historia que la muestra mínima, entonces no se afirma un número: se muestra que todavía no hay historia suficiente.
- **AC-20-I** — Dadas las condiciones de una orden modificadas **después** de completada, entonces el evento ya emitido no cambia: reflejaba lo que la persona sabía cuando aceptó.

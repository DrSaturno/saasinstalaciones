# Tareas

Trazan al bloque **R6** del backlog de la spec madre.

## Fase 0 — Cimiento

- [x] **CONF-SPEC-01** — Cerrar DEC-07 y confirmar modo sombra y autoridad de revisión. → `R6-SPEC-01`, `R6-SPEC-02`
- [x] **CONF-DB-01** — Crear reprogramaciones, pedidos de baja y calendario de días no laborables, con RLS y feriados AR/BR 2026-2027. → `R6-DB-01`
- [x] **CONF-DOM-01** — Estado derivado del plazo y conexión de `business-days.ts`, que era código muerto. → `R6-DB-01`
- [x] **CONF-QA-01** — pgTAP de las decisiones estructurales y del aislamiento por instalador y por empresa. → `R6-QA-01`, `R6-QA-03`

## Fase 1 — Reprogramación notificada

- [x] **CONF-SRV-01** — Reprogramación atómica: fecha, fila de reprogramación, notificación y `notified_at` en una sola transacción. → `R6-SRV-01`
- [x] **CONF-NOT-01** — Tipo de notificación `order_rescheduled` en el locale del destinatario. → `R6-NOT-01`
- [ ] **CONF-NOT-02** — Sumar los tipos nuevos al Web Push. Queda fuera de la fase 1 a propósito: la bandeja in-app es la fuente de verdad y el push es mejora progresiva; se hace junto con los recordatorios de la fase 5.
- [x] **CONF-QA-02** — Probar que sin notificación persistida no hay plazo, y que reprogramar dos veces supersede la pregunta anterior. → `R6-QA-01`

## Fase 2 — Respuesta del instalador

- [x] **CONF-UI-01** — Pantalla de respuesta con el texto del requisito y los dos botones. → `R6-UI-01`
- [x] **CONF-UI-02** — Mostrar el choque con otras órdenes ya aceptadas antes de confirmar. → `R6-UI-01`
- [x] **CONF-SRV-02** — Registrar la respuesta validando en el servidor quién responde, que el aviso exista, que no esté superada y que no esté ya contestada. **El plazo NO se valida a propósito:** el requisito penaliza la falta de respuesta, no la demora, así que una respuesta tardía se acepta y se registra con su hora; si llegó en término se deriva después. Además evita escribir la regla de días hábiles una segunda vez en SQL.

## Fase 3 — Baja pedida por el instalador

- [x] **CONF-SRV-03** — Solicitar la baja con motivo, cálculo de `within_notice` y autoaprobación dentro del plazo. → `R6-SRV-02`
- [x] **CONF-UI-03** — Revisión del gerente con minimización de datos sensibles. → `R6-UI-02`
- [x] **CONF-QA-03** — Probar el plazo, la autoaprobación en término, la revisión humana fuera de término y la autoridad del gerente. → `R6-QA-01`
- [x] **CONF-QA-06** — Paridad entre `business_days_between` (SQL, autoridad) y `businessDaysUntil` (TS, vista previa). Son dos implementaciones a propósito: si el cliente calculara `within_notice` podría saltearse la revisión. El test las compara sobre los mismos feriados.
- [x] **CONF-REV-01** — Reversa auditable de un evento de confiabilidad ya emitido. Se mueve a la fase 4: todavía no hay eventos que revertir. → `R6-QA-01`

## Fase 4 — Confiabilidad en modo sombra

- [x] **CONF-REL-01** — Eventos de confiabilidad y proyección determinista. → `R6-REL-01`
- [x] **CONF-UI-04** — Pantalla de transparencia del instalador: evento, regla, impacto y cómo recuperar. → `R6-UI-03`
- [x] **CONF-QA-04** — Probar que recalcular con los mismos eventos da el mismo resultado, y que ni la baja en plazo, ni la justificada, ni darse de baja por una reprogramación restan.

## Fase 5 — Avisos y compuerta

- [x] **CONF-JOB-01** — Recordatorios y vencimientos idempotentes, con `run_reliability_jobs()` como única entrada. **Falta el agendado**: instalar `pg_cron` y programar el job es un cambio de infraestructura en producción y necesita autorización aparte. Las funciones sirven igual y se prueban sin scheduler. → `R6-JOB-01`
- [x] **CONF-QA-05** — Probar scheduler repetido y fallido sin duplicados. → `R6-QA-02`
- [ ] **CONF-GATE-01** — Efecto sobre prioridad de ofertas. **Bloqueada hasta aprobación explícita de Nicolás.** → `R6-GATE`

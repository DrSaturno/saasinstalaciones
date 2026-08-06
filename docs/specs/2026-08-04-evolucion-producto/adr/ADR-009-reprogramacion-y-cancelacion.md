# ADR-009 — Días hábiles, reprogramación, cancelación y apelación

- Estado: Aceptado
- Fecha: 2026-08-05
- Decisiones relacionadas: DEC-07, DEC-08

## Decisión

Una baja común no penalizable debe solicitarse al menos dos días hábiles antes del inicio vigente. Una reprogramación genera una revisión de agenda y su plazo de dos días hábiles comienza cuando la notificación in-app queda persistida; dentro del plazo el instalador puede aceptar o retirarse sin impacto. Calendario, zona horaria y feriados usados quedan versionados junto al deadline.

Motivos y evidencia sensible tienen acceso mínimo y retención definida. Fuera de plazo se crea un caso para revisión humana; nunca se penaliza automáticamente por texto o clima. Toda decisión admite reversa y apelación auditada. El score se calcula primero en modo sombra.

## Consecuencias y verificación

Scheduler, recordatorios y vencimientos son idempotentes y usan outbox/dead-letter. Se prueban feriados, DST, falta de entrega, silencio, revisión, reversa y privacidad cross-company.

# ADR-004 — Horarios, disponibilidad, privacidad y traslado

- Estado: Aceptado
- Fecha: 2026-08-05
- Decisiones relacionadas: DEC-09, DEC-13

## Decisión

Los compromisos usan inicio y fin con zona horaria IANA; una fecha legacy sin hora conserva precisión `unknown`. La disponibilidad personal es global a la persona, pero otras empresas sólo reciben códigos opacos de disponible/conflicto y nunca detalles del compromiso ajeno.

Todas las vías de asignación y reprogramación pasan por un único RPC transaccional que bloquea por instalador y ventana. Solapamiento o ausencia son bloqueo duro. El traslado se estima con coordenadas, duración y buffer; si es insuficiente sólo un manager puede aplicar override con motivo auditado. La agenda propia puede mostrar el detalle autorizado; la ajena no filtra empresa, cliente ni dirección.

## Consecuencias y verificación

Google Calendar es una salida opt-in, no fuente de verdad. Se prueban concurrencia, DST, datos imprecisos, conflicto cross-company sin fuga y todas las rutas de asignación.

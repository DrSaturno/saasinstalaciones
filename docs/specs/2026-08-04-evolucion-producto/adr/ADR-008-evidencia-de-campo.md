# ADR-008 — Eventos, checklist, incidentes y evidencia mínima

- Estado: Aceptado
- Fecha: 2026-08-05
- Decisión relacionada: DEC-10

## Decisión

El trabajo de campo se representa como eventos append-only: aceptación, en camino, llegada, avance, incidente/bloqueo, solicitud de finalización, aprobación, pedido de corrección y reapertura. Cada tipo de actividad tiene checklist y reglas de evidencia versionadas; el valor inicial para ejecución exige tres fotos, configurable por empresa/tipo sin debilitar registros ya enviados.

La finalización del instalador es una solicitud. La aprobación corresponde a otro actor autorizado; reapertura y corrección requieren motivo. La validación vive en dominio, RPC y constraints para que ninguna vía —incluida offline— la omita.

## Consecuencias y verificación

La timeline muestra timestamp de cliente y servidor, actor y evidencia. Los adjuntos se validan por MIME, tamaño, hash y tenant antes de considerarse evidencia.

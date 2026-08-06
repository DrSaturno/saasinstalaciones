# ADR-007 — Contrato de comandos y seguridad offline

- Estado: Aceptado
- Fecha: 2026-08-05

## Decisión

Online y offline envían el mismo command envelope: `operation_id`, actor/sesión, agregado, acción, versión esperada, timestamp cliente, payload versionado y dependencias. El servidor autentica, autoriza, valida transición/evidencia y aplica evento + proyección + outbox en una transacción; un receipt único por `operation_id` hace seguro el replay.

Dexie conserva sólo snapshots mínimos autorizados y una outbox por usuario. No se cachean navegaciones/RSC autenticadas. Logout, cambio de cuenta, revocación o sesión inválida purgan datos locales. Los conflictos terminales quedan bloqueados para revisión; no se reintentan en bucle. Los logs nunca incluyen tokens, archivos ni contenido sensible.

## Consecuencias y verificación

Los comandos tienen esquema y versión explícitos. Se prueban reinicio, modo avión, replay, fuera de orden, token vencido, conflicto, cambio de cuenta y recuperación sin escritura directa desde el cliente.

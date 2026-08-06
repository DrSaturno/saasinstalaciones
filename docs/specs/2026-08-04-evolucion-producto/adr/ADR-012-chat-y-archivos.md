# ADR-012 — Chat, búsqueda y política de archivos

- Estado: Aceptado
- Fecha: 2026-08-05
- Decisión relacionada: DEC-11

## Decisión

Cada OT tiene un hilo principal tenant-safe. Mensajes y adjuntos son entidades normalizadas con autor, timestamps, tipo, caption/tags, hash y relación exacta a la OT. La búsqueda MVP es server-side y paginada sobre texto, nombre, caption, tags, autor, fecha y tipo; las imágenes usan metadatos humanos. OCR o IA queda fuera hasta un experimento de precisión, costo y privacidad.

Storage valida tenant, participación/autorización, MIME y tamaño; el acceso usa URLs firmadas breves. La galería conserva orden cronológico. Edición/eliminación se expresa con estado y auditoría, sin romper evidencia. El comportamiento offline respeta dependencias: primero mensaje/metadata, luego archivo resumible, y nunca publica una referencia inexistente.

## Consecuencias y verificación

Un hilo no mezcla OTs. Se prueban más de 300 mensajes, archivos inválidos, URLs vencidas, actores P1/no P2 y empresas A/B.

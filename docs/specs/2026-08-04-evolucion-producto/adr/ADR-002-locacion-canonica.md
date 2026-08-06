# ADR-002 — Identidad y edición de locaciones canónicas

- Estado: Aceptado
- Fecha: 2026-08-05
- Decisión relacionada: DEC-13

## Decisión

Una locación pertenece a una empresa y un cliente, existe independientemente de los proyectos y se reutiliza mediante asociaciones. La identidad automática confiable es `empresa + cliente + referencia externa normalizada`; dirección y nombre no se usan solos para fusionar. Registros sin esa clave se crean separados o quedan en revisión, nunca se unen por heurística silenciosa.

Manager mantiene identidad, requisitos, permisos y adjuntos permanentes. Un coordinador puede asociar una locación a sus proyectos y proponer cambios auditados, pero no alterar datos compartidos directamente. La OT conserva snapshots de requisitos relevantes para explicar qué información regía al planificarla. Merge y split son operaciones explícitas y auditadas.

## Consecuencias y verificación

El backfill es reanudable, reporta seguros/ambiguos/no vinculados y no inventa horarios ni datos. Archivar o borrar un proyecto no elimina la locación. Importación y exportación comparten un contrato de round-trip estable.

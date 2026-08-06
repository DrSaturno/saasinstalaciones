# ADR-003 — OT, actividades y relevamiento

- Estado: Aceptado
- Fecha: 2026-08-05
- Decisiones relacionadas: DEC-03, DEC-10, DEC-13

## Decisión

La Orden de Trabajo es el contenedor operativo; relevamiento y ejecución son actividades distintas, cada una con lifecycle, asignaciones, checklist, evidencia y decisiones de revisión propias. Una OT puede contener sólo relevamiento, sólo ejecución o ambos, y la ejecución puede declarar como prerrequisito un relevamiento aprobado.

Los formularios de relevamiento se guardan como submissions versionadas. Enviar congela una versión para revisión; aprobar o pedir cambios genera un evento y nunca sobrescribe la historia. El autor/ejecutor no puede aprobar su propia submission. Los estados legacy se mantienen como proyección temporal y sus fechas sin hora quedan con precisión `unknown`.

## Consecuencias y verificación

La máquina de estados se prueba en dominio y base. Toda acción usa comandos server-side idempotentes y la migración preserva evidencia existente sin fabricar aprobaciones.

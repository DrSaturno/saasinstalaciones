# ADR-001 — Membresía multirol y segregación de funciones

- Estado: Aceptado
- Fecha: 2026-08-05
- Decisiones relacionadas: DEC-03, DEC-04

## Decisión

La pertenencia de una persona a una empresa es única y sus capacidades se representan con roles N:N. `company_membership_roles` es la fuente de verdad; el rol escalar anterior queda sólo como proyección de compatibilidad durante el cutover. Una persona puede ser instalador y coordinador simultáneamente y puede tener capacidades diferentes por empresa.

La autorización se calcula en servidor y RLS por empresa, proyecto, asignación y acción. El rol no concede por sí solo acceso financiero. El actor que ejecuta una actividad no puede aprobar su propia entrega, aunque también sea coordinador. Agregar o quitar una capacidad es idempotente, auditado y se bloquea si deja asignaciones o proyectos activos sin responsable.

## Consecuencias y verificación

La navegación presenta contextos operativos sin duplicar cuentas. El cutover exige backfill 100 %, pruebas manager/coordinador/instalador/dual/multiempresa y cero consultas nuevas basadas únicamente en el rol escalar.

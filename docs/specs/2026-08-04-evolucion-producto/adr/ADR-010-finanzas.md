# ADR-010 — Semántica financiera, devengamiento y pagos

- Estado: Aceptado
- Fecha: 2026-08-05
- Decisiones relacionadas: DEC-04, DEC-05, DEC-06

## Decisión

Ingreso de empresa, honorario/costo de instalador, gasto, presupuesto, devengamiento y pago son conceptos distintos. Cada movimiento usa monto entero en unidad menor, moneda ISO, origen, fecha efectiva y evento append-only; no se suman monedas ni se convierten automáticamente.

El honorario se devenga al aprobar la ejecución. Se admiten pagos parciales, ajustes, disputas y reversas; impuestos y retenciones son líneas explícitas, no un motor fiscal. El instalador ve sólo sus movimientos de trabajos propios a través de todas sus empresas. Manager ve finanzas de su empresa. Coordinador no accede por defecto.

## Consecuencias y verificación

Los saldos se reconstruyen desde eventos y concilian con OT/proyecto. Un estado operativo `finalizada` nunca significa `pagada`; los montos legacy ambiguos se marcan y no se reinterpretan automáticamente.

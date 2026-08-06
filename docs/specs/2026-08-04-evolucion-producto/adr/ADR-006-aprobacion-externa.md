# ADR-006 — Evidencia de aprobación externa del cliente

- Estado: Aceptado
- Fecha: 2026-08-05
- Decisiones relacionadas: DEC-02, DEC-12

## Decisión

El cliente final no tiene cuenta, rutas ni acceso a archivos. Un manager o coordinador expresamente autorizado registra la aprobación obtenida fuera de la app contra una revisión exacta de cotización. El registro incluye fecha efectiva, actor, medio, nota y adjunto opcional; es append-only y una corrección se expresa con reversa/sustitución auditada.

La aprobación no equivale a conversión: el RPC vuelve a validar coordinador, agenda y demás invariantes. Un coordinador no puede registrar aprobación si además es el cotizante/ejecutor beneficiado sin una segunda autoridad manager.

## Consecuencias y verificación

No se crean usuarios de cliente ni enlaces públicos. RLS y Storage limitan evidencia a la empresa y al personal autorizado.

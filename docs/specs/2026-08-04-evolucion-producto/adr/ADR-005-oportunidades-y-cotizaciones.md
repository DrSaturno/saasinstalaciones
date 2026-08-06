# ADR-005 — Bolsa, oportunidades y cotizaciones

- Estado: Aceptado
- Fecha: 2026-08-05
- Decisión relacionada: DEC-01

## Decisión

La bolsa actual continúa siendo un mecanismo de staffing para proyectos existentes. Se incorpora `opportunity` como etapa comercial previa e independiente: publicación, cotizaciones privadas y versionadas, selección, aprobación externa y conversión.

Una cotización sólo es visible para su instalador y para managers autorizados de la empresa publicadora. Revisar crea una nueva versión; no se edita historia. La conversión es un RPC idempotente y atómico: exige cliente, cotización/revisión aprobada, coordinador asignado y agenda válida; crea proyecto, asociación de locación, OT/actividades, asignación y snapshot financiero, o no crea nada.

## Consecuencias y verificación

Publicar o recibir una cotización nunca crea un proyecto. La oportunidad conserva toda la trazabilidad y no habilita acceso al cliente final.

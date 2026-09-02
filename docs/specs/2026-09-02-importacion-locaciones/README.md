# Importación y exportación de locaciones

Implementa **REQ-08** de la [evolución de producto](../2026-08-04-evolucion-producto/README.md): cargar muchas locaciones desde un archivo de forma rápida, clara y segura, con controles que detecten diferencias, errores y duplicados.

- [Requisitos](requirements.md)
- [Diseño](design.md)
- [Tareas](tasks.md)

## Estado al abrir esta spec (auditado el 02-09-2026)

**A diferencia de los dos puntos anteriores, acá el motor está entero, conectado y probado.** No hay tablas muertas ni capa de aplicación faltante: importar, exportar, el control de cantidades, los duplicados y el reporte descargable funcionan y tienen 34 tests unitarios más 2 E2E.

Lo verificado en código, no en los casilleros del backlog:

| Pieza | Dónde |
|---|---|
| Análisis sin escritura, con conteos | `lib/domain/site-import.ts` |
| Exportación con contrato de round-trip | `lib/domain/site-export.ts` |
| Plantilla base | `/api/site-template` |
| Exportación XLSX | `/api/projects/[id]/sites/export` |
| Reporte de errores por fila | `/api/projects/[id]/imports/[importId]/report` |
| Preflight de dos pasos | `components/company/import-sites-dialog.tsx` |

Queda poco, y de tres tamaños muy distintos. Ver [tareas](tasks.md).

## Frontera

Los formatos libres —PDF, Word, Excel de estructura arbitraria— **no entran acá**. `REQ-08.7` pide que sean un flujo asistido separado, con preview obligatorio y sin escritura automática, y el backlog los tiene como `R2-IMP-05`, un spike aparte. Meterlos en el importador determinista sería mezclar dos cosas con garantías distintas.

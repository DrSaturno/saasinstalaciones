# Tareas

Trazan al bloque **R2-IMP** del backlog. `R2-IMP-01..04` ya están cerrados ahí; lo de abajo es lo que la auditoría del 02-09-2026 encontró pendiente.

## Ajuste de UX (chico, y es lo único del pedido de hoy que falta)

- [ ] **IMP-UI-01** — Sacar "Descargar planilla base" al mismo nivel que Importar y Exportar, y renombrarla. Hoy vive adentro del diálogo de importar: para descubrirla hay que abrir la importación primero, que es el orden inverso al que pide el requisito (descargar → completar → importar). → `REQ-08.1`
- [ ] **IMP-UI-02** — Selección de qué locaciones exportar. Hoy exporta todas las activas del proyecto. → `REQ-08.6`

## Alias de columna (dos líneas)

- [ ] **IMP-DOM-01** — Agregar `punto de venta` y `ubicación` a `COLUMN_ALIASES` en `lib/domain/site-import.ts`. Son dos de los cinco ejemplos que el pedido nombra y hoy no se reconocen. Ojo con la normalización: los alias actuales están sin acento y en una sola palabra, así que hay que ver cómo se normaliza el encabezado antes de agregar uno con espacio.

## Formatos libres (frente propio)

- [ ] **IMP-SPIKE-01** — Spike de lectura de Excel arbitrario, PDF y Word. **No incorporar al importador determinista.** `REQ-08.7` pide flujo asistido separado, preview obligatorio y cero escritura automática. Es `R2-IMP-05` en el backlog y necesita su propia especificación. → `R2-IMP-05`
- [ ] **IMP-SPIKE-02** — Recopilar los formatos que los clientes vienen mandando, para sacar patrones reales en vez de suponerlos. El pedido lo menciona explícitamente y es lo que haría útil al spike anterior.

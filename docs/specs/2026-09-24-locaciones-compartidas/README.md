# Locaciones reutilizables entre clientes

Bloque 3 de [`../2026-09-24-hoja-de-ruta-v2/`](../2026-09-24-hoja-de-ruta-v2/README.md).
Estado (24-09-2026): **implementado y verificado en Demo; producción sin tocar.** Ver [tasks.md](tasks.md).

## Contexto

Pedido de un cliente: en una misma locación pueden hacerse trabajos para clientes distintos (el
ejemplo es un shopping). Las locaciones cargadas en la base tienen que poder reutilizarse en otro
cliente, sin importar de cuál fueran.

Decisión 8 de la hoja de ruta, aceptada con su default: **la identidad de la locación (dirección,
nombre, datos físicos, ubicación) se comparte entre clientes; los documentos y requisitos quedan
por cliente**, porque pueden ser confidenciales entre ellos.

## Auditoría: por qué hoy no se puede

Verificado contra Demo el 24-09-2026:

- `locations.client_id` es `NOT NULL`: cada locación pertenece a **un** cliente.
- Cuatro tablas hijas (`project_locations`, `location_attachments`, `location_requirements`,
  `location_change_events`) tienen una clave foránea compuesta `(location_id, company_id, client_id)`
  contra `locations`. Una locación de otro cliente no se puede vincular a un proyecto por
  construcción.
- Cuatro funciones de la base **exigen** que el cliente de la locación sea el del proyecto:
  `validate_site_canonical_location`, `validate_project_canonical_client_change`,
  `validate_location_canonical_links` y `validate_location_backfill_issue_scope`.
- `external_ref` (el código del local) vive en la locación y se **copia a los `sites`** por trigger.
  Pero el código es del **cliente** (el «SUC-001» de YPF no es el de otro cliente): compartir la
  locación sin moverlo haría que un cliente viera el código del otro.
- Las políticas de lectura de documentos y requisitos dejan leer **todo** lo de una locación a quien
  pueda leerla: con una locación compartida, el coordinador de un proyecto vería los documentos de
  otro cliente.

## Los tres documentos

- [requirements.md](requirements.md)
- [design.md](design.md)
- [tasks.md](tasks.md)

## Frontera: qué NO toca

- **No fusiona locaciones duplicadas que ya existen.** Si el shopping ya está cargado dos veces (una
  por cliente), siguen siendo dos; a partir de ahora se puede elegir la existente en vez de crear
  una tercera. Unificarlas es otro trabajo (y tiene riesgo: mezcla historiales).
- **No cambia cómo se ve el flujo de un solo cliente**: para quien nunca comparte, todo queda igual.
- **No comparte nada entre empresas.** Una locación es de una empresa; el aislamiento entre empresas
  no cambia.
- **No aplica nada a producción** sin autorización explícita; primero Demo.

# Diseño

## LOCSHARE-DEC-01 — Tabla de vínculo `client_locations`

Se agrega `client_locations (location_id, company_id, client_id, external_ref,
normalized_external_ref, created_at, created_by)`:

- Clave primaria `(location_id, client_id)`; única también `(location_id, company_id, client_id)`
  (la que van a referenciar las tablas hijas).
- Claves foráneas `(location_id, company_id) → locations` y `(client_id, company_id) → clients`: una
  locación sólo se vincula a clientes **de su misma empresa**.
- Índice único `(company_id, client_id, normalized_external_ref)` donde el código no es nulo: la regla
  «único por cliente» pasa a vivir acá.
- `locations.client_id` **se conserva** como **cliente de origen** (quien la creó). No se quita: lo
  leen ~10 archivos y la auditoría de cambios. Deja de significar «único dueño».

**Por qué una tabla y no un arreglo de clientes en `locations`:** el código del local es por cliente
(LOCSHARE-R3) y las claves foráneas necesitan una fila a la que apuntar.

**Alternativa descartada — copiar la locación por cliente:** es lo que se puede hacer hoy y es
justamente lo que el pedido quiere evitar: dos fichas que se desactualizan entre sí.

## LOCSHARE-DEC-02 — Las hijas apuntan al vínculo, no a la locación

`project_locations`, `location_attachments`, `location_requirements` y `location_change_events`
cambian su clave foránea compuesta de `locations(id, company_id, client_id)` a
`client_locations(location_id, company_id, client_id)`. Así «este proyecto/documento/requisito es
del cliente X» sigue garantizado por la base, ahora contra el vínculo.

Los datos ya cumplen la nueva clave: el vínculo de origen se crea para **toda** locación antes de
cambiarla (LOCSHARE-DEC-06). `location_change_events` apunta al vínculo de **origen**, que nunca se
borra (no hay política de borrado y la propia clave lo impediría).

## LOCSHARE-DEC-03 — El código llega a los `sites` por el vínculo

`sync_site_identity_from_location` deja de copiar `locations.external_ref` y toma el código del
vínculo del cliente del **proyecto** del `site`. `propagate_location_identity_to_sites` deja de tocar
`external_ref` (es la identidad compartida la que se propaga, no el código). Un trigger nuevo sobre
`client_locations` propaga un cambio de código a los `sites` de los proyectos de ese cliente.

`locations.external_ref` queda como el código del cliente de origen (compatibilidad); la fuente de
verdad pasa a ser `client_locations`.

## LOCSHARE-DEC-04 — Validaciones por vínculo

- `validate_site_canonical_location`: la locación debe estar **vinculada al cliente del proyecto**
  (no ser de él).
- `validate_project_canonical_client_change`: cambiar el cliente del proyecto exige que todas sus
  locaciones estén vinculadas al cliente nuevo.
- `validate_location_canonical_links`: al cambiar la empresa de una locación se sigue protegiendo el
  tenant; ya no se compara el cliente (es sólo el origen).
- `validate_location_backfill_issue_scope`: la resolución puede apuntar a una locación vinculada al
  cliente de la revisión.

## LOCSHARE-DEC-05 — Lectura de documentos y requisitos por cliente

Nueva `can_read_location_client(location_id, client_id)`: el gerente de la empresa; quien opera un
proyecto **de ese cliente** que use la locación; o el instalador con una orden en un `site` de un
proyecto **de ese cliente**. Las políticas `location_attachments_actor_read` y
`location_requirements_actor_read` pasan a usarla con la `client_id` de cada fila. La lectura de la
ficha (`locations`, `can_read_location`) no cambia: la identidad es compartida.

Es la única forma de cumplir LOCSHARE-R4.2 en la base y no sólo en la pantalla.

## LOCSHARE-DEC-06 — Migración en un paso, aditiva, con verificación

La migración es aditiva salvo el cambio de las claves foráneas. Orden: crear el vínculo → **rellenar
uno por locación** → verificar conteos (si no coinciden, aborta) → recién ahí cambiar las claves y las
funciones. No se borra ni se renombra ninguna columna; el código anterior sigue funcionando porque
`locations.client_id` y `locations.external_ref` siguen ahí. Riesgo residual: durante la ventana entre
migrar y desplegar, el código viejo que inserte una locación sin crear su vínculo fallaría al
vincularla a un proyecto; para eso un trigger crea el **vínculo de origen automáticamente** al
insertar una locación (compatibilidad que se puede retirar después).

## LOCSHARE-DEC-07 — Código: vincular al usar

`attachCanonicalLocations` (el punto por el que pasan alta, importación y reutilización) asegura el
vínculo entre la locación y el cliente del proyecto antes de asociarla, y deja de exigir que la
locación sea del cliente. La reutilización lista también las locaciones de otros clientes. Los
documentos se suben con el cliente del **proyecto desde el que se sube**, no con el de origen.

## Riesgos

- **Claves foráneas sobre tablas con datos reales** en producción: se cambian con la tabla de
  vínculo ya poblada y verificada, con backup confirmado (ver `docs/PENDIENTES_NICOLAS.md`).
- **Divergencia mal informada:** el informe compara el código del `site` con el de la locación; con
  códigos por cliente daría falsos positivos. Se ajusta para comparar contra el vínculo.
- **Locaciones duplicadas ya existentes** no se fusionan (fuera de alcance).

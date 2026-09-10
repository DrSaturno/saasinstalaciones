# Tareas

## Fase 0 — Idempotencia del lote

- [x] **LOTE-DB-01** — Migración: `work_orders.batch_id uuid` nullable + índice
  único parcial `(batch_id, site_id)` donde `batch_id is not null`.
  → LOTE-R3.2, LOTE-R3.3, DEC-LOTE-02
- [x] **LOTE-DB-02** — Regenerar tipos y correr `narrow-database-types.mjs`.
- [ ] **LOTE-DB-03** — Test pgTAP: insertar dos veces el mismo
  `(batch_id, site_id)` falla; con `batch_id` nulo se puede repetir sitio.
  → AC-LOTE-B

## Fase 1 — El alcance deja de derivarse

- [x] **LOTE-ACT-01** — `createOrdersForProject` acepta `siteIds` y `batchId`.
  Sin `siteIds` conserva el comportamiento actual —las que faltan—, así el
  alta normal no cambia. → LOTE-R2.3, DEC-LOTE-01
- [x] **LOTE-ACT-02** — Con `siteIds`, se validan contra el proyecto antes de
  crear: una locación de otro proyecto o de otra empresa no entra por venir en
  el cuerpo del pedido. → LOTE-R2.2
- [x] **LOTE-ACT-03** — El resultado informa cuántas se crearon, cuántas se
  saltearon por lote repetido, y cuántas cayeron sobre locaciones que ya
  tenían orden. → LOTE-R3.1
- [x] **LOTE-ACT-04** — Tests del dominio: alcance explícito, alcance derivado,
  reenvío del mismo lote, ids ajenos al proyecto.

## Fase 2 — Elegir las locaciones

- [x] **LOTE-UI-01** — Lista de locaciones con casilleros dentro del diálogo de
  generar órdenes, con buscador. → LOTE-R1.1, LOTE-R1.4
- [x] **LOTE-UI-02** — Control «Todas» que tilda y destilda el conjunto
  visible. → LOTE-R1.2
- [x] **LOTE-UI-03** — Cada fila indica si la locación **ya tiene una orden
  viva**. → LOTE-R1.3
- [x] **LOTE-UI-04** — Paso de confirmación con el total y el desglose de
  cuántas caen sobre locaciones ya trabajadas. → LOTE-R3.1, DEC-LOTE-03
- [x] **LOTE-UI-05** — El `batchId` se genera en el cliente al abrir la
  confirmación y viaja con el envío. → DEC-LOTE-02

## Fase 3 — Cierre

- [x] **LOTE-QA-01** — `type-check`, `lint`, `test`.
- [ ] **LOTE-QA-02** — Verificar en navegador contra producción: generar sobre
  un subconjunto, generar sobre todas, y confirmar dos veces el mismo lote.

## Fuera de alcance, a propósito

- **Agrupar las órdenes por lote en la interfaz.** El `batch_id` se guarda para
  detectar reintentos, no para ofrecer una vista de lotes. Si más adelante hace
  falta "ver las 200 órdenes de aquella vez", el dato ya está.
- **Cancelar un lote entero.** Mismo razonamiento: el dato lo permitiría, pero
  cancelar en masa es una decisión con su propio peso y merece su propia spec.
- **Cambiar la numeración de órdenes.** Cada orden sigue tomando su número por
  el mecanismo actual.

## Gaps reales, documentados y no cerrados

- **Nada impide generar dos lotes distintos sobre las mismas locaciones.** El
  índice protege contra el reenvío del *mismo* lote, no contra que alguien
  decida generar dos veces a propósito con dos lotes. Eso es una decisión del
  usuario, no un error, y el desglose de `DEC-LOTE-03` es lo que la hace
  visible.

## Verificación

- `type-check`, `lint`, **510 tests** y `build` en verde. Los 6 tests nuevos
  cubren la regla de alcance, incluido el caso que antes era imposible.
- Migración aplicada a **Demo** y a **Producción**, verificada por consulta
  directa: 30 órdenes intactas, columna nullable, índice parcial correcto.
- Tipos regenerados desde Demo. El diff fueron 3 líneas —`batch_id` en Row,
  Insert y Update—, sin deriva de esquema.
- **Sin verificar en navegador todavía.**

### Un falso negativo que conviene recordar

Antes de regenerar los tipos, `type-check` pasaba **con `batch_id` inexistente
en `work_orders`**. TypeScript no lo detecta porque la fila se construye dentro
de un `.map()`: ahí infiere el tipo del callback y después compara de forma
estructural, que admite propiedades de más. El verde no probaba nada. Al tocar
columnas nuevas, regenerar los tipos ANTES de confiar en el type-check.

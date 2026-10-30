# Requisitos

## PRIV-R1 — El instalador no puede leer importes comerciales

- **PRIV-R1.1** — Un usuario que sólo es instalador no puede leer, por ningún
  camino (pantalla, API REST, PDF, exportación, Realtime), lo que la empresa
  cobra por una orden ni el monto de contrato de un proyecto.
- **PRIV-R1.2** — Sigue viendo su propia paga: `installer_amount`, su estado de
  pago y sus ganancias (`installer_earnings`), sin cambios.
- **PRIV-R1.4** — Tampoco puede leerlos un **coordinador** (decisión de Nicolás,
  24-09-2026): el coordinador es un instalador con más funciones, no una figura
  comercial. Sólo el gerente y quienes éste habilite (bloque 4) los ven.
- **PRIV-R1.3** — La prohibición se sostiene en la **base de datos**, no en que
  ningún código pida la columna. Un `select *` nuevo no puede exponerlo.

## PRIV-R2 — El instalador no puede escribir importes ni estado de pago

- **PRIV-R2.1** — Un instalador no puede modificar `amount`, `installer_amount`
  ni `payment_status` (ni sus columnas de trazabilidad) de ninguna orden, ni la
  propia.
- **PRIV-R2.2** — Un instalador sólo puede modificar las columnas que su flujo de
  campo necesita (lista blanca, `PRIV-DEC-03`). Reasignarse la orden, cambiar
  `company_id`, `project_id` o `site_id` queda prohibido.
- **PRIV-R2.3** — El cambio de `payment_status` sigue pasando **sólo** por
  `set_order_payment_status` (RPC del lado de la empresa).

## PRIV-R3 — El PDF de la orden respeta el rol

- **PRIV-R3.1** — El PDF que baja un instalador **no** contiene el precio al
  cliente y **sí** muestra su paga (`installer_amount`) si está cargada.
- **PRIV-R3.2** — El PDF que baja la empresa conserva el importe comercial como
  hoy.

## PRIV-R4 — La empresa sigue operando igual

- **PRIV-R4.1** — Gerente (y quien tenga permiso comercial) ve y edita importes
  como hoy: alta y edición de orden, alta en lote, finanzas, tablero, proyecto.
- **PRIV-R4.2** — Ningún dato existente se pierde en la migración.

## Criterios de aceptación

- **AC-PRIV-A** — Con la sesión de un instalador, `select amount` sobre
  `work_orders` y `select contract_amount` sobre `projects` (o sobre lo que los
  reemplace) **no devuelven ningún importe**. Cubierto por pgTAP.
- **AC-PRIV-A2** — Con la sesión de un coordinador (que no es gerente), las
  tablas de precios no devuelven ninguna fila; sus demás permisos sobre órdenes
  siguen funcionando. Cubierto por pgTAP. → PRIV-R1.4
- **AC-PRIV-B** — Con la sesión de un instalador, `update work_orders set
  installer_amount = …` y `set payment_status = …` **fallan o no modifican
  nada**, y una prueba pgTAP lo verifica. Es la misma prueba manual que se corrió
  el 24-09-2026, ahora automatizada y esperando el resultado contrario.
- **AC-PRIV-C** — El PDF descargado con sesión de instalador no contiene el
  precio al cliente (prueba de la ruta, con importes distintos para cliente e
  instalador para poder distinguirlos).
- **AC-PRIV-D** — Todo el flujo de la empresa (crear orden con importe, editarla,
  finanzas, dashboard) funciona igual que antes. Los E2E existentes siguen en
  verde.
- **AC-PRIV-E** — Los datos de producción tras la migración coinciden con los de
  antes: mismos importes, mismas órdenes (conteo y suma antes/después).

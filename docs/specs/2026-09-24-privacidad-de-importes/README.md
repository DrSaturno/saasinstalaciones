# Privacidad de importes: el instalador no ve lo que la empresa le cobra al cliente

Bloque 8 de [`../2026-09-24-hoja-de-ruta-v2/`](../2026-09-24-hoja-de-ruta-v2/README.md).
**Prioridad 1 del paquete.** Estado (24-09-2026): **implementado y verificado en
Demo; producción sin tocar.** Detalle y pendientes en [tasks.md](tasks.md).

## Contexto

Pedido: en su tablero personal, el instalador sólo debe saber **cuánto va a
ganar él**, no cuánto cobra la empresa al cliente.

La intención ya estaba en el diseño (`installer_earnings` expone
`installer_amount` «NUNCA `work_orders.amount`»), pero la protección es una
**convención de código**, no una garantía, y la auditoría del 24-09-2026 la
encontró rota por tres lados.

## Auditoría: qué es verdad hoy

Verificado contra **Demo** (`krxewmfauohixmmzsvkp`). Producción comparte las
mismas migraciones y **no se consultó**: hay que repetir las comprobaciones allí
antes y después del arreglo, con autorización.

1. **Fuga en la aplicación.** El botón «Descargar PDF» existe en la pantalla de
   tarea del instalador y en la de coordinación
   (`app/(installer)/tasks/[id]/page.tsx`, `app/(installer)/coordination/[id]/page.tsx`).
   `app/api/orders/[id]/pdf/route.tsx` selecciona `work_orders.amount` y
   `lib/pdf/order-document.tsx` lo imprime. El instalador descarga el precio al
   cliente.
2. **Fuga en la base.** `work_orders_installer_read` autoriza la **fila entera**.
   El rol `authenticated` (el mismo para gerentes e instaladores) tiene
   `SELECT` de columna sobre `work_orders.amount` y `projects.contract_amount`
   (y hay una policy que deja al instalador asignado leer el proyecto:
   `projects_installer_assigned_read`). Un instalador con su propia sesión puede
   pedirlos por la API REST sin pasar por ninguna pantalla.
3. **Integridad de pagos (hallazgo más grave que la fuga).** El mismo rol tiene
   `UPDATE` de columna sobre `amount`, `installer_amount` y `payment_status`, y
   `work_orders_installer_progress` autoriza el `UPDATE` de la fila entera del
   instalador asignado. Ningún trigger de `work_orders` protege esas columnas
   (`validate_order_transition` sólo controla `status`). **Prueba ejecutada en
   Demo** con la sesión de un instalador, dentro de una transacción abortada a
   propósito (no quedó ningún cambio): `UPDATE … SET installer_amount = 999999,
   payment_status = 'paid'` afectó **10 de 10** de sus órdenes sin error. Un
   instalador puede fijarse su propia paga y marcarse como pagado.

Lo que **no** es una fuga, para no corregir de más: `broadcasts.pay_amount` es lo
que la empresa **ofrece** al instalador y `broadcast_applications.quoted_amount`
es lo que el instalador **propone**; ambos son del lado del instalador por
diseño.

## Los tres documentos

- [requirements.md](requirements.md)
- [design.md](design.md)
- [tasks.md](tasks.md)

## Frontera: qué NO toca

- **No cambia lo que el instalador ve de su propia ganancia**
  (`installer_earnings`, `installer_amount`): sigue igual.
- **No implementa subcuentas ni permisos por persona** (bloque 4). Sólo deja un
  punto único de decisión (`auth_can_see_commercials`) para que el bloque 4 lo
  extienda sin otra migración.
- **No toca `broadcasts.pay_amount` ni `quoted_amount`.**
- **No aplica nada a producción** sin autorización explícita; primero Demo.

# Finanzas GF — primera integración en Se Instala

> Documento histórico de la primera propuesta. La implementación vigente y las decisiones que la reemplazan están en [Finanzas v2](../2026-10-27-finance-v2/README.md).

## Alcance de esta rama

`feature/finanzas-gf` vive en un worktree separado. El código no se desplegó ni se aplicó ninguna migración a una base compartida. El módulo nuevo abre desde `/finance/operations` y desde la ficha de una OT. Usa la identidad y las órdenes existentes de Se Instala; cada tabla financiera lleva `company_id` y RLS.

Esta entrega cubre el circuito operativo nuevo: proveedor o cliente → movimiento por cuota/concepto → factura → aprobación → comprobante de transferencia o acreditación → pago/cobro registrado. Una orden de pago del cliente se archiva como documento, pero **no registra un cobro**. Los movimientos saldados se pueden consultar como caja con dirección, fecha, contraparte y OT. La factura de un proveedor mensual puede cargarse sin OT; los gastos fijos se clasifican por separado de los variables.

## Flujo acordado a validar con GF

1. Operaciones crea y finaliza la OT en Se Instala. La agenda y los estados operativos existentes siguen siendo la fuente de ese hecho.
2. Finanzas registra un movimiento por persona y cuota. Para Interior puede haber anticipo, saldo o total. Un anticipo exige fecha manual.
3. Al terminar la OT, un costo sin fecha de AMBA va al **lunes siguiente** y uno de Interior al **martes siguiente**. Si se termina ese mismo lunes o martes, pasa a la semana posterior. Estos días pueden configurarse por empresa y afectan previsiones nuevas. Las fechas ya fijadas no se mueven automáticamente.
4. Finanzas adjunta la factura para aprobar. Adjunta el comprobante de transferencia para registrar un pago. Para registrar un cobro, adjunta una acreditación bancaria real. Al cerrar indica la fecha real de la operación. La vista de caja incluye sólo movimientos saldados.
5. Los importes importados se mantendrán `source=imported`, `status=review` y fuera de la previsión hasta conciliarlos. La migración actual **no importa datos de Excel**.

## Correspondencia con las planillas

| Fuente | Datos reconocidos | Destino previsto |
| --- | --- | --- |
| Agenda de instalaciones 2026 | Hojas mensuales, OT, detalle, equipo y señales operativas por color | OTs y agenda actuales; requiere mapear colores a estados explícitos |
| Números AMBA / Interior | Mismo formato: OT, fecha, cliente, importe y varios conceptos de costo | Un único mapeo para ambas zonas; una OT puede producir varios movimientos por proveedor/concepto |
| Gestión 2026 actualizada | Maestro de clientes y proveedores, pagos de instaladores, gastos generales, facturación, caja, costos por OT | `clients`, `finance_suppliers`, `finance_entries`, documentos y vista de caja |

GF confirmó que Números Interior usa la misma planilla que AMBA. El formato se modela una sola vez y se distingue por zona. Las planillas adjuntas son referencias para entender el circuito: el desarrollo y la demostración usan datos ficticios. No se importaron datos personales, importes ni documentos reales al repositorio. El prototipo local de Python sirvió como referencia de flujo, no como base ni API compartida.

La primera demo tabular se abre desde `/finance` o directamente en `/finance/operations?demo=1` con una cuenta gerente habilitada para Finanzas. Reúne OTs ficticias de AMBA e Interior, anticipo y saldo, coordinación, costo fijo, proveedor mensual, cobro, comprobantes de ejemplo y un costo histórico pendiente de conciliación. Es de solo lectura: filtrar y exportar CSV funciona, pero no crea registros ni intenta descargar archivos. También permite revisar la previsión antes de aplicar la migración en una base de ensayo.

Tras la primera revisión de Nico, `/finance-demo` pasó a ser una **propuesta de rediseño** centrada en la OT, con Inicio, Órdenes, detalle de OT y costo, Pagos, Gastos fijos, Cobros y Caja. Permite añadir gastos ficticios, adjuntar archivos de prueba y simular pagos y cobros parciales. Estas simulaciones actualizan el saldo de cada obligación, la previsión semanal, las bandejas de Pagos y Cobros, la cuenta del proveedor y Caja; se guardan únicamente en ese navegador (`localStorage` e IndexedDB). Los gastos y facturas creados en la demo y las tarjetas de tareas del Inicio todavía no se recalculan desde esos borradores. Para revisar sin credenciales ni conexión a Supabase se usa `next dev --webpack`. La ruta y su excepción en el proxy sólo existen durante `NODE_ENV=development`; en producción devuelve 404. Las decisiones pendientes están en [REDISENO_EN_VALIDACION.md](REDISENO_EN_VALIDACION.md).

## Decisiones de diseño

- `finance_entries` separa cuentas por pagar de cuentas por cobrar y permite varios movimientos por OT. Conserva la moneda; nunca suma ARS y BRL.
- Un proveedor instalador o coordinador se puede vincular a una cuenta activa del equipo de la empresa. La clave foránea impide vincular cuentas de otra empresa.
- `finance_documents` guarda metadatos de archivos en un bucket privado. La descarga comprueba sesión y empresa, y emite un enlace de corta duración.
- Factura y comprobante son requisitos en la base, no sólo validaciones de pantalla. Los estados cerrados no se reabren. `finance_entry_events` registra las transiciones.
- El calendario de pagos se guarda por empresa. Los movimientos sin fecha quedan señalados aparte.
- Las vistas operativas actuales de `/finance` y `work_orders.payment_status` todavía son **legado**. No se reescriben a partir de este libro financiero hasta definir una conciliación que distinga instalador principal, otros instaladores, coordinadores y anticipos. En esta rama no deben usarse ambas marcas como un saldo consolidado.

## Verificación y puertas para una prueba compartida

- TypeScript y ESLint se ejecutan en el worktree.
- `lib/domain/finance-forecast.test.ts` cubre el calendario y la demo; en este entorno Vitest no pudo iniciar por el enlace de `node_modules` del worktree, aunque la compilación y el lint pasaron. La suite debe ejecutarse en un checkout con dependencias instaladas localmente.
- `supabase/tests/finance_operations.test.sql` cubre estructura, RLS multiempresa, fechas de AMBA/Interior y el requisito de factura antes de aprobar. Requiere una base local Supabase para ejecutarse; no se ejecutó contra producción.
- Antes de probar con GF: aplicar la migración en una base de ensayo, regenerar `types/database.ts` con `pnpm db:types`, ejecutar pgTAP y validar con Finanzas un cierre semanal simulado. La importación histórica no es necesaria para validar el módulo.
- Antes de integrar a producción: unificar el estado de pago legado con el nuevo libro, definir permisos de subcuentas tras combinar las ramas, probar descarga de adjuntos entre empresas, importar con identificadores estables, acordar feriados y cambios de fecha, y revisar retención/copias de seguridad.
- ARCA, bancos, importación continua y generación automática mensual de gastos fijos quedan fuera de esta primera integración. No hay credenciales ni llamadas a esos servicios.

## Preguntas de validación con Finanzas

1. ¿AMBA siempre se paga el lunes siguiente e Interior el martes siguiente, o existen excepciones por proveedor, feriados y aprobación?
2. ¿Qué evento exacto habilita la previsión: finalización operativa, conformidad del cliente o una marca manual de Finanzas?
3. ¿Puede un pago parcial liquidar una misma factura, o se desglosa en anticipos/saldos con comprobantes separados?
4. ¿Quién aprueba pagos y qué diferencia debe haber entre aprobación y ejecución bancaria?
5. ¿Qué colores de la agenda deberían convertirse en estados explícitos si se reemplaza la planilla?

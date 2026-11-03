# Rediseño de Finanzas — borrador para validar con Nico y GF

## Problema observado en la primera demo

La pantalla `/finance-demo` es una consulta de movimientos. No permite empezar desde una OT, ver su detalle financiero, adjuntar facturas y comprobantes a cada obligación, ni cargar y administrar gastos fijos. Por eso no representa el trabajo diario de Operaciones y Finanzas. No se usará como diseño final.

## Circuito que surge de la conversación y las planillas

1. **Operaciones crea la OT** en la agenda existente, con cliente, zona, tarea, coordinador, instaladores, importe a cobrar y costos acordados. AMBA e Interior usan el mismo esquema de datos; la zona cambia el calendario y algunas modalidades de pago.
2. **La OT es el centro del trabajo.** Desde su ficha se consulta el avance operativo y el financiero. Cada instalador, coordinador o proveedor vinculado tiene su propio concepto e importe. En Interior se contemplan anticipo, saldo o total; el anticipo puede preceder al cierre.
3. **Al confirmar la finalización**, los importes pendientes pasan a una bandeja de Finanzas con fecha prevista según zona y regla de la empresa. Deben conservar el enlace a la OT, proveedor y persona que confirmó el trabajo. Se necesita saber cuánto pagar el lunes y el martes sin esperar el cobro del cliente.
4. **Finanzas revisa y paga.** Debe ver el importe, a quién corresponde, por qué OT y cuándo vence; adjunta la factura recibida, solicita/aprueba el pago según roles, registra la transferencia y adjunta el comprobante. El pago aparece en la OT, la cuenta del proveedor y la caja. Un documento cargado no debe fabricar por sí solo una transferencia que no ocurrió.
5. **Facturación y cobranza del cliente** parten de la OT, pero se controlan separadas de los pagos a proveedores. Administración registra la factura emitida, fecha de vencimiento, cobros parciales o totales, medio (transferencia, cheque, efectivo, etc.), acreditación y saldo. La conexión para emitir en ARCA queda expresamente para la segunda etapa.
6. **Gastos sin OT** tienen su propia entrada: alquiler, servicios, sueldos, moto, viáticos y otros gastos diarios. Se necesitan categorías fijas y variables, recurrencia o carga puntual, vencimiento, factura, comprobante y estado de pago. Se consultan por mes y proveedor.
7. **Consultas** enlazan OT, proveedor, cliente, factura, pago, caja, costos fijos, costos variables y margen. Deben diferenciar importes previstos, aprobados y efectivamente pagados/cobrados. Los registros históricos de las planillas son referencia y no deuda automáticamente exigible.

## Navegación propuesta

| Entrada | Trabajo principal | Navegación siguiente |
| --- | --- | --- |
| Resumen de Finanzas | Vencimientos de lunes/martes, facturas faltantes, pagos por aprobar, cobros vencidos, costos fijos del mes, caja | Abrir cada lista o una OT |
| Órdenes | Buscar OT por número, cliente, zona, estado y fecha; ver cuánto cobrar, costo previsto y pagos pendientes | Ficha de OT existente, con sección/pestaña Finanzas |
| Ficha de OT → Finanzas | Costos por participante, anticipos/saldos, documentos, facturación al cliente, cronología de pagos/cobros, margen | Abrir movimiento y proveedor |
| Pagos | Bandeja semanal agrupada por fecha y proveedor, con su OT y documentación faltante | Aprobar, registrar pago y adjuntar comprobante |
| Gastos fijos y generales | Alta de concepto o proveedor, recurrencia mensual, vencimiento, factura y pago del período | Historial mensual y detalle del gasto |
| Proveedores | Ficha individual, trabajos, facturas, pagos, saldo y documentos | OT o pago de origen |
| Clientes y cobros | Facturas emitidas, vencimientos, cobros y saldo por cliente | OT o factura de origen |
| Caja e informes | Ingresos y egresos reales, previstos aparte; filtros y exportación | Registro de origen |

## Bocetos de las pantallas centrales

```text
FINANZAS / INICIO
┌──────────────────────────────────────────────────────────────────────────┐
│ Trabajo de hoy: 4 facturas faltantes · 3 pagos por aprobar · 2 cobros   │
├───────────────────────────────┬──────────────────────────────────────────┤
│ LUNES · AMBA                 │ MARTES · INTERIOR                       │
│ Previsto / con factura / pago│ Previsto / con factura / pago            │
│ Abrir lote de pagos           │ Abrir lote de pagos                      │
├───────────────────────────────┴──────────────────────────────────────────┤
│ Gastos fijos del mes · Cobros por vencer · Caja real · OTs con faltantes│
└──────────────────────────────────────────────────────────────────────────┘

ÓRDENES → OT 13061 / FINANZAS
┌──────────────────────────────────────────────────────────────────────────┐
│ Cliente · lugar · zona · fecha · estado operativo · importe al cliente  │
│ [Operación] [Finanzas] [Documentos e historial]                        │
├──────────────────────────────────────────────────────────────────────────┤
│ A COBRAR DEL CLIENTE          │ COSTO PREVISTO / MARGEN ESTIMADO        │
│ Factura · vencimiento · cobros│ Separar estimación de efectivo          │
├──────────────────────────────────────────────────────────────────────────┤
│ Persona / concepto   │ Cuota │ Importe │ Fecha │ Factura │ Pago │ Acción │
│ Instalador 1         │ total │ ...     │ lunes │ sí      │ no   │ Ver    │
│ Coordinador          │ total │ ...     │ lunes │ falta   │ no   │ Ver    │
│ [Agregar costo / anticipo / saldo]                                      │
├──────────────────────────────────────────────────────────────────────────┤
│ Detalle del costo elegido: factura → aprobación → transferencia →      │
│ comprobante → fecha real. Historial de quién hizo cada paso.          │
└──────────────────────────────────────────────────────────────────────────┘

GASTOS FIJOS Y GENERALES
┌──────────────────────────────────────────────────────────────────────────┐
│ [Cargar gasto de este mes] [Crear concepto mensual]  Mes: septiembre  │
├──────────────────────────────────────────────────────────────────────────┤
│ Alquiler oficina  │ vence 10/09 │ factura sí │ pagado   │ Abrir       │
│ Servicio internet │ vence 15/09 │ falta      │ pendiente│ Abrir       │
├──────────────────────────────────────────────────────────────────────────┤
│ Formulario: proveedor, concepto, categoría, importe, moneda,           │
│ periodicidad, día de vencimiento, comienzo, fin opcional, responsable.  │
│ En cada mes: factura, ajuste real, aprobación, pago y comprobante.      │
└──────────────────────────────────────────────────────────────────────────┘
```

El lenguaje de la interfaz debe hablar de **OT, factura, pago, cobro y vencimiento**. El color sólo refuerza el estado escrito; ninguna acción depende de recordar un color de Excel. El calendario de lunes y martes es la pieza visual principal porque responde a la pregunta diaria de Finanzas: cuánto dinero se necesita y qué impide pagar.

## Decisiones confirmadas el 25/09/2026

- La OT aparece en la previsión de pagos cuando el trabajo está finalizado, entregado y aprobado, independientemente del cobro al cliente. AMBA cobra habitualmente lunes e Interior martes; cada empresa puede configurar sus días.
- Operaciones carga importe al cliente y costos de cada participante; administración gestiona facturación, cobranzas, facturas recibidas y pagos.
- Después de aprobar una OT, sólo administración cambia importes. Todo cambio debe conservar la versión anterior y quién lo hizo.
- Un proveedor puede presentar una factura para varias OT. La factura se carga una vez y se distribuye entre las obligaciones correspondientes.
- El objeto comercial principal para GF es la OT. El proyecto existente en Se Instala sirve de contenedor cuando el sistema lo requiere, incluso si contiene una única OT.
- La conexión de emisión con ARCA se realizará en una segunda etapa. En la primera se registra la factura emitida y sus adjuntos, sin comunicar con ARCA.
- En la primera etapa, Administración registra el número y PDF de la factura emitida fuera de Se Instala.
- La separación técnica de permisos entre Operaciones y Administración queda marcada con un asterisco: Cloud trabaja en cuentas y roles; al terminar se conecta este módulo a esa solución. Esta rama sólo habilita `company_manager` y no debe extender por sí sola los permisos de Finanzas a otras cuentas.

## Decisiones pendientes de la persona usuaria

- Ubicación exacta de Finanzas en la ficha de OT y alcance de facturación al cliente allí.
- Método de alta de costos fijos: plantilla recurrente, carga manual o ambos; quién confirma cada ocurrencia mensual.
- Orden y permisos de revisión, aprobación y transferencia; qué evidencia cierra un pago.
- Contrato de permisos que entregue Cloud para distinguir las tareas de Operaciones y Administración; bloquea la integración de roles, no el trabajo local del modelo y las pantallas.
- Tratamiento de ajustes, descuentos y cancelaciones después de un pago parcial; ya está confirmado que sólo Administración cambia importes aprobados.
- Si una factura emitida al cliente también puede agrupar varias OT y cómo se distribuye una transferencia que cancela varias facturas.
- Qué debe ver el instalador en su cuenta: trabajos, importes pendientes, factura solicitada, pagos y comprobantes.
- Prioridades de la siguiente entrega local: prototipo validable, base persistente de ensayo y recorrido completo de documentos.

## Cambios técnicos que requiere el circuito

El código actual tiene una única tabla de movimientos y una pantalla general. Un movimiento guarda una sola fecha de cierre y los archivos se vinculan sólo a ese movimiento. Para que el rediseño sea operativo hay que incorporar, según las respuestas de GF:

- fichas de OT con costos por participante y trazabilidad al equipo asignado, evitando volver a escribir el número de OT en otro formulario;
- definición de gastos recurrentes y sus ocurrencias mensuales, además de gastos puntuales sin OT;
- entidades de factura y pago/cobro que soporten parciales y, si corresponde, una factura que abarque varios trabajos;
- bandejas de trabajo con responsable, próximo paso y fechas previstas frente a fechas reales;
- estado de pago visible de vuelta en la OT y en la cuenta del proveedor;
- tablero y reportes calculados desde un mismo libro, para evitar que la vista financiera anterior y la nueva muestren saldos contradictorios.

La demo actual seguirá accesible sólo como referencia de lo que faltaba. La navegación y el modelo financiero nuevos se validarán con un recorrido completo de OT, gastos fijos y pago antes de tocar producción.

## Criterios para aceptar el rediseño

1. Desde el listado de OTs se entra a una OT ficticia y se recorren todos sus participantes, importes, facturas, pagos y cobros.
2. Se puede crear un gasto fijo, ver su ocurrencia mensual y registrar factura y pago sin vincularlo a una OT.
3. La previsión semanal sale de obligaciones por OT y de gastos generales, separa zonas y distingue pagos realizados de pendientes.
4. Una factura y un comprobante se pueden encontrar desde la OT, el proveedor y el movimiento de caja correspondiente.
5. La interfaz revela qué acción sigue y quién debe realizarla; no obliga a deducir estados por colores ni a pasar datos entre pantallas a mano.

Este documento es un borrador de producto, no una confirmación de reglas de negocio ni una autorización de despliegue.

## Prototipo local para recorrer con GF

`http://127.0.0.1:3000/finance-demo` ahora abre la propuesta de navegación: Inicio → Órdenes → OT → costo/documentos, junto con Pagos, Gastos fijos, Cobros y Caja. Sólo usa nombres e importes inventados. En Gastos fijos se pueden agregar conceptos puntuales o mensuales; se conservan en `localStorage` del navegador. En el detalle de un costo se pueden adjuntar y descargar archivos de prueba; se guardan en IndexedDB de ese navegador, no en Supabase. Un costo aprobado admite pagos parciales simulados y una cuenta por cobrar admite cobros parciales simulados, cada uno con su comprobante de prueba. El saldo, los pagos previstos, las bandejas, el proveedor y Caja reflejan esas simulaciones. El prototipo no ejecuta aprobaciones ni transferencias reales, no genera ocurrencias mensuales y no incluye los gastos y facturas creados localmente en los indicadores; las tarjetas de tareas del Inicio siguen siendo ejemplos fijos. Su objetivo es validar el recorrido y los campos antes de implementar el modelo compartido.

## Estado técnico de esta rama

También se implementó el módulo persistente bajo `/finance`, separado de la demo. Incluye listado y ficha financiera de OT, obligaciones por proveedor, factura emitida o recibida con PDF externo e imputación a varias OT, cobros y pagos parciales, gastos puntuales y plantillas mensuales, calendario configurable, previsión, caja real y PDF de una OT. Las migraciones crean tablas privadas por empresa y pruebas pgTAP. Nada de esto se aplicó a la base compartida; la rama no tiene conexión Supabase de pruebas y `/finance` aún no puede validarse de punta a punta. El demo de localhost sigue siendo el recorrido visible.

**Integraciones pendientes:** conectar los permisos de Operaciones/Administración que entrega Cloud; regenerar los tipos de base contra un entorno de pruebas; ejecutar migraciones y pgTAP allí; ensayar el circuito completo con cuentas de prueba; implementar ajustes auditados de importes aprobados, especialmente cuando ya hubo pagos parciales. Hasta que exista ese ajuste, la base impide anular una obligación con movimientos reales. La emisión automática en ARCA sigue reservada para una segunda etapa.

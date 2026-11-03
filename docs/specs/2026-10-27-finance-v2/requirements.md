# Se Instala · Módulo de Finanzas

**Estado:** aprobada para implementación por el usuario el 27-10-2026.  
**Fecha:** 27 de octubre de 2026.  
**Fuente:** relevamiento y decisiones confirmadas por el usuario en esta conversación, consolidadas en este documento.  
**Alcance de este documento:** describir el comportamiento deseado y cómo comprobarlo; implementación autorizada; las migraciones y el despliegue de producción requieren una instancia posterior.

## 1. Objetivo

Integrar Finanzas dentro de Se Instala para que cada empresa gestione sus pagos, cobros, gastos, cheques, documentos y consultas utilizando las OTs, proyectos, clientes, locaciones y participantes existentes de la aplicación.

Las OTs se crean y se administran operativamente en Se Instala. Finanzas recibe la información que le corresponde y mantiene su propia historia de obligaciones, movimientos y documentos vinculados a esas OTs. La pantalla de Finanzas no crea OTs.

## 2. Actores y acceso

| Actor | Alcance de producto acordado |
| --- | --- |
| Gerente | Acceso completo y gestión de empleados y permisos de su empresa. |
| Finanzas | Acceso a Operaciones y al módulo de Finanzas, incluidos sueldos, documentos y aprobación de pagos. |
| Administrativo | Acceso operativo sin el módulo de Finanzas. Puede crear OTs y cargar o ver su precio al cliente, costos por instalador/coordinador y otros gastos operativos. Puede invitar instaladores y coordinadores. |
| Instalador y coordinador | No ingresan al módulo de Finanzas. Conservan los accesos operativos que les correspondan y la visibilidad de su propia paga según las reglas existentes. |

- **ACC-01** — El gerente invita a cada empleado por correo; cada persona crea su propia contraseña.
- **ACC-02** — Finanzas sólo aparece y está disponible para gerente y perfil Finanzas. El control debe alcanzar navegación, rutas, consultas, acciones, documentos y exportaciones, además de la pantalla.
- **ACC-03** — Separar el permiso de ver/cargar importes de la OT en Operaciones del permiso de acceder al libro financiero. La documentación previa de subcuentas asociaba ambos permisos y debe revisarse.
- **ACC-04** — Cada empresa sólo accede a su información y archivos; se validan aislamientos y permisos de forma efectiva en servidor y base de datos.

El diseño interno de roles se determinará al contrastar `main` con el trabajo local existente; los nombres de perfil de la interfaz no obligan a crear roles técnicos nuevos.

## 3. Navegación

- **NAV-01 — Resumen:** previsión de lunes/martes, alertas, PDF y movimientos financieros.
- **NAV-02 — Pagos:** gastos fijos y generales; costos variables asociados a OT; facturas, pagos y comprobantes.
- **NAV-03 — Cobros:** facturas emitidas, cobros, cheques, vencimientos y saldo del cliente.
- **NAV-03A — Cheques:** sección ubicada entre Cobros y Consultas, con listas de cheques emitidos y recibidos.
- **NAV-04 — Órdenes y consultas:** buscar OTs, proyectos, locaciones, clientes/empresas, instaladores, coordinadores y proveedores; abrir su historial y documentos autorizados.
- **NAV-05** — Retirar «Fuentes y circuito» del menú. El acceso de «Nueva OT» no pertenece al Resumen financiero.

## 4. Datos de la OT y actualización de importes

- **OT-01** — Cargar desde Se Instala la OT, cliente, proyecto, locación, zona, estado operativo, importes al cliente, participantes, costos y gastos operativos como peajes.
- **OT-02** — Si Operaciones modifica un importe de la OT, Finanzas actualiza su importe vinculado automáticamente, incluso después de la aprobación, conservando fecha, responsable y valor anterior.
- **OT-03** — El pendiente se calcula respecto del importe actualizado y de los pagos o cobros confirmados. Por ejemplo, si el costo pasa de $100.000 a $120.000 y ya se pagaron $30.000, quedan $90.000 pendientes.
- **OT-04** — Si el importe actualizado queda por debajo de lo ya pagado, mostrar la diferencia como **saldo a favor**; no generar automáticamente una devolución.
- **OT-05** — Si se reemplaza un instalador que ya recibió un pago, conservar ese pago en la historia de la persona original y registrar separadamente la obligación de la persona nueva.
- **OT-06** — Una factura ya registrada conserva sus datos y documento original. Si un cambio de OT genera una diferencia, Finanzas recibe una alerta para revisarla y registrar la documentación que corresponda.
- **OT-07** — Las mismas obligaciones y movimientos deben poder consultarse desde la OT, el participante y las vistas financieras sin crearse duplicados.

## 5. Resumen y movimientos

- **RES-01** — Mantener el importe previsto para el próximo lunes de AMBA y el próximo martes de Interior, con acceso al detalle. Esas cifras incluyen pagos de instaladores y coordinadores por OTs; los gastos generales no se suman por vencer esos días.
- **RES-02** — Conservar el área de atención, con faltantes de documentación, aprobaciones y cobranzas que correspondan, y la descarga PDF.
- **RES-03** — Listar en una misma vista movimientos previstos, realizados y cheques pendientes, identificados por su estado y sentido. Un mismo importe no puede contarse dos veces en los totales.
- **RES-04** — Permitir filtros por día, semana, quincena, mes, trimestre, semestre, año y rango de fechas. Se especificará qué fecha se aplica a cada clase de movimiento y los límites de los períodos.
- **RES-05** — Mantener la regla inicial documentada para las OTs: una obligación normal entra en previsión cuando la OT está terminada, entregada y aprobada; los anticipos pueden preceder al cierre. Los días por zona y sus excepciones se revisarán con GF.

## 6. Pagos y gastos

- **PAG-01** — Mostrar listas diferenciadas de gastos fijos/generales y costos por OT. En costos por OT, identificar participante, concepto, importe, vencimiento, saldo y documentos.
- **PAG-02** — Mantener un catálogo de gastos fijos con concepto, contraparte, importe y fecha de pago, editable para meses futuros. Los sueldos deben tener detalle por persona.
- **PAG-03** — Al cambiar una plantilla, actualizar meses futuros y el mes actual si no registra ningún pago. Si el mes actual tiene un pago parcial o total, conservarlo sin actualización automática.
- **PAG-04** — Registrar facturas y comprobantes junto con los pagos, y conservar historial accesible desde la OT y la contraparte. Las exigencias documentales se definirán por tipo de gasto: un sueldo u otro concepto puede necesitar documentación distinta de una factura de proveedor.
- **PAG-05** — Tratar por separado la **parte** de la obligación —total, parcial, anticipo o saldo— y el **medio** utilizado —transferencia, efectivo u otro admitido—.
- **PAG-06** — A instaladores y coordinadores se les paga únicamente por transferencia o efectivo; no se les registra un pago por cheque.
- **PAG-07** — Permitir que una factura de proveedor se distribuya entre varias OTs y que una transferencia se impute a varias facturas, dejando constancia de los importes asignados y evitando duplicaciones.

## 7. Cobros y facturación

- **COB-01** — Obtener la OT y su importe al cliente desde Se Instala; registrar factura emitida, documentos y uno o varios cobros, con su saldo.
- **COB-02** — Una factura al cliente puede abarcar varias OTs. Finanzas identifica las OTs y distribuye sus importes; la asignación debe conciliar con el total de la factura.
- **COB-03** — Un cobro o transferencia puede aplicarse a varias facturas, con distribución trazable. Se admiten anticipos, parciales, saldos y totales.
- **COB-04** — El comprobante de transferencia se vincula al cobro; registrar o recibir documentación no equivale automáticamente a que el dinero ya esté acreditado.
- **COB-05** — En la primera etapa se registran comprobantes emitidos externamente. La futura integración con ARCA es una etapa separada; las funciones de emisión/consulta y la conexión bancaria se decidirán por separado.

## 8. Cheques

- **CHQ-01** — Registrar cheques recibidos y emitidos para las contrapartes que admiten ese medio, con importe, referencia, fechas y relación con las obligaciones/documentos correspondientes.
- **CHQ-02** — Ofrecer plazos de 30, 60, 90 y 120 días corridos y permitir ingresar o corregir la fecha exacta de vencimiento. El cálculo desde la emisión fue indicado como probable y debe validarse con GF; no se presupone cómo ajustar feriados o días inhábiles.
- **CHQ-03** — Distinguir el cheque recibido del dinero efectivamente acreditado. Mientras no se acredita, indicar el importe cubierto por cheque pendiente sin considerarlo disponible en banco ni duplicar la deuda.
- **CHQ-04** — Un cheque emitido se considera pagado cuando se confirme el débito. Hasta entonces se identifica como cheque pendiente.
- **CHQ-05** — Registrar y consultar estados de cheques físicos y electrónicos, incluidos rechazo y endoso. Los flujos completos de reemplazo, endoso o integración bancaria quedan para definición posterior.
- **CHQ-06** — No permitir registrar cheques como medio de pago para instaladores ni coordinadores.
- **CHQ-07** — En el apartado Cheques, mostrar una lista de emitidos con la fecha en que se deben cubrir, que será su **fecha de vencimiento**, y el importe de cada uno; y otra de recibidos con la fecha para cobrarlos y su importe. En escritorio se presentan lado a lado y en pantallas pequeñas pueden apilarse.
- **CHQ-08** — Identificar el estado y la contraparte y permitir localizar el pago/cobro, las OTs y los documentos vinculados. El cheque es el mismo registro que aparece en Pagos o Cobros y no genera un movimiento ni un saldo duplicado.
- **CHQ-09** — Cuando un cheque recibido es un pago de un proyecto, vincularlo al cliente, al proyecto y a las OTs o facturas que corresponda. Si se registra desde una de esas fichas o desde un cobro, precargar el contexto; si se registra desde Cheques, permitir seleccionar los datos existentes. Si abarca varias OTs, el sistema sugiere una distribución teniendo en cuenta sus importes y Finanzas puede revisarla y modificarla antes de guardar.
- **CHQ-10** — Sugerir el reparto proporcional a los saldos pendientes disponibles de cada OT, descontando los cobros acreditados y evitando volver a asignar importes ya cubiertos por otros cheques pendientes. La distribución final debe sumar el importe a imputar, respetar centavos y señalar cualquier diferencia o exceso para revisión; el cheque sigue siendo un único registro.

## 9. Consultas e historial

- **CON-01** — Filtrar por entidad, OT, proyecto, locación, estado y fechas que correspondan. Mostrar detalle de movimientos, OT y documentos vinculados con permisos.
- **CON-02** — Para instaladores, coordinadores y proveedores, mostrar **pagado en el período** y **pendiente actual de pago**. Para clientes, mostrar **cobrado en el período** y **pendiente actual de cobro**.
- **CON-03** — Para OTs, proyectos y locaciones, mostrar ingresos y egresos por separado, distinguiendo sus pendientes. Si una contraparte opera en ambos sentidos, no mezclar cobros con pagos.
- **CON-04** — El filtro de fechas afecta los pagos y cobros realizados del período; el saldo pendiente muestra la situación actual completa. Ambos rótulos explican el alcance para evitar interpretaciones erróneas.
- **CON-05** — Sumar por moneda, sin mezclar monedas. La distribución entre múltiples OTs o facturas no debe multiplicar un mismo movimiento.

## 10. Criterios de aceptación propuestos

1. Una OT creada en Operaciones aparece en Finanzas con sus datos e importes autorizados, sin volver a cargar su número ni crear una segunda OT.
2. Al aumentar un costo con pago parcial, el pendiente refleja el nuevo importe menos lo pagado; al bajarlo por debajo de lo pagado, aparece saldo a favor y se conserva el historial.
3. Si el costo cambia después de registrar una factura, se conserva el documento original y se muestra una alerta por la diferencia.
4. Una plantilla de gasto actualiza el mes actual sin pagos y los futuros según la regla pactada; si el mes actual tiene un pago parcial, queda intacto.
5. Una factura distribuida entre varias OTs y una transferencia aplicada a varias facturas aparecen en sus respectivos historiales sin duplicar el dinero.
6. Un cheque recibido figura pendiente de acreditación hasta que se registra su acreditación; uno emitido se distingue hasta el débito. Se puede registrar un rechazo o endoso como estado/documentación.
7. Intentar pagar por cheque a un instalador o coordinador se rechaza también en la capa que registra la operación, no solamente en el formulario.
8. En Consultas, una persona muestra lo pagado/cobrado en el período elegido y su pendiente actual. Un filtro por OT, proyecto o locación conserva la trazabilidad de ambas direcciones.
9. Un administrativo puede operar OTs y sus precios, pero no abrir Finanzas ni acceder a sus consultas, archivos o exportaciones. Un usuario de Finanzas y el gerente acceden según sus funciones.
10. Las pruebas de permisos verifican que una empresa no puede acceder a la información financiera ni documentos de otra. Los ensayos y demostraciones usan datos ficticios.
11. La navegación coloca Cheques entre Cobros y Consultas; la sección muestra emitidos y recibidos, cada uno con su fecha para cubrir/cobrar, importe y vínculo a su registro de origen, sin duplicar movimientos.
12. Un cheque recibido como pago de un proyecto puede vincularse a su cliente y proyecto y, cuando corresponda, a las facturas y OTs. Se consulta en Cheques, Cobros y las fichas relacionadas como un único cheque; mientras no se acredita, su importe no se presenta como dinero disponible.
13. Ante un cheque de $500.000 para dos OTs con saldos disponibles de $600.000 y $400.000, el sistema sugiere $300.000 y $200.000 respectivamente. Finanzas puede ajustar la propuesta y la suma de las asignaciones debe coincidir con el importe imputado.

## 11. Decisiones operativas para esta implementación

- Los plazos se calculan desde la emisión en días corridos; el vencimiento siempre puede editarse. Cubrir y gestionar el cobro se muestran por vencimiento. La acreditación o débito tiene otra fecha efectiva.
- Semana de lunes a domingo, quincenas del 1 al 15 y del 16 al último día, rangos inclusivos. El diseño describe la fecha de cada tipo de movimiento.
- Las facturas de instaladores, coordinadores, logística y servicios se requieren para aprobar esos pagos. Los sueldos no requieren una factura de proveedor. Un comprobante bancario puede adjuntarse después de confirmar el movimiento y su falta se identifica como pendiente documental.
- Un mes con pagos, incluso futuros anticipados, o con cheques pendientes conserva su valor al editar la plantilla. La plantilla desactivada deja de generar meses; no anula compromisos existentes.
- Las marcas históricas de pago y gastos sin beneficiario deben conciliarse al preparar producción. No se convierten automáticamente en movimientos bancarios inventados.
- El módulo conserva las monedas ARS/BRL de la aplicación. Cuentas bancarias, cambio de monedas, ARCA y automatizaciones bancarias se revisarán en una etapa posterior.

## 12. Documentación y validación

La implementación está documentada en [design](design.md), [tasks](tasks.md), [procedencia de migraciones](migration-provenance.md) y [verification](verification.md). La autorización para desarrollar fue explícita; las migraciones y el despliegue de producción requieren su instancia correspondiente. Se preservaron las carpetas de trabajo anteriores.

## 13. Ajuste visual solicitado

- **UI-01** — Las secciones del módulo se presentan verticalmente a la izquierda. En móvil el menú se abre desde ese lado.
- **UI-02** — Mejorar la presentación y la lectura de Resumen y las listas financieras. La solución implementada usa filas compactas, jerarquía de importes y un panel para gestionar movimientos y documentos, conservando sus reglas de negocio. La aceptación visual corresponde a la revisión del usuario.

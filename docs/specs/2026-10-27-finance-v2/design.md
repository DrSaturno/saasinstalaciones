# Diseño

## Límites del módulo

La interfaz respeta el sistema visual de Se Instala. Las lecturas usan Server Components y clientes Supabase con sesión; las mutaciones validan datos y permisos en Server Actions. Los procedimientos financieros mantienen juntas las escrituras que forman una operación. No se incorpora un servicio externo de facturación ni una conexión bancaria.

La revisión visual usa una navegación vertical a la izquierda. Dentro de la aplicación, esa navegación reemplaza el menú del área mientras se recorre Finanzas y permite volver a Operaciones; no agrega una segunda barra lateral. La demo presenta el mismo menú. En pantallas chicas se abre como panel desde la izquierda.

Las listas de Pagos y Cobros muestran filas compactas con contraparte, concepto, OT, vencimiento, pendiente, estado y cantidad de documentos. “Gestionar” abre un panel lateral con detalle y registro; el acceso de documentos abre su pestaña directamente. Los formularios conservan las mismas acciones, permisos y reglas. Los pagos distribuidos y gastos adicionales se abren desde acciones de cabecera. Las tablas desplazan su contenido horizontalmente en móvil, sin ensanchar la página.

El tratamiento visual diferencia navegación, contenido y acciones: fondo claro, paneles blancos, azul de marca para la acción principal, importes con cifras tabulares y códigos de OT monoespaciados. Los campos quedan fuera de las filas para facilitar la lectura de varias obligaciones. Los paneles conservan navegación por teclado, cierre con Escape y devolución del foco al botón de origen.

Los perfiles Administrativo y Finanzas son subcuentas `company_manager` con `is_owner=false`. El gerente conserva `is_owner=true`. `can_manage_finance` habilita el libro financiero, sus documentos y exportaciones; no controla el precio operativo de una OT. Administración puede ver y cargar importes operativos e invitar instaladores y coordinadores. Sólo el gerente administra los permisos de sus empleados.

La navegación, las páginas, las acciones, las rutas de archivos y PDF y las políticas RLS controlan Finanzas. Se mantiene el comportamiento de MFA existente cuando hay un segundo factor enrolado. No se agrega una contraseña compartida del módulo.

## Obligaciones, caja e instrumentos

- `finance_entries` representa una obligación. Sus transacciones confirmadas determinan lo pagado o cobrado.
- `finance_payment_batches` agrupa una transferencia o un movimiento en efectivo distribuido entre obligaciones de una misma contraparte y moneda. Un UUID identifica el pedido y evita duplicarlo al reintentar.
- `finance_cheques` identifica un único instrumento. Sus imputaciones reservan saldo mientras está pendiente; no crean caja en la fecha de vencimiento.
- Confirmar la acreditación o el débito crea las transacciones correspondientes una sola vez. Rechazo, anulación y endoso registran el cambio y su motivo, sin inventar una entrada o salida de dinero.
- Anticipo, parcial, total y saldo describen la parte del pago o cobro; transferencia, efectivo y cheque describen el medio. Un anticipo se aplica a una obligación existente.

Los importes se almacenan como `numeric(14,2)`. La distribución sugerida opera en centavos con productos enteros y reparto del resto por un identificador estable. No mezcla monedas. La suma sugerida coincide con el importe o informa el exceso; el usuario puede editarla antes de guardar. La base vuelve a validar el saldo disponible al registrar el instrumento.

Las reservas y los movimientos adquieren un bloqueo transaccional por empresa. Los cambios operativos relacionados toman ese bloqueo antes de bloquear filas. Las restricciones, las claves compuestas por empresa y la RLS respaldan las validaciones de la interfaz. Las inserciones de caja y facturas se realizan mediante procedimientos atómicos, sin dejar cabeceras o imputaciones parciales.

## Fuente operativa y cambios de importe

Una OT con facturación por instalación genera la obligación del cliente desde su precio operativo. Un proyecto con facturación por contrato genera una sola obligación desde su importe contractual; no se suman nuevamente sus OTs como ingresos.

El responsable, los ayudantes y los costos adicionales conservan claves de origen diferentes. Los cambios de importe actualizan la obligación y registran valor anterior, nuevo y actor. Los pagos anteriores siguen vinculados a su contraparte. Si el importe nuevo es menor que lo ya pagado, se muestra saldo a favor, sin generar una devolución.

Una reasignación no cancela silenciosamente el saldo de la persona anterior: conserva su obligación y devuelve a revisión el saldo que estaba aprobado. Finanzas decide cómo reconciliar esa obligación. El nuevo participante tiene su propia obligación. Las marcas binarias de pago de las áreas operativas se proyectan desde la caja confirmada; no sustituyen el libro financiero.

El adaptador reconoce `work_order_pricing`, `project_pricing` y `work_order_team_members` cuando están presentes. Lee los precios privados sin abrirlos al personal de campo y sigue las actualizaciones de esas tablas. Si no existen, usa los campos de `main`. Se evita duplicar el costo del responsable con una segunda línea equivalente.

`order_financial_costs` permite cargar coordinación, ayudantes y reintegros identificando a la persona del equipo que los cobra. Es información operativa accesible a Administración; no expone caja, salarios o archivos de Finanzas. Los gastos históricos de proyecto que carecen de beneficiario y de estado de pago necesitan conciliación; su mera existencia no prueba una deuda ni un pago.

## Facturas, comprobantes y gastos periódicos

Las facturas conservan sus cabeceras y documentos. Sus imputaciones identifican las obligaciones incluidas y deben sumar el total. Se guarda el importe operativo que existía al registrarlas, para advertir diferencias posteriores.

Los archivos de hasta 10 MiB se cargan directamente en Storage privado mediante un permiso temporal limitado al objeto. Las Server Actions reciben metadatos, verifican el archivo almacenado y su pertenencia a la empresa y a la obligación. Esto evita enviar binarios grandes a través del límite del cuerpo de Server Actions.

Un comprobante de transferencia o cheque puede vincularse a todas sus imputaciones: varias relaciones documentales apuntan al mismo archivo almacenado. No se multiplican los movimientos de caja ni se sobrescriben comprobantes anteriores. La política de limpieza impide borrar objetos vinculados a documentos o facturas.

Las plantillas de gastos generan ocurrencias mensuales sin duplicarlas. Los cambios actualizan los meses futuros y el actual únicamente si no tienen pagos ni cheques pendientes. El día se ajusta al último día válido del mes. Desactivar una plantilla detiene nuevas generaciones; no anula obligaciones ya existentes. Los sueldos se registran por persona y no requieren una factura de proveedor para aprobarse.

## Consultas y fechas

Pagado o cobrado en el período se calcula con las transacciones confirmadas y su fecha efectiva. Pendiente actual incluye toda la deuda vigente de los elementos filtrados. Los cheques pendientes forman parte de ese pendiente: se muestran como cobertura, sin sumarlos otra vez. Se separan los sentidos y las monedas.

El Resumen fecha los realizados por su fecha efectiva, los previstos por vencimiento y los cheques pendientes por el vencimiento del instrumento. Los registros sin fecha siguen accesibles desde Pagos y Cobros. La quincena es del 1 al 15 o del 16 al último día; la semana empieza el lunes. Los rangos personalizados son inclusivos.

Los plazos de cheques se calculan desde la emisión en días corridos. La fecha puede editarse. No se presume un calendario legal de feriados ni una acreditación automática.

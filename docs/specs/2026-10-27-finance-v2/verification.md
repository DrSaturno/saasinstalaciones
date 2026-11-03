# Validación y preparación del entorno de pruebas

## Entrega local

Se trabajó en la copia `ModuloFinanzas/seinstala`, a partir de `DrSaturno/saasinstalaciones` en `65b584b`. Los cambios están sin commit. Las carpetas operativas anteriores siguen siendo referencias; no se modificaron ni se publicó esta integración.

La demo está en <http://127.0.0.1:3000/finance-preview>. Usa las pantallas de la integración con PostgreSQL PGlite en memoria y una empresa ficticia. No necesita cuenta y puede reiniciarse. Las cargas de archivos de esta demo conservan únicamente metadatos; sus vínculos abren documentos de ejemplo. El PDF de Resumen sí se calcula desde los datos ficticios actuales y el rango seleccionado, mediante la misma función que la ruta autenticada.

## Comprobaciones realizadas

| Comprobación | Resultado |
| --- | --- |
| `pnpm test --maxWorkers=2` | 638 pruebas aprobadas en 90 archivos después del rediseño; corrida de 62 segundos |
| `pnpm type-check` | Aprobado después del ajuste final |
| `pnpm lint` | Aprobado después del ajuste final |
| `pnpm exec next build --webpack` | Aprobado después del ajuste final: compilación, TypeScript, 52 rutas generadas y trazas |
| `git diff --check` | Sin errores de espacios después de corregir un salto de línea al final de la ficha de OT |
| Navegador local | Recorrido de Resumen, Cobros, Cheques y Consultas con datos ficticios |
| PDF local de Resumen | HTTP 200, `application/pdf`, encabezado `%PDF-`, 2.824 bytes para octubre de 2026 |
| Revisión visual | Barra lateral en escritorio, menú desde la izquierda en móvil y tablas con desplazamiento contenido |
| Panel de obligaciones | Documentos accesibles, pestañas con teclado, devolución del foco y registro de pago parcial ficticio |

Las pruebas SQL ejecutan las migraciones de Finanzas y subcuentas en una base PostgreSQL PGlite aislada. Hay una variante con precios privados y ayudantes. Las tablas centrales de la aplicación y las funciones de Auth/Storage se representan mediante contratos de prueba; no equivale a reproducir el esquema completo ni las sesiones reales de Supabase.

Se verifican, entre otros casos: aislamiento entre empresas y perfiles, empresa suspendida, imposibilidad de autoelevar privilegios, rechazo de cheques al personal de campo, reservas, saldo disponible, reintentos, acreditación única, cambios de precio después del pago, saldo a favor, importación repetida sin duplicaciones, contrato cobrado una sola vez, congelación de meses con pagos, factura histórica inmutable y un comprobante vinculado a varias obligaciones sin duplicar caja. También se comprueban la distribución proporcional exacta, límites de archivos y que el service worker no almacene rutas de Finanzas.

El archivo `supabase/tests/finance_operations.test.sql` contiene comprobaciones pgTAP de esquema, RLS y permisos. Está preparado para Supabase y **no se ejecutó** en esta entrega local.

### Recorrido interactivo comprobado

1. El cliente ficticio tiene dos OTs por $600.000 y $400.000.
2. Al registrar un cheque recibido por $500.000, la sugerencia asigna $300.000 y $200.000. El usuario puede modificar las imputaciones antes de guardar.
3. Mientras está pendiente, el instrumento reserva esos importes y no figura como caja confirmada.
4. Se aprobaron las obligaciones con su factura ficticia y se confirmó manualmente la acreditación.
5. Consultas mostró $500.000 cobrados en el período y $500.000 pendientes actuales, sin mantener la reserva ni contar dos veces el cheque.

El reinicio del servidor o la recarga de sus módulos puede restablecer estos registros ficticios. Las fechas de vencimiento y de confirmación bancaria son datos separados; no se confirmó ningún movimiento bancario real.

Durante la revisión visual se registró un pago ficticio en efectivo de $10.000 sobre una obligación de $120.000. El panel mostró $110.000 pendientes y $10.000 registrados; el Resumen actualizó el próximo lunes a $290.000. Las dos pruebas de `finance-operations-table.test.tsx` comprueban el acceso a los documentos, el teclado, el foco y el envío de la obligación y del importe disponible a la acción existente.

### Compilador y entorno

`pnpm build` usa Turbopack por defecto. En este equipo Windows falló al iniciar un proceso de PostCSS para un CSS preexistente de marketing. La compilación con Webpack pasó, incluyendo TypeScript y la generación de las rutas. No se cambió el compilador predeterminado del proyecto para ocultar ese fallo del entorno.

El equipo ejecuta Node 22.23.2; el proyecto declara 22.14.0. pnpm emitió esa advertencia. Antes de promover un despliegue se debe compilar con el entorno de versiones definido por el proyecto.

## Secuencia pendiente en Supabase de pruebas

Estos pasos requieren un entorno de staging autorizado. No autorizan migraciones ni despliegues en producción.

1. Confirmar la revisión operativa que se integrará y comparar el historial real de migraciones con [la procedencia documentada](migration-provenance.md). Si se incluyen las funciones de precios privados y ayudantes de la rama operativa, sus tablas deben existir **antes** de aplicar el adaptador de Finanzas. El adaptador instala sus triggers opcionales según las tablas presentes al ejecutarse; incorporar esas tablas después requiere una migración adicional del repositorio para instalar sus hooks.
2. Aplicar el historial completo en una base vacía de staging y probar también la actualización de una copia de ensayo con datos sintéticos. No sustituir el esquema operativo por las fixtures de PGlite. Resolver cualquier diferencia mediante migraciones versionadas.
3. Regenerar los tipos desde ese esquema completo con `pnpm db:types`, que también ejecuta el estrechamiento de alias. El generador local usado aquí añade el delta de Finanzas desde SQL aislado; no reemplaza esta comprobación del esquema completo.
4. Ejecutar las comprobaciones pgTAP y repetir tipos, lint, suite y compilación con las versiones del proyecto.
5. Validar con cuentas ficticias reales de gerente, Finanzas, Administrativo, instalador y coordinador. Revisar invitación, login, MFA cuando esté enrolado y revocación del permiso. Administración debe conservar los precios operativos y las invitaciones al equipo, sin ver Finanzas. Probar también rutas directas, RPC, PDF, documentos y peticiones sin sesión.
6. Verificar Storage privado de extremo a extremo: carga directa mediante URL firmada, metadatos y tamaño real, límites de 10 MiB, descarga con sesión, aislamiento de empresa, comprobante compartido y prohibición de borrar archivos vinculados. La demo no verifica este transporte de archivos.
7. Probar operaciones concurrentes desde conexiones PostgreSQL independientes: dos reservas sobre el mismo saldo, reserva contra transferencia y cambio de importe al confirmar un cheque. PGlite comprueba las reglas en una instancia local, pero no sustituye la prueba de contención entre conexiones.
8. Crear, modificar y reasignar OTs desde las pantallas operativas finales. Comprobar costos del responsable y ayudantes, contrato frente a cobro por OT, anticipos, gastos periódicos, sueldos, cambios de precio con pago parcial y comprobantes de varias OTs. Si se incorporan pantallas de otra rama, revisar que el permiso de precios operativos no vuelva a depender del permiso de Finanzas.
9. Validar el tamaño de los datos y los tiempos de respuesta esperados. La lectura actual pagina las consultas para no truncar el historial a 1.000 registros, pero carga el espacio financiero completo de la empresa. No se hizo una prueba de carga; empresas con gran volumen pueden requerir agregados y paginación en servidor.
10. Revisar visualmente escritorio y móvil y cerrar la aceptación funcional con el usuario antes de preparar producción.

## Datos históricos y límites de esta etapa

Las marcas antiguas de “pagado” no aportan por sí solas fecha, medio o comprobante. Se conserva su señal para conciliación; no se inventan transacciones. Los gastos históricos sin beneficiario identificado también requieren revisión.

La reasignación de una OT conserva la obligación y los pagos de la persona anterior. Un remanente aprobado vuelve a revisión. La conciliación de una obligación anterior parcialmente pagada requiere definir su ajuste explícito; esta entrega no incorpora una pantalla general de notas de crédito o reversión de caja.

ARCA, conciliación bancaria automática y el circuito completo de reemplazo/cobro de cheques endosados quedan fuera de esta etapa. Los cambios registrados aquí no mueven dinero entre cuentas bancarias.

# Tareas y trazabilidad

| Estado | Trabajo | Requisitos / comprobación |
| --- | --- | --- |
| Implementado | Navegación de cinco secciones y controles por perfil | NAV, ACC; `lib/navigation.test.ts`, acciones de subcuentas y RLS |
| Implementado | Revisión visual con menú vertical y gestión en panel lateral | Diseño del 27/10; `finance-operations-table.test.tsx`, comprobación de escritorio y móvil |
| Implementado | Obligaciones desde Operaciones y cambios posteriores a pagos | OT; `finance-database.test.ts`, `finance-advanced-database.test.ts` |
| Implementado | Compatibilidad con precios privados y varios instaladores | OT, ACC; esquema alternativo en `finance-advanced-base.sql` |
| Implementado | Saldos, crédito y reparto proporcional en centavos | OT-03/04, CHQ; `finance-ledger.test.ts` |
| Implementado | Cheques pendientes, reservas, estados e idempotencia | CHQ; procedimientos SQL y pruebas de base |
| Implementado | Efectivo/transferencia para personal de campo | PAG-06; rechazo en la base, además del formulario |
| Implementado | Gastos periódicos y sueldos por persona | PAG-02/03; congelación del mes con pago parcial y fechas mensuales |
| Implementado | Facturas, asignaciones y comprobante compartido | PAG-07, COB; pruebas de inmutabilidad, suma y archivo único |
| Implementado | Consultas con alcances diferentes para período y saldo | CON; recorrido manual de navegador con cheque de dos OTs |
| Implementado | Resumen y exportación PDF | RES; componente PDF y ruta protegida |
| Implementado | Demo local aislada con las mismas pantallas | DEM; guard de host/origen y rechazo en producción |
| Pendiente de staging | Aplicar las migraciones en una base de prueba autorizada | No se ejecutó contra bases reales |
| Pendiente de staging | Invitaciones reales, sesiones y revocación de permisos | Auth y correo configurados por el responsable del entorno |
| Pendiente de staging | Subida/descarga real y permisos de Storage | Verificar archivos grandes y comprobantes compartidos |
| Pendiente de staging | Concurrencia con conexiones PostgreSQL independientes | Las pruebas locales usan una instancia PGlite aislada |
| Pendiente de preparación de producción | Conciliar saldos y marcas históricas de pago | No asumir pagos, fechas o beneficiarios desconocidos |

Las tareas de staging no autorizan cambios en producción. ARCA, bancos y un circuito bancario completo de endosos o reemplazos quedan fuera de esta primera etapa, como se acordó.

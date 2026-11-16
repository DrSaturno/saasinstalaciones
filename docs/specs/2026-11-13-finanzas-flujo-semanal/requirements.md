# Finanzas · Flujo semanal de pagos, factura del instalador y usabilidad

**Estado:** BORRADOR. Registrado el 13-11-2026 a partir de lo dicho por Nicolás (con la reunión de Ximena Merlo del 05-11 como base). **No se desarrolla hasta que Nicolás confirme las preguntas abiertas (sección 9).**
**Entorno de trabajo:** Staging (`kjoyynifllvjfjzhihbu`) con datos reales de GF enmascarados. Producción no se toca.
**Traza a:** [requirements de Finanzas v2](../2026-10-27-finance-v2/requirements.md) (PAG-*, COB-*, OT-*, RES-*, ACC-*). Los IDs `FLX-*` son nuevos.

## 1. Objetivo

Que el módulo sea **fluido y entendible para alguien poco técnico**. El circuito de un pago a instalador/coordinador pasa a ser:

1. OT terminada en Operaciones.
2. El **domingo ~4 am** Gastón recibe un aviso con **todo lo que hay que aprobar esa semana**.
3. **Gastón aprueba** cada pago y **confirma o modifica el monto**.
4. Al aprobar, **al instalador/coordinador le llega el aviso** de que tiene que **cargar su factura** desde su perfil.
5. La factura queda **visible en el detalle del pago**.
6. Sólo con factura cargada se puede **pagar**. Ahí mismo Finanzas carga el **comprobante de pago** y queda **Saldado**.

Los **gastos fijos** (alquiler, sueldos, etc.) también los aprueba Gastón, pero **no llevan factura**.

## 2. Decisiones ya tomadas por Nicolás (13-11-2026)

- **D1** Operaciones carga el monto; **Gastón** (gerente titular) lo aprueba y **puede modificarlo**.
- **D2** Sin factura del proveedor **no se paga**, siempre (instaladores y coordinadores).
- **D3** La factura la **carga el propio instalador/coordinador desde su perfil** (nada por mail/WhatsApp); queda todo en la app.
- **D4** Importes **siempre sin IVA** y nunca negativos; la factura debe coincidir con el monto aprobado.
- **D5** La factura es obligatoria también para **cerrar un cobro**.
- **D6** Los gastos fijos **no necesitan factura**, **sí aprobación**.
- **D7** Mantener el apartado **Gastos fijos** como listado de todo lo recurrente de la empresa.

## 3. Requisitos

### 3.1 Flujo y estados del pago a instalador/coordinador
- **FLX-01** Estados visibles y con nombre claro (propuesta, a validar): *En revisión* → *Aprobado · falta factura* → *Listo para pagar* (factura recibida) → *Saldado*. Hoy la factura se exige al **aprobar**; pasa a exigirse al **pagar**.
- **FLX-02** Aprobar exige OT finalizada con fecha de finalización (ver bug 8.1).
- **FLX-03** Al aprobar, Gastón puede **confirmar o cambiar el monto**; el cambio queda registrado (valor anterior, nuevo, quién, cuándo).
- **FLX-04** Una vez que existe factura cargada, el monto queda **bloqueado** (para no romper la regla factura = monto aprobado).
- **FLX-05** Sin factura, el botón de registrar pago no está disponible y explica por qué.
- **FLX-06** Se mantiene: efectivo o transferencia para personal de campo, nunca cheque (PAG-06).

### 3.2 Aviso semanal a Gastón
- **FLX-10** Domingo ~4:00 (hora de Argentina) llega a la casilla indicada por Nicolás un resumen **y un link a la plataforma** con el listado de **OTs terminadas pendientes de aprobar**, **gastos fijos y otros de la semana**, y cuánto se paga el **lunes (AMBA)** y el **martes (Interior)**.
- **FLX-11** Gastón aprueba **todo junto** desde la plataforma (aprobación en lote), con login. El mail **no aprueba por sí solo**.
- **FLX-12** Objetivo: que el lunes a primera hora Ximena sepa cuánto hay que pagar ese día y cuánto el martes.
- **FLX-13** En Staging el aviso **no se manda a destinatarios reales** (los datos son de prueba).

### 3.3 Factura del instalador/coordinador
- **FLX-20** En el perfil del instalador/coordinador aparece una sección **«Para facturar»** con lo aprobado y pendiente de factura (monto, OT, dónde).
- **FLX-21** Carga: número, fecha, importe sin IVA, archivo (PDF/foto). Valida contra el monto aprobado.
- **FLX-22** Aviso al instalador cuando se aprueba su pago (in-app/push; email a definir).
- **FLX-23** La factura aparece en el **detalle del pago** (Finanzas) con vista del archivo.
- **FLX-24** El instalador **sólo ve lo suyo** y **nunca** el libro financiero (aislamiento por RLS y Storage, con prueba).

### 3.4 Detalle del pago
- **FLX-30** El detalle muestra: la **factura del instalador/coordinador** (descarga/vista), el **monto aprobado**, y el espacio para **cargar nuestro comprobante de pago**.
- **FLX-31** Las operaciones deben poder abrir la **OT** y el **pago/cobro** desde cualquier lugar (ver 3.8).

### 3.5 Gastos fijos y gasto adicional (unificar)
- **FLX-40** Un **único formulario «Nuevo gasto»** que empieza preguntando el tipo (*Gasto fijo mensual*, *Sueldo*, *Gasto puntual*) y muestra **sólo los campos que corresponden**.
- **FLX-41** No pedir «proveedor» donde no aplica; si hay beneficiario, rotularlo según el tipo (*Pagar a*, *Empleado*, *Proveedor*) y poder crearlo en el momento.
- **FLX-42** Los gastos fijos conservan su apartado/listado propio (PAG-02/03) y **requieren aprobación** pero no factura.
- **FLX-43** «Registrar pago» se mantiene como está (Nicolás lo aprobó).

### 3.6 Historial de caja
- **FLX-50** Cada movimiento dice claramente si es **PAGO (sale)** o **COBRO (entra)**: etiqueta, color e ícono, signo del importe, y rótulos de columna.

### 3.7 Resumen
- **FLX-60** En general se mantiene. Se agrega el bloque de **números del negocio** que pidió Ximena (previsión de caja ya existe; falta ingresos/egresos, rentabilidad y cobranza). Lista concreta por confirmar (sección 9).
- **FLX-61** **Previsión por día**: lo que se paga el lunes (AMBA) y el martes (Interior).

### 3.8 «Para resolver» y navegación
- **FLX-70** Cada alerta de «Para resolver» lista **cuáles** son (OT, persona, monto) y cada ítem **abre el pago/cobro y la OT** directo, sin cambiar de pantalla a mano.
- **FLX-71** Bug reportado: «2 operaciones sin comprobante» aparece aunque el comprobante se cargó. Investigar la causa (probable: documento subido a la obligación pero no asociado al movimiento de caja) y corregir.

### 3.9 Ayuda para usuarios no técnicos
- **FLX-80** **Tooltips** en cada estado y botón (p. ej. «Previsto»), con definición corta, al pasar el mouse (y al tocar en móvil).
- **FLX-81** Un **«¿Cómo funciona?»** con el circuito de 6 pasos y ayudas «?» junto a cada acción importante.
- **FLX-82** Textos simples, sin jerga contable; estados vacíos que digan qué hacer.

## 4. Seguridad y permisos (a respetar)
- **ACC-01…04** de v2 siguen vigentes. Se suma: **aprobar pagos** es un permiso propio (a definir quién, ver 9) separado de «registrar pagos».
- El instalador necesita **escritura acotada** a *sus* facturas y a un camino de Storage propio, sin acceso a `finance_*`.
- Todo cambio de monto o estado queda en el historial de eventos.
- Nada se aplica en producción sin orden explícita de Nicolás.

## 5. Impacto técnico previsto (para el diseño, no para ahora)
- Reglas de estado de `finance_entries`: mover «factura requerida» de *aprobar* a *pagar*; estado/atributo «aprobado, esperando factura».
- Permiso y RPC de **aprobación en lote con monto editable**; el monto aprobado debe volver a Operaciones (OT) o vivir aparte (ver 9).
- Tabla/RPC para **factura recibida cargada por el proveedor** y vista en el perfil del instalador.
- Job programado dominical + envío de correo (Resend ya configurado para recuperar contraseña).
- Notificación al instalador (infraestructura `notifications`/push ya existe).
- UI: formulario unificado, historial de caja, resumen, tooltips, ayuda.

## 6. Fuera de alcance de esta etapa
Extracto bancario y conciliación (Excel), alertas de cobranza a 30/60 días, simplificación de cheques y ARCA: siguen en el plan general, **no** en esta tanda salvo que Nicolás lo pida.

## 7. Criterios de aceptación (borrador)
1. Una OT finalizada aparece en el listado dominical y se aprueba con el monto confirmado o corregido; el cambio queda auditado.
2. El instalador recibe el aviso, ve «Para facturar» y carga su factura; el sistema rechaza una factura de importe distinto al aprobado.
3. El pago no se puede registrar sin factura; con factura sí, y el comprobante de pago se carga en el mismo detalle; queda Saldado.
4. Un gasto fijo se aprueba y se paga **sin** factura.
5. El historial de caja distingue pagos y cobros a primera vista.
6. Cada alerta de «Para resolver» lleva al registro y a la OT en un clic; «sin comprobante» no aparece si el comprobante está cargado.
7. Un instalador no puede leer ni escribir nada de Finanzas ni facturas ajenas (prueba de RLS).
8. En Staging no sale ningún correo a direcciones reales.

## 8. Bugs técnicos hallados en el ensayo en Staging (13-11-2026)
- **8.1 `finalized_at` nunca se graba.** En producción 0 de 18 OTs finalizadas tienen la fecha de finalización: una reescritura vieja de `validate_order_transition` perdió la línea que la completa, y la versión de v2 tampoco la trae. Finanzas la exige para aprobar y calcular vencimientos ⇒ **hoy ninguna OT se puede aprobar**. Arreglo: restaurar la línea + completar las existentes con `updated_at`.
- **8.2 Zona AMBA.** `finance_sync_order` espera `sites.zone = 'AMBA'`, pero los locales traen la provincia («Buenos Aires», «Ciudad Autónoma de Buenos Aires»). Resultado: 11 de 11 pagos quedaron «interior». Arreglo: clasificar AMBA por ciudad/partido (lista editable) en SQL y en TS con una única fuente.
- **8.3** A producción le falta la migración `20260911000000_rpc_execute_hardening_sweep` (seguridad). Sólo informar; no corregir sin orden.

## 9. Decisiones y preguntas
### Confirmadas por Nicolás (13-11-2026, ronda 1)
- **D8** El monto que Gastón cambia al aprobar **se corrige en la OT** (Operaciones); Finanzas lo sigue. Un solo número; el instalador ve lo mismo que se le paga. Queda auditado.
- **D9** El aviso dominical se programa con **cron de Vercel** (ruta protegida con secreto, Resend ya configurado). Nicolás **no tiene acceso a Vercel hoy**; lo tendrá cuando haga falta para el seteo (variables y cron). El código se desarrolla y prueba en local/Staging sin Vercel.
- **D10** Una factura del instalador/coordinador **puede abarcar varias OTs** (elige las aprobadas que incluye; el total debe coincidir con la suma aprobada). También sirve si factura una por OT.
- **D11** ~~Pueden aprobar Gastón y Ximena~~ **Corregido por Nicolás el 13-11: aprueba SÓLO Gastón** (el dueño de la empresa). Ximena prepara y registra pagos, no aprueba.
- **D16** El lote que se aprueba el domingo va **bien detallado y separado en AMBA e Interior** (más gastos fijos), con subtotales por zona, tanto en la pantalla de aprobación como en el mail.
- **D17** El mail dominical lleva la **misma estética que los demás correos** de Se Instala (plantilla de marca).
- **D18** Producción queda **fuera de esta etapa**: se desarrolla y prueba sólo en Staging/local.

### Confirmadas por Nicolás (13-11-2026, ronda 2)
- **D12** Factura que no llega a tiempo: **el pago pasa a la semana siguiente** (no se paga sin factura); sale de la previsión del lunes/martes y el instalador recibe un **recordatorio**; apenas factura, entra en el próximo lunes/martes.
- **D13** Números del negocio en el Resumen (FLX-60): **cash flow**, **beneficio acumulado**, **porcentaje de beneficio por proyecto y general**, **ganancia por proyecto y por cliente**, **ingresos vs egresos del mes** (vs mes anterior), **antigüedad de la cobranza** (vigente / 30 / 60 / +) y **gastos fijos y sueldos del mes** (total, pagado, falta).
- **D14** Aviso al instalador: **app + push + email**. Requiere email válido en cada instalador (en Staging los emails están enmascarados `@staging.invalid`: ahí **no se envía** a instaladores, sólo se ve en la app).
- **D15** Aviso dominical en Staging: **a la casilla de prueba de Nicolás** (la de su cuenta); a `info@gfinstalaciones.com.ar` **sólo en producción**, con orden de Nicolás.

### Pendiente de diseño (no bloquea)
- Definición exacta de «beneficio» (ingresos cobrados vs facturados; qué costos entran) y de la ventana de «mes».
- Lista de partidos/localidades que cuentan como AMBA (bug 8.2).
- Textos finales de tooltips y de «¿Cómo funciona?» (los redacto yo; los revisa Nicolás).

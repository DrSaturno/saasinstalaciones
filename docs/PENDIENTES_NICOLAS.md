# Pendientes de Nicolás — Se Instala

Todo lo que sólo puede hacer Nicolás (cuentas, plata, paneles, claves, autorizaciones sobre
producción) o que necesita sus ojos. Se actualiza a medida que aparecen cosas.

**Última actualización:** 25-09-2026 (bloque 7, link de seguimiento del cliente).
**Por qué existen:** Claude no puede (a) entrar a las pantallas de la app (login: no tipea
contraseñas), (b) comprar ni contratar nada, (c) cambiar ajustes de seguridad de los paneles,
(d) tocar producción sin autorización explícita, (e) ver la cuenta nueva de Vercel.

Leyenda: 🔴 bloquea el paso a producción · 🟠 importante · 🟢 cuando puedas.

---

## 1. Antes de llevar nada a producción

| # | Qué | Por qué | Cómo |
|---|---|---|---|
| 1.1 🔴 | **Confirmar que existe un backup diario de Supabase** | El bloque 8 migra datos reales de producción. Con plan Pro deberían existir, pero el conector no los muestra. | Panel de Supabase → proyecto `Se Instala - Produccion` → Database → Backups. Anotar fecha del último. |
| 1.2 🔴 | **Autorizar (o no) aplicar la migración del bloque 8 a producción** | Es un cambio de esquema con movimiento de datos. Claude no toca producción sin tu autorización explícita. | Decirle «aplicá la migración del bloque 8 a producción». Antes: 1.1. |
| 1.3 🔴 | **Confirmar el plan de Vercel** | Hobby prohíbe uso comercial. Dijiste que ya es Pro; falta verificar en el team correcto. | Ver 3.1 y 3.2. |
| 1.5 🔴 | **Autorizar (o no) aplicar a producción la migración del bloque 3** (`20260924000001_shared_locations.sql`, locaciones compartidas) | Cambia claves foráneas de cuatro tablas con datos reales; aborta sola si los conteos no coinciden, pero conviene backup (1.1). Se aplica primero la migración y después se despliega el código. | Decirle «aplicá la migración del bloque 3 a producción». |
| 1.6 🔴 | **Autorizar (o no) aplicar a producción la migración del bloque 4** (`20260924000002_company_staff_accounts.sql`, subcuentas y permisos) | Agrega `profiles.is_owner` (todos los gerentes existentes quedan como dueños, es decir sin cambio de comportamiento) y la tabla `company_staff_permissions`; no toca datos existentes de otras tablas. Verificado en Demo: 22 pruebas propias + 47 de regresión (bloques de finanzas y precios) sin fallas. | Decirle «aplicá la migración del bloque 4 a producción». |
| 1.7 🔴 | **Autorizar (o no) aplicar a producción la migración del bloque 6** (`20260925000001_project_expenses.sql`, otros costos del proyecto) | Sólo agrega una tabla nueva (`project_expenses`); no toca ninguna tabla ni columna existente. Verificado en Demo: 9 pruebas propias sin fallas. | Decirle «aplicá la migración del bloque 6 a producción». |
| 1.8 🔴 | **Autorizar (o no) aplicar a producción la migración del bloque 7** (`20260925000002_project_tracking_links.sql`, link de seguimiento del cliente) | Agrega una tabla nueva y una política de storage nueva; no toca datos existentes. Es la primera parte de la app que queda accesible SIN login — verificado a fondo en Demo (23 pruebas propias + probado en vivo con navegador real). | Decirle «aplicá la migración del bloque 7 a producción». |
| 1.9 🔴 | **Autorizar (o no) aplicar a producción las migraciones del bloque 5** (`20260925000000_work_order_team.sql` — equipo de la orden, hasta 15 instaladores — `20260925000003_team_notification_fanout.sql` — avisos al equipo — y `20260925000004_order_team_chat.sql` — chat grupal), **en ese orden** | La primera agrega una tabla, la columna `work_orders.required_installers` (default 1), cambia `installer_earnings` (columna renombrada) y agrega 4 funciones de escritura; ninguna orden existente cambia de comportamiento. La segunda sólo redefine dos funciones de avisos y agrega un trigger. La tercera agrega una tabla nueva (`order_chat_messages`) y la suma a la publicación de Realtime. Verificadas en Demo, no en producción. | Decirle «aplicá las migraciones del bloque 5 a producción». Antes: el código nuevo tiene que estar desplegado, porque `installer_earnings` cambia una columna que lee la app. |
| 1.4 🟠 | **Definir RPO y RTO** | Decisión de negocio: cuánto dato se tolera perder y cuánto tiempo parado. Propuesta: RPO 24 h (backup diario) o 5 min (con PITR), RTO 4 h. | Responder qué valores querés. Documento: `docs/BACKUP_AND_RESTORE.md` §2. |

## 2. Panel de Supabase (sólo vos)

| # | Qué | Detalle |
|---|---|---|
| 2.1 🟠 | **Activar la protección de contraseñas filtradas (SEC-11)** | Authentication → Sign In / Providers → Password security → «Prevent use of leaked passwords». Ya disponible con Pro. El aviso de seguridad de Supabase la sigue marcando deshabilitada. |
| 2.2 🟠 | **Decidir sobre PITR** | Complemento de pago que baja la pérdida máxima de 24 h a minutos. Si no lo querés, el RPO queda en 24 h. |
| 2.3 🟠 | **Autorizar el gasto de un proyecto temporal** para probar una restauración | Un backup que nunca se restauró no está probado. Hay que crear un proyecto aislado, restaurar, comprobar y borrarlo (procedimiento en `docs/BACKUP_AND_RESTORE.md` §4). Cuesta unos USD por el tiempo que dure. |
| 2.4 🟠 | **Autorizar (o no) un proyecto de staging** | Permitiría probar despliegues antes de producción (`docs/PRODUCTION_CHECKLIST.md` #18). Costo mensual adicional. |
| 2.8 🟠 | **Redesplegar la Edge Function `send-event-push`** (Demo y, cuando corresponda, producción) | Ahora acepta a un ayudante del equipo como destinatario del push «orden asignada»; con la versión vieja desplegada, ese push da 403 (la notificación dentro de la app sí llega, sólo falla el aviso al teléfono). Código ya cambiado en `supabase/functions/send-event-push/index.ts`. Claude no despliega funciones sin tu autorización. | `supabase functions deploy send-event-push` con el CLI enlazado al entorno, o pedirle a Claude «desplegá send-event-push en Demo». |
| 2.5 🟢 | **Decidir qué hacer con `Base 3 - Legacy`** | Proyecto viejo, inactivo, con datos de otro esquema (Nicolás dijo que eran de prueba). Borrarlo o renombrarlo. Ojo: el nombre viejo «Se Instala Pro» confunde con el producto. |
| 2.6 🟢 | **Reemplazar el `platform_admin` `admin@instalapro.dev`** | Ese correo es de la marca vieja y de un dominio que no existe. |
| 2.7 🟢 | **Rotar la contraseña sembrada `InstalaPro2026!`** | Está versionada en 4 lugares del repo. |

## 3. Vercel

| # | Qué | Detalle |
|---|---|---|
| 3.1 🔴 | **Mover el proyecto a una cuenta dedicada a seinstala.com.ar** (pausado por vos hasta poder ver la cuenta) | Hoy vive en el team `DrSaturno's projects` (30 proyectos). Pasos: crear el team nuevo, contratarle Pro (sólo vos podés comprar), avisarle a Claude para conectar esa cuenta y hacer la transferencia (código de 24 h). Detalle y riesgos en `docs/specs/2026-09-24-hoja-de-ruta-v2/README.md`, «Bloque 0». |
| 3.2 ✅ | **DNS de `seinstala.com.ar`: resueltos por Claude (25-09-2026)** | La zona DNS está en **SiteGround** (`ns1/ns2.siteground.net`). El apex tiene un registro A a `216.198.79.1` y `www` es un CNAME a `d65f3c2bce948f1a.vercel-dns-017.com` (los dos ya apuntan a Vercel). El correo (MX a `mailspamprotection.com`) también vive en SiteGround: **no tocar los MX** al mover el proyecto. Tras la transferencia hay que verificar que el dominio siga resolviendo y, si Vercel pide otro valor para `www`, cambiarlo en el panel de SiteGround. |
| 3.3 🟢 | **Igualar la versión de Node** | Vercel corre Node 24.x; el repo fija 22.14.0. Decidir cuál. |
| 3.4 🟢 | **Verificar «Skew Protection» activo** | Panel de Vercel → proyecto → Settings. |
| 3.5 🟢 | **Elegir un proveedor de logs y un monitor de uptime** | Hoy los logs salen a un stdout efímero y nadie sondea `/api/health`. |

## 4. Claves y variables de entorno

| # | Qué | Detalle |
|---|---|---|
| 4.1 🟠 | **Crear `GOOGLE_GEOCODING_API_KEY`** (bloque 2) | Google Cloud → habilitar sólo «Geocoding API» → crear clave (distinta de la del mapa) → cargarla en Vercel y en `.env.local` **sin** prefijo `NEXT_PUBLIC_`. Sin ella la ubicación automática no funciona (nada se rompe). Cuesta ~USD 5 cada 1000 consultas. |
| 4.2 🟢 | Si la importación de miles de locales se corta por tiempo: subir la duración máxima de la función en Vercel o pedirle a Claude que baje el tope de 300 | Ver riesgos en `docs/specs/2026-09-24-sin-latitud-longitud/tasks.md`. |

## 5. Verificar a mano con la app (Claude no puede)

Todo en **Demo** (Claude no puede entrar). Para cada bloque, mirar en escritorio y en teléfono.

| Bloque | Qué mirar |
|---|---|
| **8 — importes** 🔴 | Con un **gerente**: crear una orden con importe, editarla, ver el importe en la orden, en finanzas, en el tablero y en el proyecto por contrato; descargar el PDF (debe mostrar «Importe»). Con un **instalador**: abrir su orden y descargar el PDF (debe mostrar «Tu paga», nunca el importe al cliente); ver «Mis ganancias». Con un **coordinador**: que no vea importes al cliente. |
| **1 — cliente desde proyecto** | «Nuevo proyecto» → desplegable de cliente → «＋ Crear cliente nuevo…»: crear, que quede elegido; cancelar; error de nombre repetido; crear el proyecto. Foco al abrir/cerrar el diálogo. |
| **3 — locaciones compartidas** | Con dos clientes de la empresa: crear una locación para el cliente A; en un proyecto del cliente B usar «Traer de otro proyecto o cliente» y elegirla (debe decir «De otro cliente: A» y no mostrar el código de A); editar su dirección desde cualquiera de los dos proyectos y ver que cambia en ambos; ponerle un código distinto para B y que cada proyecto muestre el suyo; subir un documento desde B y comprobar que no aparece en el proyecto de A (el gerente lo ve en la ficha); en la ficha, que diga «Locación compartida por: A, B»; el detalle de cada cliente lista sólo sus órdenes. |
| **2 — sin lat/lng** | Que la ficha del local, la convocatoria, la cobertura del instalador y la plantilla de importación ya no pidan coordenadas. Con la clave puesta (4.1): crear un local con dirección real, editar sólo el teléfono, importar una planilla, «Completar ubicaciones», ver el pin en el mapa del tablero. |
| **4 — subcuentas y permisos** | Con el **dueño** (tu cuenta de gerente actual, que queda automáticamente como dueño): en `/team` aparece «Personal administrativo»; invitar una subcuenta con, por ejemplo, sólo el permiso de finanzas activado; el correo de invitación llega y el link lleva a un alta de contraseña (no de instalador). Con esa **subcuenta ya aceptada**: puede operar proyectos/órdenes/agenda/equipo igual que vos; entra a `/finance` (tiene el permiso) pero NO a `/settings` (formulario de configuración oculto, sin el permiso); no ve «Personal administrativo» en `/team` (sección sólo para el dueño). Volviendo al **dueño**: activar también «Configuración» para esa subcuenta y confirmar que ahora sí ve el formulario de `/settings`; cancelar la invitación de una segunda subcuenta pendiente y que desaparezca de la lista. |
| **6 — resultado económico** | En la ficha de un proyecto: cargar un gasto («Otros costos» — concepto, monto, fecha), ver que la ganancia baja en el mismo panel y también en `/finance`; borrar el gasto y ver que la ganancia vuelve a subir; ver la torta de avance (finalizadas vs. abiertas) debajo de la barra de presupuesto. **Importante además:** con una subcuenta SIN permiso de finanzas (bloque 4), abrir la ficha de un proyecto y confirmar que YA NO puede editar el monto de contrato ni el precio por instalación desde «Editar proyecto» (antes de este bloque sí podía, por un hardcodeo viejo que se corrigió de paso) ni ve el panel de «Otros costos». |
| **5 — equipo de la orden** | En `/orders/[id]` de una orden con responsable: panel «Equipo de la orden». Sumar un ayudante (debe aparecer en su app: «Mis tareas», ruta y agenda), fijarle un monto y marcarlo pagado, quitarlo, y probar que con 15 personas ya no deja sumar más. Con el ayudante logueado: ver la orden, avanzarla, cargar una incidencia y descargar el PDF (debe mostrar sólo SU pago). Ver en `/finance` y en la ficha del proyecto que el costo sube al sumar ayudantes con monto; en `/finance`, que el desglose «por instalador» muestre a cada ayudante con su costo, y que en «Pendientes de pago» aparezca cada ayudante sin cobrar en su propia fila y se pueda marcar pagado (con una orden terminada). Con un **coordinador**: que el panel del equipo no le muestre montos ni botones de pago (una subcuenta administrativa, en cambio, sí los ve, igual que el costo del responsable). **Instaladores necesarios:** en «Nueva orden» y en «Editar» aparece el campo «Instaladores necesarios» (1 a 15, por defecto 1); poner 3, asignar sólo un responsable y ver en el panel del equipo «Incompleta: faltan 2…»; sumar ayudantes hasta llegar a 3 y ver «Cubre las 3 personas necesarias»; en el inicio de un **coordinador**, que el contador «sin cubrir» cuente esa orden mientras falte gente. Confirmar que el coordinador ve bien el plantel (si la lista de ayudantes le llega vacía, avisar: sería un permiso de lectura a ajustar). **Avisos al equipo:** sumar un ayudante y ver que a él le llegue «Nueva orden asignada» en su campana (y el push al teléfono, sólo después de redesplegar la función, 2.8); reprogramar la fecha de esa orden desde la empresa y ver que le llegue «Tu trabajo fue reprogramado» a él y al responsable (pero que la pregunta «¿seguís en este trabajo?» y su plazo la tenga sólo el responsable); devolver o aprobar la entrega y ver el aviso en ambos. **Chat del equipo:** en una orden con al menos un ayudante aparece «Chat del equipo» (en `/orders/[id]` para la empresa y en `/tasks/[id]` para el responsable y los ayudantes; en una orden sin ayudantes NO aparece). Abrir la misma orden con dos cuentas a la vez (gerente y ayudante, por ejemplo en dos navegadores), escribir desde una y ver que el mensaje llega a la otra **sin recargar** (Realtime); que a quien no escribió le llegue el aviso en la campana; que un instalador de la empresa que NO está en esa orden no vea nada; quitar al ayudante del equipo y comprobar que deja de ver el chat. Es sólo texto: sin adjuntos ni tildes de leído. |
| **7 — link de seguimiento** 🔴 | Claude ya probó el LADO CLIENTE de punta a punta con navegador real (sin login), así que sólo falta el LADO EMPRESA: en la ficha de un proyecto, tocar «Link para el cliente», generarlo, copiarlo y abrirlo en una pestaña sin sesión (o pasárselo a otra persona) — tiene que verse el avance, los hitos y las fotos, sin ningún importe ni nombre de instalador ni teléfono. Probar «Generar uno nuevo» (el link viejo tiene que dejar de funcionar) y «Desactivar» (lo mismo). Probarlo también como coordinador de ese proyecto puntual, no sólo como gerente. |

## 6. Después de aplicar en producción (con tu autorización)

1. Aplicar la migración A del bloque 8 (1.2) y comparar conteos y sumas de importes antes/después.
2. Desplegar el código.
3. Aplicar la migración B (limpieza: quitar las columnas viejas). Claude la prepara **después** de
   que el código nuevo esté desplegado; no está en el repo a propósito.
4. Regenerar `types/database.ts` con el CLI de Supabase apuntando a Demo (`node
   scripts/narrow-database-types.mjs` después) y correr las ~40 suites de pruebas de base y los E2E
   en CI.

## 7. Heredado de auditorías anteriores

- **MFA:** la obligatoriedad se quitó por decisión de producto; `platform_admin` y `company_manager`
  pueden operar sólo con contraseña (SEC-13 reabierto). Decidir si se vuelve a exigir.
- **NO volver a prender** «Allow new users to sign up» ni el Captcha de Supabase (ver
  `docs/SECURITY_AUDIT.md`).
- **Actualización de dependencias:** sin actualizaciones masivas (regla tuya); las 6 vulnerabilidades
  residuales de build se aceptan hasta actualizar el framework.
- **Hosting SiteGround:** confirmar si sigue vigente el destino `output: "standalone"` (checklist #12).

---

## Decisiones que te tocan (bloque 5)

- **«Incompleta» no cambia las convocatorias ni la alerta «sin asignar» del tablero.** Ambas siguen buscando *responsable*: si una orden ya tiene responsable pero le faltan ayudantes, no aparece ahí (se ve en el panel del equipo y en el contador del coordinador). Lo hice así para que una convocatoria o el botón «asignar» no reemplace a un responsable ya puesto. Confirmar, o decir si querés una alerta aparte de «faltan ayudantes».
- El alta **por lote** no pide instaladores necesarios: todas quedan en 1 y se ajustan después desde «Editar».

## Decisiones que te tocan (bloque 3)

- El historial de cambios de una locación ahora se lee **por cliente**: el coordinador de un proyecto del cliente B no ve el historial registrado bajo el cliente de origen A (el gerente lo ve todo). Confirmar que está bien.
- Las locaciones duplicadas que ya existan (el mismo shopping cargado una vez por cliente) **no se fusionan**; se puede elegir la existente al armar proyectos nuevos. Decidir si más adelante querés una herramienta para unificarlas.

## Lo que Claude te debe (respuestas que necesita de vos para seguir)

- Bloque 3 (locaciones compartidas): decidir cuando llegue la spec si los documentos y requisitos de
  una locación se comparten entre clientes o quedan separados (default aceptado: separados).

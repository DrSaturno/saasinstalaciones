# Pendientes de Nicolás — Se Instala

Lo que sólo podés hacer vos: cuentas, pagos, paneles, claves, autorizaciones sobre producción y
todo lo que hay que mirar con la sesión iniciada. Cada punto tiene su paso a paso.

**Última actualización:** 08-10-2026.

**Por qué no lo puedo hacer yo:** no puedo entrar a las pantallas de la app (no tipeo
contraseñas), no puedo comprar ni contratar nada, no cambio ajustes de seguridad de los paneles y
no toco producción sin que me lo autorices por escrito en el chat.

Leyenda: 🔴 frena el paso a producción · 🟠 importante · 🟢 cuando puedas · ✅ hecho.

---

## Dónde estamos (en una línea)

Todo lo nuevo de la hoja de ruta v2 (bloques 1 a 8) está hecho y probado en **Demo**, subido a la
rama `feature/hoja-de-ruta-v2` con el PR #52 abierto (<https://github.com/DrSaturno/saasinstalaciones/pull/52>). **No está en producción.** Para llevarlo hacen
falta, en este orden: **A → B** de abajo.

> ⚠️ **No mergees el PR de la hoja de ruta v2 vos.** Mergear a `main` despliega solo a producción, y
> ese código necesita las migraciones nuevas aplicadas antes. Si se despliega sin ellas, se rompe.
> El orden exacto (migración, despliegue, migración) lo manejo yo en el paso C.

---

## A. Hacé esto primero (≈ 30 minutos, frena todo lo demás)

### A1 🔴 Confirmar que hay backups diarios de producción

1. Entrá a <https://supabase.com/dashboard> con tu cuenta.
2. Elegí el proyecto **Se Instala - Produccion** (ref `rpdjjvcmtcpvmwrjqhke`). **No** el de Demo.
3. En el menú de la izquierda: **Database → Backups**.
4. Mirá la pestaña **Scheduled backups**. Tiene que haber una lista con fechas de los últimos días.
5. Mandame por el chat la fecha y hora del último backup (o una captura).
   - Si la lista está vacía o dice que hace falta un plan pago, avisame: sin backup no aplico nada.

### A2 🟠 Activar la protección de contraseñas filtradas (HIBP)

Hoy está **apagada**: lo volví a confirmar el 08-10-2026 con el aviso de seguridad de Supabase.

1. Mismo proyecto de producción en Supabase.
2. Menú izquierdo: **Authentication → Sign In / Providers** (en algunas versiones del panel:
   **Authentication → Policies → Password security**).
3. Buscá la sección **Password security**.
4. Prendé **«Prevent use of leaked passwords»**.
5. Tocá **Save**.
6. Avisame y vuelvo a correr el aviso de seguridad para confirmar que desapareció.

Hacelo también en el proyecto de **Demo** (`krxewmfauohixmmzsvkp`), con los mismos pasos.

### A3 🟠 Probar en Demo lo que yo no puedo ver (sección D)

La sección D tiene, bloque por bloque, qué tocar y qué tiene que pasar. Los más importantes son
**D1 (importes)** y **D7 (link del cliente)**, porque son de seguridad. Si algo no da lo que dice,
mandame una captura y el paso donde falló.

---

## B. Autorizaciones que me tenés que dar por escrito

Escribiendo la frase exacta en el chat ya queda autorizado. Antes hace falta **A1** (el backup).

### B1 🔴 Pasar la hoja de ruta v2 a producción

1. Hacé A1 y mandame la fecha del backup.
2. Hacé al menos D1 y D7 en Demo (o decime que confiás en mis pruebas y lo saltás).
3. Escribime: **«autorizo pasar la hoja de ruta v2 a producción»**.

Con eso hago yo, en orden y verificando cada paso:
- aplico las 8 migraciones nuevas a producción, comparando conteos y sumas de importes antes y después;
- mergeo el PR, que despliega solo, y espero a que Vercel termine;
- preparo y aplico la limpieza del bloque 8 (quitar las columnas viejas de importes);
- te paso un resumen con qué quedó y qué probar.

Las 8 migraciones son: importes privados (bloque 8), locaciones compartidas (3), subcuentas (4),
equipo de la orden, avisos al equipo y chat del equipo (5), otros costos (6) y link del cliente (7).
Todas están verificadas en Demo con sus pruebas propias.

### B2 🟠 Desplegar la función de avisos al teléfono (`send-event-push`)

Lo que encontré el 08-10-2026: **en Demo no hay ninguna Edge Function desplegada**, así que los
avisos push al celular nunca funcionaron ahí (las notificaciones dentro de la app sí). En
producción está la versión 3, que es vieja: le falta avisarle a un ayudante del equipo (bloque 5).

1. Escribime: **«desplegá send-event-push en Demo»**.
2. Cuando pase B1, escribime: **«desplegá send-event-push en producción»**.

Ojo: la función necesita sus secretos VAPID cargados en cada proyecto (Supabase → Edge Functions
→ Secrets). Si en Demo no están, te aviso cuáles faltan; los cargás vos, yo no toco claves.

### B3 ✅ Mergear la corrección de seguridad de dependencias (hecho el 08-10-2026)

Es el PR #51 (<https://github.com/DrSaturno/saasinstalaciones/pull/51>), aparte y chico: sube `next` de 16.3.5 a 16.3.6 (corrige una falla crítica de ejecución
remota de código) y fuerza `proxy-addr` 2.0.8. Esto vuelve a poner CI en verde.

1. Mirá que el PR tenga los tres checks en verde (te lo confirmo yo en el chat).
2. Escribime: **«mergeá el PR de dependencias»**. Se despliega solo a producción.

### B4 ✅ Mergear el arreglo de la pantalla de invitación (hecho el 08-10-2026)

Es el PR #53 (<https://github.com/DrSaturno/saasinstalaciones/pull/53>). La pantalla que viste el
08-10, cuando abriste el link con tu sesión de gerente, deja de ser un callejón sin salida: ofrece
copiar el link para el instalador, cerrar sesión y seguir con el alta, o volver al panel. Además,
el texto de la izquierda ya no queda encima del dibujo.

1. Esperá a que tenga los checks en verde (te lo confirmo yo).
2. Escribime: **«mergeá el PR de la invitación»**. Se despliega solo a producción.
3. Para probarlo: invitá a un instalador, abrí el link **en una ventana de incógnito** (así ves lo
   mismo que él) y después en tu navegador normal (ahí tienen que aparecer los botones nuevos).

---

## C. Vercel

**Lo que comprobé el 08-10-2026:** el proyecto `saasinstalaciones` **ya está en el team nuevo
«gf instalaciones»**. Producción se despliega desde ahí por lo menos desde el 02-10 y
`www.seinstala.com.ar` responde bien. La mudanza está hecha; quedan estos tres puntos.

### C1 🔴 Confirmar que «gf instalaciones» está en plan Pro

El plan Hobby no permite uso comercial. Yo no puedo ver la facturación.
1. Entrá a <https://vercel.com> → selector de equipo arriba a la izquierda → **gf instalaciones**.
2. **Settings → Billing**.
3. Tiene que decir **Pro**. Si dice **Hobby**, tocá **Upgrade** y cargá el medio de pago.
4. Avisame qué dice.

### C2 🟠 Darle acceso a mi conector al proyecto

Mi conector ve el team «gf instalaciones», pero **no ve ningún proyecto adentro**. Sin eso no
puedo leer logs ni el estado de los despliegues; hoy lo veo sólo de rebote, por GitHub.
1. En claude.ai → **Settings → Connectors → Vercel** → **Disconnect**.
2. **Connect** de nuevo. En la pantalla de autorización de Vercel elegí **gf instalaciones** y,
   si pregunta por proyectos, **All projects** (o tildá `saasinstalaciones`).
3. Avisame y verifico que lo veo.

### C3 🟢 Ajustes del proyecto

En Vercel → team gf instalaciones → proyecto **`saasinstalaciones`**.
⚠️ Fijate el nombre arriba a la izquierda: **`seinstalapro` es otro proyecto**, el marketplace viejo.
1. **Versión de Node:** Settings → General → **Node.js Version**. Vercel usa 24.x y el repo fija
   22.14.0. Elegí **22.x** (es la que está probada) y guardá. Si preferís 24, decímelo y yo
   igualo el repo.
2. **Skew Protection:** Settings → Advanced → **Skew Protection** → activado → Save.
3. **Monitor de caídas (opcional):** creá una cuenta gratis en <https://uptimerobot.com> →
   **Add New Monitor** → tipo HTTP(s) → URL `https://www.seinstala.com.ar/api/health` → cada
   5 minutos → alerta a tu mail.

**No toques los registros MX en SiteGround**: el correo vive ahí.

---

## D. Probar en Demo con la sesión iniciada

Todo en **Demo**. Para cada bloque mirá en la compu y en el celular. Si algo no da lo que dice,
captura y el número de paso.

### D1 🔴 Bloque 8 — el instalador no ve el precio al cliente

**Con un gerente:**
1. Creá una orden con importe y editala.
2. Fijate que el importe se vea en la orden, en Finanzas, en el tablero y en el proyecto por contrato.
3. Descargá el PDF de la orden: tiene que decir «Importe».

**Con un instalador:**
1. Abrí su orden y descargá el PDF: tiene que decir **«Tu paga»**, nunca el importe al cliente.
2. Abrí «Mis ganancias»: tiene que estar sólo lo suyo.

**Con un coordinador:** que no vea importes al cliente en ningún lado.

### D2 Bloque 1 — crear un cliente desde el proyecto

1. «Nuevo proyecto» → desplegable de cliente → **«＋ Crear cliente nuevo…»**.
2. Creá uno: tiene que quedar elegido solo.
3. Probá cancelar, y probá un nombre repetido (tiene que dar error).
4. Creá el proyecto.

### D3 Bloque 3 — locaciones compartidas entre clientes

1. Con dos clientes (A y B), creá una locación para A.
2. En un proyecto de B: **«Traer de otro proyecto o cliente»** → elegila. Tiene que decir «De otro
   cliente: A» y no mostrar el código de A.
3. Cambiale la dirección desde un proyecto: tiene que cambiar en los dos.
4. Ponele un código distinto para B: cada proyecto muestra el suyo.
5. Subí un documento desde B: no tiene que aparecer en el proyecto de A (el gerente lo ve en la ficha).
6. En la ficha tiene que decir «Locación compartida por: A, B».

### D4 Bloque 2 — sin latitud ni longitud

1. Fijate que la ficha del local, la convocatoria, la cobertura del instalador y la plantilla de
   importación ya no pidan coordenadas.
2. **Sólo después de E1** (la clave de Google): creá un local con dirección real, importá una
   planilla, tocá **«Completar ubicaciones»** y mirá que aparezca el pin en el mapa del tablero.

### D5 Bloque 4 — subcuentas y permisos

**Con tu cuenta de gerente** (queda como dueño automáticamente):
1. Entrá a `/team`: tiene que aparecer «Personal administrativo».
2. Invitá una subcuenta con **sólo el permiso de Finanzas**.
3. Abrí el correo de invitación: el link tiene que llevar a crear contraseña (no al alta de instalador).

**Con esa subcuenta, ya aceptada:**
1. Opera proyectos, órdenes, agenda y equipo igual que vos.
2. Entra a `/finance`.
3. En `/settings` **no** ve el formulario.
4. En `/team` **no** ve «Personal administrativo».

**De vuelta con tu cuenta:**
1. Dale también «Configuración»: ahora sí ve `/settings`.
2. Invitá una segunda subcuenta, cancelala, y fijate que desaparezca.

### D6 Bloque 6 — resultado económico

1. En la ficha de un proyecto, cargá un gasto en «Otros costos»: la ganancia tiene que bajar en ese
   panel y en `/finance`.
2. Borralo: la ganancia vuelve a subir.
3. Mirá la torta de avance debajo de la barra de presupuesto.
4. **Con una subcuenta SIN permiso de Finanzas:** en «Editar proyecto» **no** puede cambiar el
   monto de contrato ni el precio por instalación, y no ve «Otros costos».

### D7 🔴 Bloque 7 — link de seguimiento para el cliente

El lado del cliente ya lo probé yo con un navegador real. Falta el lado de la empresa:
1. Ficha de un proyecto → **«Link para el cliente»** → generarlo → copiarlo.
2. Abrilo en una ventana de incógnito: tiene que mostrar el avance, los hitos y las fotos, **sin**
   importes, nombres de instaladores ni teléfonos.
3. **«Generar uno nuevo»**: el link viejo deja de funcionar.
4. **«Desactivar»**: lo mismo.
5. Repetí los pasos 1 y 2 como **coordinador** de ese proyecto.

### D8 Bloque 5 — equipo de la orden (varios instaladores)

**Equipo:**
1. En `/orders/[id]` de una orden con responsable: panel «Equipo de la orden».
2. Sumá un ayudante: tiene que aparecerle en «Mis tareas», en la ruta y en la agenda.
3. Fijale un monto, marcalo pagado y después quitalo.
4. Con 15 personas, ya no tiene que dejar sumar más.

**Con el ayudante:** ver la orden, avanzarla, cargar una incidencia y descargar el PDF (sólo SU pago).

**Finanzas:**
1. En `/finance` y en la ficha del proyecto, el costo sube al sumar ayudantes con monto.
2. El desglose «por instalador» muestra a cada ayudante.
3. En «Pendientes de pago» cada ayudante aparece en su fila y se puede marcar pagado.

**Instaladores necesarios:**
1. En «Nueva orden» poné 3.
2. Asigná sólo al responsable: el panel tiene que decir «Incompleta: faltan 2…».
3. Completá con ayudantes: tiene que decir «Cubre las 3 personas necesarias».

**Avisos:**
1. Al sumar un ayudante, a él le llega «Nueva orden asignada». El push al celular llega sólo
   después de B2.
2. Reprogramá la orden: les llega el aviso al ayudante y al responsable.

**Chat del equipo:**
1. Abrí la misma orden con dos cuentas a la vez, en dos navegadores.
2. Escribí desde una: el mensaje aparece en la otra **sin recargar**.
3. Un instalador que no está en la orden no ve nada.
4. Quitá al ayudante: deja de ver el chat.

**Con un coordinador:** el panel no muestra montos ni botones de pago.

---

## E. Claves y cuentas externas

### E1 🟠 Clave de Google para ubicar direcciones (`GOOGLE_GEOCODING_API_KEY`)

Sin esta clave no se rompe nada, pero los locales quedan sin pin en el mapa. Google cobra unos
USD 5 cada 1.000 consultas.

1. Entrá a <https://console.cloud.google.com> → el mismo proyecto donde está la clave del mapa.
2. **APIs y servicios → Biblioteca** → buscá **Geocoding API** → **Habilitar**.
3. **APIs y servicios → Credenciales → Crear credenciales → Clave de API**.
4. En la clave nueva, **Restricciones de API** → **Restringir clave** → tildá **sólo Geocoding API**.
5. **No** le pongas restricción por sitio web: se usa desde el servidor. Si podés, restringila
   por IP; si no, dejala sin restricción de aplicación.
6. Copiá la clave y cargala en Vercel: proyecto `saasinstalaciones` → **Settings → Environment
   Variables** → nombre `GOOGLE_GEOCODING_API_KEY`, entornos **Production** y **Preview**.
   - **Sin** el prefijo `NEXT_PUBLIC_`: es secreta.
7. Cargala también en tu `.env.local` si corrés la app en tu compu.
8. Avisame: no hace falta que me pases la clave.

### E2 🟢 Si importar miles de locales se corta por tiempo

Avisame. Lo resuelvo yo bajando el tope de 300 por tanda, o vos subís la duración máxima de la
función en Vercel (Settings → Functions), que con Pro se puede.

---

## F. Decisiones de negocio (sólo responder en el chat)

### F1 🟠 RPO y RTO: cuánto dato y cuánto tiempo se banca perder

- **RPO**, cuántos datos se pueden perder. Mi propuesta: **24 h** con el backup diario que ya
  viene en Pro, o **minutos** si contratás PITR (ver F2).
- **RTO**, cuánto puede estar caída la app. Mi propuesta: **4 h**.

Respondeme con tus valores. Los anoto en `docs/BACKUP_AND_RESTORE.md` §2.

### F2 🟠 PITR (restauración a un minuto exacto)

1. Supabase → producción → **Database → Backups → Point in Time**.
2. Ahí aparece el precio del complemento. Decidí si lo querés.
   - Si no lo querés, el RPO queda en 24 h.

### F3 🟠 Probar una restauración real

Un backup que nunca se restauró no está probado. Cuesta unos pocos dólares por el rato que dura.
1. Escribime: **«autorizo crear un proyecto temporal para probar el restore»**.
2. Yo sigo `docs/BACKUP_AND_RESTORE.md` §4: creo el proyecto aislado, restauro, compruebo,
   anoto la evidencia y lo borro.

### F4 🟢 ¿Querés un entorno de staging?

Sería un tercer proyecto para probar despliegues antes de producción, con costo mensual extra.
Respondé sí o no.

### F5 🟢 Bloque 5: «Incompleta» y las alertas del tablero

Una orden con responsable a la que le faltan ayudantes **no** aparece en las convocatorias ni en
la alerta «sin asignar» del tablero. Se ve en el panel del equipo y en el contador del
coordinador. Lo hice así para que «asignar» no reemplace a un responsable ya puesto.
- Respondé «ok» o «quiero una alerta aparte de faltan ayudantes».
- Además, el alta **por lote** deja todas las órdenes en 1 instalador necesario; se ajusta
  después desde «Editar».

### F6 🟢 Bloque 3: historial y locaciones duplicadas

1. El historial de cambios de una locación se ve **por cliente**: el coordinador del cliente B no
   ve lo que se registró bajo A (el gerente ve todo). ¿Ok?
2. Las locaciones que ya están cargadas dos veces (una por cliente) **no se fusionan solas**.
   ¿Querés más adelante una herramienta para unificarlas?

### F7 🟢 MFA (segundo factor)

Hoy los gerentes y el admin de plataforma entran sólo con contraseña, porque así lo decidiste.
¿Lo volvemos a exigir? Mi recomendación: sí, al menos para el admin de plataforma.

---

## G. Limpieza (cuando tengas un rato)

### G1 🟢 Proyecto viejo `Base 3 - Legacy` en Supabase

Está pausado, tiene otro esquema y su nombre («Se Instala Pro») se confunde con el producto.
1. Decidí: borrarlo o renombrarlo.
2. Para renombrarlo: Supabase → ese proyecto → **Settings → General → Project name** →
   `ZZ Legacy marketplace` → Save.
3. Para borrarlo: mismo lugar, abajo de todo, **Delete project**. **No se puede deshacer.**

### G2 🟢 Reemplazar al admin de plataforma `admin@instalapro.dev`

Ese correo es de la marca vieja y de un dominio que no existe: si perdés la contraseña, no hay
forma de recuperarla.
1. Decime qué correo real querés como admin de plataforma (por ejemplo `admin@seinstala.com.ar`).
2. Yo te preparo el cambio y te lo paso para que lo autorices.

### G3 🟢 Contraseña de prueba `InstalaPro2026!`

Está escrita en el repo (seed, E2E y CI). Sólo importa si alguna cuenta **de producción** la usa.
1. Si alguna cuenta real tiene esa contraseña, cambiala desde «Olvidé mi contraseña».
2. Si es sólo de Demo, no hace falta nada.

### G4 🟢 Hosting en SiteGround

Producción está en Vercel. ¿Seguimos pensando en SiteGround como alternativa? Si no, borro la
nota del checklist.

---

## Reglas que siguen vigentes

- **NO volver a prender** «Allow new users to sign up» ni el Captcha de Supabase (ver
  `docs/SECURITY_AUDIT.md`).
- **Sin actualizaciones masivas de dependencias:** sólo parches puntuales de seguridad, como el
  de B3.
- **Antes de tocar una variable en Vercel**, mirá que el proyecto de arriba a la izquierda diga
  `saasinstalaciones`, no `seinstalapro`.

## Ya hecho ✅

- **DNS de `seinstala.com.ar`** (25-09-2026): apex y `www` apuntan a Vercel desde SiteGround, y el
  correo sigue en SiteGround.
- **Supabase Pro** (24-09-2026).
- **Proyecto de Vercel mudado al team «gf instalaciones»** (comprobado el 08-10-2026; ya desplegaba desde ahí el 02-10).
- **Fix crítico de dependencias (#51) y arreglo de la invitación (#53)** en producción desde el 08-10-2026.

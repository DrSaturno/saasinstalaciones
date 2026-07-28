# Plan de mejoras — relevamiento del usuario (2026-07-28)

Origen: repaso manual completo de la app por el usuario. Este plan ordena los
~21 puntos en 6 fases por dependencia y riesgo. **Regla de trabajo: cada fase se
termina, se valida (type-check, lint, tests, build), se pushea y recién entonces
se arranca la siguiente.** Migraciones: el usuario las aplica en el SQL Editor
antes del push de la fase.

Estado: ⬜ pendiente · 🔶 en curso · ✅ hecho

---

## FASE 0 — Publicar lo pendiente + bugs que rompen ✅ COMPLETA

- ✅ **0.1 Push de lo que ya está arreglado en local y sin publicar**: fix del
  "Error inesperado" del coordinador (guards `isInstallerArea`), aviso de
  mensajes de chat (migración 04, ya aplicada), fecha/hora de incidencias,
  coordinador visible en proyecto. Producción sigue rota para el coordinador
  hasta este push.

- ✅ **0.2 Anuncios: dos bugs, ya diagnosticados.**
  - *No abre nada al tocar la notificación:* la notificación de anuncio lleva a
    `/tasks` (hardcodeado en la migración 20260725000004), pero los anuncios
    sólo se muestran en `/home`. Llevarla a `/home` (migración chica) y, mejor,
    resaltar el anuncio al llegar.
  - *Botón "Publicando" colgado:* `publishAnnouncement` manda los emails por
    Resend SINCRÓNICAMENTE dentro de la action. Sin dominio verificado, cada
    envío falla lento y el usuario queda mirando "Publicando…". Responder apenas
    el anuncio se publica y despachar los emails después (after/background),
    con el resultado como dato secundario.

- ✅ **0.3 "Volver" tira error.** CAUSA: desfasaje de versiones. Con la pestaña
  abierta desde antes de un deploy, el cliente pide payloads RSC / Server
  Actions de un build que ya no existe. Sin `deploymentId` Next no lo detecta y
  falla. RESUELTO con `deploymentId: process.env.VERCEL_DEPLOYMENT_ID` en
  next.config.ts. **Pendiente del usuario: activar Skew Protection en Vercel**
  (Settings → Advanced), que enruta al deploy correcto en vez de recargar.

- ✅ **0.4 Imagen de seguimiento no se visualiza.** CAUSA: la foto se subía
  bien al bucket y se guardaba en `order_updates.photos`, pero **la UI nunca la
  renderizaba**: sólo imprimía el texto "N fotos". Del lado empresa ni siquiera
  se leía la columna. RESUELTO: `signUpdatePhotos` + componente `UpdatePhotos`
  con miniaturas y URL firmada, en el detalle de orden del instalador Y del
  área empresa/coordinación.

- ✅ **0.5 Revisar `/home` del coordinador.** Hoy arma "mi día" con órdenes
  asignadas a la persona; para un coordinador eso puede quedar vacío o raro.
  Decidir qué muestra: resumen de coordinación (órdenes por confirmar, equipo)
  + lo suyo propio si tiene.

## FASE 1 — Reglas de negocio de la orden ✅ COMPLETA

- ✅ **1.1 No se sale de "pendiente" sin instalador asignado.** Validación en
  server + trigger en DB + la UI lo explica (interpretación: es la regla
  deseada, hoy se puede avanzar sin asignar).
- ✅ **1.2 El instalador no puede INICIAR sin haber ACEPTADO la orden.**
  `installer_accepted_at` como precondición de `planificada → en_proceso` para
  el rol instalador.
- ✅ **1.3 "Enviar a revisión" sólo el instalador.** El coordinador aprueba
  (`en_revision → finalizada`) y la empresa es última instancia. Ni coordinador
  ni empresa pueden mandar a revisión. Restricción por rol en server y trigger.
- ✅ **1.4 Acta de relevamiento.** En estado "relevamiento", coordinador y/o
  instalador dejan asentado lo relevado (order_update tipo `survey`) y eso
  queda visible antes de pasar a planificar. Obligatorio SÓLO si la orden pasó
  por 'relevamiento' (decisión B). Tipo de avance nuevo: `survey`.
- ✅ **1.5 Un coordinador no puede ser elegido como instalador de una orden.**
  Filtrar todos los selectores de asignación por rol `installer` + validación
  server. Conserva las órdenes que ya tenía al ascender (decisión A); lo que se
  bloquea son las asignaciones NUEVAS.
- ✅ **1.6 El coordinador puede ENTRAR a la orden.** Vista de detalle
  (`/coordination/[id]`): la orden desde adentro — datos, locación, historial,
  adjuntos, incidencias y las acciones que le tocan según estado.

## FASE 2 — Imágenes y adjuntos ✅ COMPLETA

- ✅ **2.1 Toda imagen de una orden queda ligada a su LOCACIÓN.** Galería en la
  ficha de locación que reúna adjuntos de órdenes + fotos de avances de esa
  locación. Con opción de eliminar (gerente y coordinador del proyecto).
- ✅ **2.2 Foto de perfil** para instalador y coordinador: bucket público
  `avatars` (escritura acotada a la carpeta propia por política de Storage),
  subida directa desde el navegador en /profile, y se muestra en perfil, roster
  y ficha. Migración `20260728000007_avatars.sql`.

## FASE 3 — Locaciones ✅ COMPLETA

- ✅ **3.1 Plantilla Excel real (.xlsx).** Se genera en el servidor con exceljs
  (`/api/site-template`): encabezado formateado, obligatorias marcadas con *,
  anchos, hoja de Instrucciones y dos filas de ejemplo. La importación acepta
  .xlsx y lo convierte en el servidor a las mismas filas del parser CSV, así
  hay un solo camino de validación. Columnas centralizadas en
  `lib/domain/site-template.ts`.
- ✅ **3.2 Reutilizar locaciones entre proyectos del mismo cliente.** En "Adm.
  instalaciones": "traer locaciones de proyectos anteriores" del cliente.
- ✅ **3.3 Fix visual:** el badge de zonas crecía sin límite (una por provincia)
  y empujaba los botones. Ahora muestra 3 y "+N", con el detalle en el tooltip,
  y la columna de acciones no se comprime.

## FASE 4 — UX instalador / coordinador

- ⬜ **4.1 Dirección base para "Mi ruta".** El instalador carga en su perfil una
  dirección punto de partida (columnas `installers.base_lat/lng` ya existen).
  Mirar la lógica de `proyecto1` (InstallerRoute + zones) como referencia.
  Definir geocodificación (Nominatim u opción similar sin key).
- ⬜ **4.2 Ausencias anticipadas.** El flujo fechas + justificación + aprobación
  de la empresa YA existe en DB (migración 20260725000003). Verificar de punta a
  punta que el instalador cargue fechas/motivo desde su tablero y la empresa
  apruebe; cerrar lo que falte.
- ⬜ **4.3 Vista lista** (además de tarjetas) en "Mis órdenes" y "Coordinación",
  reusando el ViewToggle de empresa.
- ⬜ **4.4 Bolsa: el coordinador de la empresa no ve sus búsquedas.** El
  matching hoy excluye a quienes están en el roster; el coordinador sigue en el
  roster, así que verificarlo y, si hace falta, excluir además por
  `profiles.company_id` en `broadcast_matches_installer`.

## FASE 5 — Presentación

- ⬜ **5.1 PDF de la orden de trabajo** con diseño cuidado, descargable desde
  los tres tableros. Enfoque a decidir en implementación: vista imprimible con
  `@media print` o `@react-pdf/renderer` (evitar puppeteer en Vercel).
- ⬜ **5.2 Aprovechar el ancho de pantalla.** Pasada general: los contenedores
  `max-w-6xl/7xl` quedan chicos en tablas y listados; ensanchar dashboard,
  órdenes, proyectos, finanzas. Usar skills de diseño (frontend-design /
  ui-ux-pro-max) para esta fase.

---

## Decisiones del usuario (2026-07-28) — RESUELTAS

- **A:** al ascender a coordinador, **conserva las órdenes que ya tiene hasta
  terminarlas**, pero no puede recibir nuevas asignaciones.
- **B:** el acta de relevamiento es obligatoria **sólo si la orden pasó por el
  estado `relevamiento`**. Si va de `pendiente` derecho a `planificada`, no se
  pide nada.
- **C:** confirmado, es una regla a imponer: no se sale de `pendiente` sin
  instalador asignado.

## Notas de contexto

- La base quedó reseteada a cero (2 usuarios: maestro y gerente) — ideal para
  probar cada fase con datos limpios.
- Interdependencia 1.5 ↔ 4.4: el coordinador SIGUE perteneciendo a
  `company_installers` (equipo y exclusión de bolsa) aunque no sea asignable;
  lo que cambia son los selectores y la validación de asignación.
- Cada bug de "no funciona" se prueba primero en producción tras el push de la
  fase 0: varios pueden ser síntomas del código viejo que corre hoy.

# Instala Pro — Estado del proyecto

## ACTUALIZACIÓN AUTORITATIVA — coordinadores y expansión operativa (`rama1`, 2026-07-24)

> Este es el punto de reanudación vigente. La migración anterior
> `20260724000001_manager_dashboard.sql` fue ejecutada por el usuario. El código
> de esta sección está completo en `rama1`; falta ejecutar la migración nueva
> indicada abajo antes de probar las pantallas contra Supabase.

### Implementado

- **Rol coordinador:** un proyecto tiene un coordinador responsable y un
  coordinador puede llevar varios proyectos. Ve y opera solamente sus proyectos,
  órdenes, locaciones, incidencias, bolsa y adjuntos; no accede a Finanzas ni
  puede ver/modificar cobros o importes. El gerente invita coordinadores desde
  Equipo con el mismo flujo seguro de alta por link.
- **Dashboard corregido:** acciones rápidas inmediatamente debajo de las
  métricas y abiertas en formularios operativos directos; se quitó Exportar
  informe y el bloque financiero. Se compactó el desglose de instaladores, se
  reacomodaron canceladas en SLA y los nombres de instaladores abren el chat.
- **Proyectos e instalaciones:** alta/edición con cliente de agenda y
  coordinador. “Generar órdenes” crea primero las locaciones pendientes sin
  datos hasta alcanzar la cantidad contratada y después genera sólo las órdenes
  faltantes. Al completar la ficha, la locación deja de ser placeholder.
- **CSV:** importación ampliada con latitud/longitud y descarga de una planilla
  modelo lista para completar.
- **Equipo:** panel de coordinadores y panel de instaladores indispuestos con
  período y justificación.
- **Clientes:** módulo `/clients`, agenda de empresas, ficha de contacto,
  proyectos/puntos vinculados e histórico de órdenes por locación.
- **Mensajería oficial:** módulo `/messages`, una conversación persistente por
  empresa/instalador, visibilidad para gerente y todos los coordinadores, tiempo
  real, adjuntos privados y envío offline idempotente para el instalador. Los
  nombres de instaladores en dashboard, equipo y postulaciones abren su charla.
- **Bolsa de trabajo:** fechas, requisitos, logística, paga opcional visible
  mediante toggle y moneda del proyecto. La tarjeta del instalador muestra toda
  la información relevante.
- **Finanzas:** filtros globales por semana, quincena, mes, semestre y fechas
  personalizadas. Exportación y todos los paneles usan el mismo período.
- **Menú:** Clientes y Mensajería agregados; el lateral minimizable existente se
  conserva. Finanzas se omite completamente para coordinadores.
- **i18n:** nuevas pantallas y controles en español y portugués.

### Base de datos pendiente de aplicar

- Ejecutar completa en Supabase SQL Editor:
  `supabase/migrations/20260724000002_coordinator_clients_messaging.sql`.
- Crea/actualiza roles, invitaciones, asignación de coordinador, clientes,
  placeholders, bolsa ampliada, threads/mensajes/lecturas, bucket privado
  `chat`, realtime y todas las políticas RLS.
- Prueba estructural:
  `supabase/tests/coordinator_rls.test.sql`.
- No abrir las pantallas nuevas en un entorno conectado antes de aplicar esta
  migración: las consultas esperan esas columnas/tablas.

### Verificación

- JSON de traducciones ES/PT: OK.
- TypeScript strict: OK.
- ESLint: 0 errores/advertencias.
- Vitest: **52 pruebas en 12 archivos**, todas OK.
- `next build`: OK; 23 rutas generadas, incluidas `/clients` y `/messages`.
- La CLI de Supabase no está instalada en este entorno, por lo que la migración
  no pudo validarse/aplicarse remotamente desde la terminal.
- Vercel no fue modificado. El siguiente paso después de ejecutar SQL es smoke
  test local con gerente, coordinador e instalador; luego commit/push de `rama1`.

## ACTUALIZACIÓN AUTORITATIVA — tablero gerencial (`rama1`, 2026-07-24)

> Trabajo aislado de `main` en la rama `rama1`. Esta sección es el punto de
> reanudación para el nuevo tablero del gerente/administrador del cliente.

### Implementado

- **Pulso operativo accionable:** alertas enlazables por órdenes atrasadas,
  próximas sin asignar, proyectos con desvío, instaladores no disponibles,
  trabajos esperando aprobación e incidencias prioritarias. Suma alertas de
  clima por zona; no incluye controles de documentación (punto 8 excluido por
  pedido del usuario).
- **Semáforo y pronóstico de proyectos:** en término, en riesgo, atrasado o
  pausado; compara avance real/planificado, proyecta fecha de cierre y calcula
  cuántas instalaciones semanales hacen falta para cumplir.
- **Agenda y capacidad:** próximos siete días, trabajos/asignaciones/cierres por
  día, carga versus instaladores disponibles, jornadas libres y días
  sobrecargados.
- **SLA:** cumplimiento en fecha, tiempo hasta asignación/finalización, demora
  promedio, reprogramaciones, cancelaciones y comparación mensual. La ficha de
  orden permite reprogramar y la base registra el historial automáticamente.
- **Calidad e incidencias:** registro y resolución en la ficha de orden con tipo,
  prioridad, detalle y necesidad de revisita. El tablero muestra incidencias
  abiertas y tasa de resolución en primera visita.
- **Desempeño de instaladores:** cierres, puntualidad, primera resolución,
  duración promedio, reprogramaciones, incidencias, disponibilidad y rating.
- **Mapa Google operativo:** trabajos de los próximos siete días, selector de
  locación, estado, enlace a la orden y apertura en Google Maps; informa además
  la capacidad disponible.
- **Pulso financiero:** contratado, realizado, pendiente, crecimiento y
  proyección mensual separados por ARS/BRL, con acceso al módulo financiero.
- **Acciones rápidas:** accesos a proyecto, orden urgente, asignación,
  reprogramación, aprobación y reporte financiero.
- **Responsive e i18n:** interfaz verificada en escritorio y 375×812, sin
  desborde horizontal, con textos completos en español y portugués.

### Base de datos aplicada por el usuario

- Migración:
  `supabase/migrations/20260724000001_manager_dashboard.sql`.
- Agrega metadatos automáticos a `work_orders` (`assigned_at`,
  `original_scheduled_date`, `reschedule_count`, `visit_count`) y la tabla
  multi-tenant `order_incidents`, con RLS para gerente e instalador.
- Prueba estructural de RLS:
  `supabase/tests/order_incidents_rls.test.sql`.
- El usuario confirmó que esta migración fue ejecutada correctamente en
  Supabase SQL Editor antes de iniciar la ampliación siguiente.

### Verificación de esta rama

- TypeScript strict: OK.
- ESLint: 0 errores/advertencias.
- Vitest: **52 pruebas en 12 archivos**.
- `next build`: OK.
- Playwright: dashboard y ficha de incidencias en escritorio/móvil, sin errores
  de consola. Hasta aplicar la migración, el dashboard remoto no puede leer los
  nuevos campos de órdenes y muestra esas métricas vacías.
- Vercel no fue modificado.

## ACTUALIZACIÓN AUTORITATIVA — ampliación operativa (2026-07-21)

> Esta sección reemplaza el resumen antiguo de “producto terminado” para la
> próxima sesión. El código de la ampliación está completo, las migraciones
> están aplicadas en Supabase y el próximo paso externo es configurar Google
> Calendar en el entorno y desplegar desde GitHub/Vercel.

### Alcance completado en esta sesión

- **Dashboard de empresa reconstruido:** seis métricas solicitadas (proyectos
  activos, órdenes pendientes, trabajos de hoy, completadas hoy, tasa diaria y
  tasa general), clima por zona, estado de Google Calendar, progreso por
  proyecto, órdenes del día, desempeño por zona y disponibilidad/carga de los
  instaladores. Proyectos y órdenes enlazan a sus detalles.
- **Proyectos ampliados:** cliente, cantidad contratada, fechas, descripción,
  país AR/BR, zonas múltiples, modalidad `project`/`per_installation`, importe
  global y moneda. La modalidad puede cambiar sin borrar importes históricos;
  país y zonas en uso quedan protegidos cuando ya existen instalaciones.
- **Administración de instalaciones:** el botón ahora es “Adm. instalaciones”;
  permite ajustar la cantidad contratada, agregar una locación, importar CSV y
  generar órdenes. Las locaciones con historial se archivan; sólo una vacía se
  elimina definitivamente.
- **Ficha permanente del local:** contacto, horarios, acceso, estacionamiento,
  datos técnicos, riesgos, notas, coordenadas, Google Maps, fotos/PDF privados,
  avance histórico y listado enlazable de todas sus órdenes.
- **Órdenes:** filtros por estado, zona, instalador, intervalo de fechas e
  importe mayor/menor. Los importes se habilitan sólo para cobro por instalación.
  Numeración atómica por región: `AMBA-13000`, `INT-700` y `BR-SP-00001`.
- **Disponibilidad de instaladores:** activación global, horario semanal por
  empresa y ausencias justificadas con fecha/hora. El dashboard calcula el
  estado actual usando ambos niveles.
- **Finanzas operativas:** contratado, realizado, pendiente, ticket promedio,
  variación de 30 días, evolución mensual, proyecto/zona/instalador, separación
  ARS/BRL y exportación CSV. Los contratos globales se distribuyen sólo para
  análisis sin duplicar el total autorizado.
- **Menú lateral colapsable:** 248/72 px en escritorio, overlay en móvil y
  preferencia persistida localmente; navegación equivalente en es/pt.
- **Google Calendar unidireccional:** OAuth web con `state` anti-CSRF, acceso
  offline, tokens cifrados AES-256-GCM, alta/actualización idempotente de eventos
  y retiro de eventos de órdenes canceladas. Se controla desde el dashboard.
- **Clima:** Open-Meteo con cache de 30 minutos, temperatura, lluvia, viento y
  severidad para hasta cuatro zonas operativas.

### Base de datos y migraciones

- `20260722000001_operational_foundation.sql` — aplicada al proyecto vinculado.
- `20260722000002_normalize_argentina_zones.sql` — aplicada; normalizó los datos
  ficticios `AR-BA-AMBA`/`AR-CBA` a `AMBA`/`Interior` y renumeró las órdenes.
- Historial local/remoto alineado hasta `20260722000002`.
- Las órdenes existentes eran ficticias y fueron renumeradas según autorización
  del usuario. Verificación visual: `AMBA-13000` e `INT-700` presentes.

### Verificación realizada

- TypeScript strict: OK.
- Vitest: **48 pruebas** (incluye finanzas, zonas, disponibilidad, ficha y
  cifrado de tokens).
- ESLint: 0 errores/advertencias.
- `next build`: OK, incluidas `/dashboard`, `/finance`, ficha de local y las dos
  rutas OAuth.
- Playwright desktop + 375×812: dashboard, finanzas, proyecto, edición, Adm.
  instalaciones, ficha con Maps/archivos y filtros de órdenes verificados.

### Pendientes externos para la próxima sesión

1. **Google Calendar:** crear/seleccionar proyecto en Google Cloud, habilitar
   Calendar API, crear cliente OAuth web, registrar el redirect exacto
   `https://TU-DOMINIO/api/google-calendar/callback` y cargar en Vercel
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y
   `GOOGLE_TOKEN_ENCRYPTION_KEY`. También confirmar `APP_URL`. Sin estas claves
   el dashboard muestra correctamente “pendiente de configuración”.
2. **Resend:** sigue sin haber dominio verificado; `RESEND_FROM_EMAIL` continúa
   pendiente. El enlace manual de invitación sigue funcionando.
3. **Deploy:** los cambios se publican a GitHub `main`; Vercel queda a cargo del
   usuario, como acordado. Agregar allí las variables nuevas antes del redeploy.
4. **Entorno:** actualizar Node local/Vercel a 22+ cuando sea posible; Supabase
   ya anuncia la futura baja de soporte para Node 20.

Las variables necesarias, sin secretos, quedaron enumeradas en `.env.example`.

> Última sesión: 2026-07-21 · Estado: **producto desplegado y en producción
> (Pasos 1-14 completos + mejoras post-lanzamiento).**
> Último cambio funcional en `main`: `db58d21` — ficha avanzada de órdenes.
> Migraciones aplicadas en Supabase y deploy de producción
> `dpl_CA7KUAQADrog4Jef8RnnsshACU94` READY en Vercel.

Registro de avance para retomar la construcción. El plan completo (16 secciones,
14 pasos) está en [`../BLUEPRINT.md`](../BLUEPRINT.md). Las reglas del proyecto
están en [`AGENTS.md`](AGENTS.md).

**Si retomás esta sesión con otra IA o herramienta:** leé primero esta sección
y la de "Pendientes para retomar" más abajo — ahí está todo lo que falta hacer
y quién lo tiene que hacer (vos vs. la IA).

## ⏳ Pendientes para retomar (lo único que falta)

1. **Dominio verificado en Resend + `RESEND_FROM_EMAIL` en Vercel** (opcional
   — el link manual de invitación funciona sin esto). Ver sección C más abajo.
2. **Confirmar una recepción real de Web Push** cuando algún instalador real
   active notificaciones desde su navegador (opcional — la bandeja in-app ya
   funciona sin esto).

La carga masiva de datos demo ya no está pendiente: el 2026-07-21 se verificaron
en Supabase los 40 puntos `SHELL-0021..0060` y sus 40 órdenes, con presencia de
los 7 estados. Nada de lo anterior bloquea el uso del producto; son mejoras de
comodidad.

---

## Qué es

SaaS B2B multi-tenant para que empresas de gráfica de gran formato (ej. Alltak,
Brasil) gestionen equipos de instaladores en proyectos masivos (miles de puntos,
ej. 2000 estaciones de servicio). Tres áreas en una sola app Next.js:

- **Tablero maestro** (`platform_admin`) — nosotros: ABM de empresas.
- **Empresa** (`company_manager`) — el cliente: proyectos, puntos, órdenes, equipo.
- **Instalador** (`installer`) — PWA mobile offline-first.

Fusiona dos proyectos legacy (`../proyecto1*` y `../proyecto2*`), que quedan
**solo como referencia de lógica** — no se copia código.

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript strict · Tailwind v4 ·
shadcn/ui (radix-nova) · Supabase (Postgres + RLS + Auth + Storage) ·
TanStack Query/Table/Virtual · next-intl (es-AR/pt-BR) · Vitest · pnpm.

## Infraestructura

- **Repo:** https://github.com/DrSaturno/saasinstalaciones (rama `main`)
- **Supabase:** proyecto `rpdjjvcmtcpvmwrjqhke` (URL en `.env.local`, NO commiteado)
- **Producción:** https://saasinstalaciones.vercel.app

### Cómo levantar en local
```bash
cd instalapro
pnpm install          # node-linker=hoisted, ver nota de entorno abajo
pnpm dev              # http://localhost:3000
pnpm test             # 34 tests
pnpm build            # verificación completa de tipos
```
Requiere `instalapro/.env.local` con las 3 claves de Supabase (URL, anon,
service_role). Si se pierde, regenerarlo desde el dashboard del proyecto.

### Usuarios de prueba (seed) — contraseña `InstalaPro2026!`
| Email | Rol |
|-------|-----|
| admin@instalapro.dev | platform_admin |
| gerente@demo.dev | company_manager (Gráfica Demo SA) |
| instalador1/2/3@demo.dev | installer |

Datos demo: 1 empresa, 1 proyecto ("Refacción Estaciones Norte"), 20 puntos,
20 órdenes en varios estados, 2 calificaciones.

---

## Pasos completados

- [x] **1 — Scaffolding.** Next 16 + Tailwind v4 + shadcn/ui, design system en
  `globals.css` (tokens de `../letters-app-reference.css`), fuentes Inter +
  Fragment Mono, estructura de carpetas, landing placeholder.
- [x] **2 — Base de datos.** Migración inicial aplicada: 14 tablas, helpers
  `auth_role()`/`auth_company()`, 6 triggers (perfil automático, anti-escalación
  de privilegios, numeración correlativa de órdenes, máquina de estados, cache de
  estado del site, promedio de estrellas), RLS en todas las tablas, función
  `accept_invitation`, bucket `evidence` con políticas. Tipos en
  `types/database.ts`. Seed cargado. **Aislamiento multi-tenant verificado.**
- [x] **3 — Auth + ruteo por rol.** Clientes Supabase browser/server/admin
  (admin con `server-only`: el build falla si se importa fuera de `/api/master`).
  `proxy.ts` (el middleware de Next 16) refresca sesión y rutea por rol. Login
  con Server Action + Zod, guards por rol en cada layout. **Los 3 roles rutean OK.**
- [x] **4 — Tablero maestro.** `/api/master/*` con guard que valida
  `platform_admin` antes de usar `service_role`. Alta de empresa + primer gerente
  (contraseña temporal de un solo uso), suspender/reactivar, métricas globales.
  **Alta de empresa real + aislamiento del nuevo gerente verificados.**
- [x] **5 — Proyectos y puntos.** CRUD de proyectos con % de avance, importación
  masiva CSV en lotes de 500 (parser propio: detecta `;` de Excel es-AR/pt-BR,
  comillas, CRLF, BOM), tabla de puntos virtualizada, dashboard de empresa con
  KPIs. **Importación de 2000 puntos verificada** (2020 en tabla, 24 en DOM,
  búsqueda y filtros instantáneos). 11 tests del parser.

- [x] **6 — Órdenes de trabajo.** Vista `/orders` con tabla virtualizada,
  resumen por estado y filtros (estado, instalador, búsqueda). Detalle de orden
  con punto, historial (`order_updates`) y panel de acciones. Creación masiva
  "una por punto" en lotes (idempotente: saltea puntos con orden abierta) y
  creación individual. **Máquina de estados** vía `lib/actions/orders.ts`
  (`transitionOrder`) que espeja `lib/domain/transitions.ts`. Asignación de
  instalador validada contra el roster activo. **Verificado:** transición
  pendiente→planificada→en_proceso con historial, asignación persistida, y el
  trigger de la DB **rechaza saltos ilegales** (planificada→finalizada = 400) —
  la regla #4 se cumple aunque se saltee la UI. Generación masiva probada
  (DEM-00021..25 correlativos). Nota: DEM-00007 quedó en_proceso/Iván por el test
  (las transiciones no son reversibles por diseño).

- [x] **7 — Invitaciones y roster.** Vista `/team`: roster activo (nombre,
  zonas, rating, órdenes abiertas), invitaciones pendientes, invitar/quitar/
  reactivar (`lib/actions/team.ts`). `inviteInstaller` genera link compartible
  `/invite/<token>` (dedup por email pendiente); quitar del equipo libera las
  órdenes no terminadas. Página pública `/invite/[token]` maneja token inválido,
  sin sesión, rol equivocado e instalador (acepta vía RPC `accept_invitation`).
  **Migración `20260720000002_invitation_preview` aplicada** (función security-
  definer que muestra la empresa sin exponer `invitations`). **Verificado E2E:**
  invitar → aceptar como instalador3 → se une al roster → quitar → reactivar,
  todo OK. Datos demo restaurados a 2 instaladores.

- [x] **8 — PWA del instalador (online).** Área installer mobile-first.
  `/tasks`: órdenes asignadas ordenadas por accionabilidad (RLS filtra por
  `assigned_installer_id`). `/tasks/[id]`: detalle con "Cómo llegar" (Maps),
  iniciar trabajo (planificada→en_proceso + checkin), cargar avances/bloqueos
  con foto opcional (`order_updates`, foto al bucket `evidence`), marcar
  terminado (en_proceso→en_revision + done). `lib/actions/tasks.ts`: mutaciones
  **idempotentes** (updateId uuid del cliente, upsert ignoreDuplicates) para el
  offline del Paso 9. Manifest PWA (`app/manifest.ts`) + íconos 192/512,
  standalone, start_url `/tasks`. **Verificado E2E:** ciclo iniciar→avance→
  terminar con historial; **RLS aísla al instalador** (Iván ve solo sus 11
  órdenes, 0 ajenas). Nota: DEM-00006 se finalizó y calificó en el Paso 10;
  DEM-00007 quedó en_proceso por los tests.

- [x] **9 — Offline del instalador.** Cola de mutaciones en Dexie
  (`lib/offline/`): db, `sync.ts` (enqueue + flush idempotente vía cliente
  browser Supabase, RLS aplica), `use-sync.ts` (hook online/offline + auto-flush
  al reconectar/intervalo). `task-actions` reescrito: encola en vez de Server
  Action, UI optimista (setStatus local). Fotos diferidas (blob en Dexie, sube
  al reconectar). `SyncIndicator` en el shell installer. **SW propio**
  (`public/sw.js`, NO Serwist: no soporta Turbopack) con SWR para estáticos y
  network-first para navegaciones `/tasks`; registrado sólo en prod y área
  installer. **Verificado E2E:** offline→cargar avance→queda en outbox IndexedDB
  →online→auto-flush→llega a la DB. Nota: el historial server-rendered no
  refleja lo encolado hasta sincronizar (el status sí, optimista). SW se prueba
  en prod (Vercel), no en dev.

- [x] **10 — Calificaciones.** `rateInstaller` valida con Zod, reautentica al
  manager y deriva `company_id` + instalador desde la orden finalizada. Al
  aprobar desde `en_revision` se abre un diálogo con 1-5 estrellas y comentario
  opcional; también se puede calificar después desde la orden finalizada. El
  rating y su cantidad aparecen en roster y selector de asignación. Nueva vista
  mobile-first `/profile` con promedio global, zonas, especialidades y últimas
  reseñas. `StarRating` accesible y reutilizable. **Verificado E2E a 375 px:**
  DEM-00006 → finalizada + 5 estrellas → promedio de Iván 5.0 (1) y reseña
  visible en su perfil. El shell responsive se corrigió tras detectar overflow.
  La migración `20260720000003_rating_integrity.sql` fue aplicada y confirma en
  DB que no se puede calificar a un instalador distinto del asignado.

- [x] **11 — Bolsa de zona + notificaciones (código).** `/broadcasts` funciona
  como tablero operativo de empresa: alta/edición/cierre de búsquedas por zona,
  pipeline de candidatos y aceptación atómica que suma al roster y puede asignar
  órdenes del proyecto. `/jobs` es la experiencia mobile-first del instalador,
  filtrada por RLS según sus zonas, con postulación idempotente por clave compuesta
  e historial de resolución. La migración `20260720000004_broadcasts_notifications.sql`
  endurece postulaciones, conserva la lectura tras cerrar, agrega RPCs atómicas y
  genera notificaciones para nuevas búsquedas, postulaciones, asignaciones y
  avances. Campanita realtime compartida, marcado leído y suscripciones Web Push.
  El push se despacha en la Edge Function `send-event-push`: revalida actor y
  recurso antes de usar service role, limpia endpoints vencidos y deduplica con
  `push_sent_at`; si VAPID no está configurado, la app sigue completa in-app.
  **Verificado:** 19 tests, TypeScript, lint 0 errores, build de producción; E2E
  escritorio de `/broadcasts` y E2E a 375 px de `/jobs`, incluida postulación real
  de `instalador3`, sin errores de consola. La migración 00004 ya fue aplicada.
  **E2E posterior a migración:** Carlos fue aceptado, se sumó al roster,
  `DEM-00009` se asignó en la misma transacción, la búsqueda cerró en 1/1 cupos
  y recibió las dos notificaciones esperadas; el marcado como leído también fue
  verificado. Durante esta prueba se corrigió la validación para aceptar UUID
  históricos de Postgres sin bits RFC de versión. **Web Push activado y probado
  en producción el 2026-07-21:** Edge Function `send-event-push` ACTIVE, secretos
  VAPID correctos en Supabase y clave pública disponible en Vercel. Un smoke test
  autenticado recorrió trigger → notificación → función (HTTP 200), marcó el
  aviso como procesado y eliminó todos los datos temporales.

- [x] **12 — i18n es-AR + pt-BR.** `next-intl` quedó integrado en el
  layout raíz, metadata y manifest; todos los textos visibles de las áreas
  pública, maestra, empresa e instalador viven en catálogos equivalentes
  `messages/es.json` y `messages/pt.json`. El selector compartido persiste la
  preferencia en `profiles.locale`, sincroniza una cookie HttpOnly y la recupera
  incluso después de cerrar sesión y volver a entrar. Estados, errores de Server
  Actions y API, fechas y textos accesibles también se localizan. La migración
  `20260720000005_i18n_notifications.sql` genera en español o portugués las
  notificaciones creadas por triggers/RPC según el perfil destinatario. Se quitó
  además del menú maestro el enlace muerto a `/master/installers`, que provocaba
  404 de precarga. **Verificado:** paridad de catálogos, 23 tests, TypeScript,
  lint sin errores y build de producción; E2E real en los tres roles, persistencia
  tras recarga y nuevo login, `lang="pt-BR"`, fechas localizadas y viewport de
  375 px sin overflow. Las cuentas demo fueron restauradas a español al terminar.
  **Migración 00005 aplicada y verificada en Supabase:** un evento temporal para
  `instalador3@demo.dev` generó `Novo trabalho na sua região` con `data.locale = pt`.
  El broadcast y las notificaciones temporales se eliminaron, y el perfil volvió
  a `es`; la prueba terminó sin residuos.

- [x] **13 — Landing + pulido.** Landing pública rediseñada y presentable a un
  prospecto (`app/page.tsx`): header con marca + selector de idioma + Ingresar,
  hero con badge/CTAs, sección "para quién", 3 pilares (empresa/instalador/
  control), grid de 6 features, CTA final (mailto ventas) y footer. Todo vía
  `next-intl` (namespace `Landing` ampliado en es+pt, con paridad testeada).
  **Estados globales nuevos:** `app/error.tsx` (boundary localizado con
  reintento), `app/not-found.tsx` (404 localizado), `app/global-error.tsx`
  (fallback último con diccionario embebido es/pt — única excepción a la regla
  #4, documentada). **Skeletons de carga** por área: `(company)/loading.tsx`,
  `(installer)/loading.tsx`, `(master)/loading.tsx`. **Iconos PWA finales:**
  grilla 3×3 de puntos sobre la marca (192/512 + apple-touch-icon 180),
  enlazados en metadata (`icon`, `apple`). Namespace `AppStates` en es+pt.
  **Verificado E2E:** 23 tests (incluye paridad i18n), lint 0 errores, build de
  producción; landing en es y pt (`lang="pt-BR"`, textos traducidos), 404
  localizado para usuario autenticado, sin overflow a 375px ni en desktop, sin
  errores de consola, manifest sirviendo los 3 iconos. Cuentas demo sin cambios.

- [x] **14 — Deploy + auditoría de seguridad.** Auditoría `cyber-neo` completa
  (191 archivos, scan full). **Risk score 8/100 (Bajo).** 0 críticas, 0 altas,
  2 medias, 2 bajas. Reporte en `~/Escritorio/cyber-neo-report-instalapro-
  2026-07-20.md`. **Medios corregidos y verificados:** (CN-001) open-redirect en
  el login vía `next=//evil.com` — ahora rechaza protocol-relative/backslash
  (verificado: `//evil.com`→/dashboard, `/orders`→/orders); (CN-002) headers de
  seguridad globales en `next.config.ts` (X-Frame-Options DENY, nosniff,
  Referrer-Policy, HSTS — verificados por HEAD). **Bajas documentadas (no
  bloqueantes):** postcss transitiva (build-time) y CORS wildcard en la Edge
  Function (mitigada por auth de token). **Postura fuerte confirmada:** RLS en 14
  tablas/36 políticas, service_role aislado con `server-only`, cero XSS/SQLi/
  inyección, cero secretos commiteados, CSPRNG, máquina de estados en DB,
  idempotencia offline. Producción activa en `saasinstalaciones.vercel.app`.
  Recomendación de endurecimiento futuro: CSP con nonces.

---

## Estado de producción y pendientes opcionales

### A. Deploy a Vercel
- ✅ Proyecto conectado, variables Supabase configuradas y producción activa en
  `https://saasinstalaciones.vercel.app`.

### B. Activar Web Push (opcional — la bandeja in-app ya funciona sin esto)
1. ✅ Claves VAPID generadas (2026-07-21), guardadas en
   `~/Escritorio/vapid-keys-instalapro.txt` (no commiteado).
2. ✅ Cargadas en **Supabase → Edge Functions → Secrets**: `VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
3. ✅ Edge Function `send-event-push` desplegada (versión 1, estado ACTIVE).
   Se corrigieron sus imports para Deno usando paquetes `npm:` versionados.
4. ✅ **RESUELTO Y VERIFICADO (2026-07-21).** La variable estaba cargada en
   Vercel sin el prefijo (`VAPID_PUBLIC_KEY`), así que Next no la exponía al
   cliente y el toggle quedaba "Pendiente de configuración". Se recreó como
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY` y se redeployó (commit `32e87eb`). Verificado
   en prod: el payload RSC de `/dashboard` ahora trae `"vapidPublicKey":"BIVqG5…"`
   (antes `null`) y el botón "Activar" quedó habilitado. Lección: toda env var
   que el navegador deba leer necesita el prefijo `NEXT_PUBLIC_`; cambiarla en
   Vercel exige redeploy. La clave se lee en un Server Component y viaja como
   prop en el HTML/RSC, no en los chunks JS (a diferencia del ref de Supabase).
5. ✅ Smoke test backend autenticado: HTTP 200, una notificación procesada,
   `delivered: 0` porque las cuentas demo todavía no tienen dispositivos
   suscriptos. Datos temporales eliminados. `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT`
   se retiraron de Vercel; sólo permanecen donde corresponden, en Supabase.

### C. Email de invitaciones (opcional)
- ✅ Integración Resend implementada en la Server Action: contenido es/pt,
  HTML escapado, clave de idempotencia por invitación y fallback al link manual
  ante falta de configuración o error del proveedor. La UI informa si el email
  fue enviado o si hay que compartir el link. `APP_URL` ya está configurada en
  Vercel y `RESEND_API_KEY` existe como secreto.
- ⏳ Para activar el envío real falta verificar un dominio en Resend y definir en
  Vercel `RESEND_FROM_EMAIL` (por ejemplo,
  `Instala Pro <invitaciones@tu-dominio.com>`), seguido de un redeploy.
- **Validación:** 34 tests, TypeScript, lint sin errores y build de producción.

### Mejoras post-lanzamiento

- **Ficha avanzada de órdenes — EN PRODUCCIÓN (2026-07-21, commit `db58d21`).**
  Se tomó `../proyecto1 ANTIGRAVITY-PRUEBA-2-main` como referencia funcional
  (sin copiar código) y se reemplazó el alta mínima por una ficha operativa
  completa en `/orders`: proyecto/cliente y punto, título, estado inicial
  controlado, fechas de inicio/fin, prioridad, lugar techado, descripción,
  requisitos logísticos, flete y detalle, importe con moneda ARS/BRL, y hasta
  10 imágenes/PDF de 10 MB. El selector permite elegir **un instalador
  responsable** exclusivamente del roster activo; se mantiene ese único
  responsable porque la PWA, RLS, historial y calificación de cada orden están
  ligados a una persona. La asignación inicial ahora genera la misma
  notificación in-app que una asignación posterior.

  Los adjuntos suben directo al bucket privado `evidence` para no pasar archivos
  grandes por Server Actions/Vercel, se registran en `order_attachments` con
  `company_id`, FK compuesta y RLS de manager/instalador asignado, y se muestran
  con URLs firmadas tanto en el detalle de empresa como en `/tasks/[id]`.
  Migraciones `20260721000001_order_intake.sql` y
  `20260721000002_order_assignment_on_create.sql` aplicadas. También se
  reconciliaron en `supabase_migrations.schema_migrations` las cinco migraciones
  anteriores que estaban aplicadas manualmente, por lo que `supabase db push`
  vuelve a ser la vía normal de despliegue.

  **Verificado E2E:** desktop y 375 px, carga proyecto→60 puntos, alta real con
  Iván, planificación, flete, importe `$ 125.000,50`, imagen privada visible y
  notificación creada. Orden, archivo y notificación QA eliminados sin residuos.
  34 tests, TypeScript, lint 0 errores y build de producción OK.

- **Carga masiva demo — COMPLETA Y VERIFICADA (2026-07-21).**
  `supabase/seed_demo_bulk.sql` ya fue ejecutado. Consulta de control contra
  Supabase: 40 puntos `SHELL-0021..0060`, 40 órdenes asociadas y cobertura de
  `pendiente`, `relevamiento`, `planificada`, `en_proceso`, `en_revision`,
  `finalizada` y `cancelada`. El script permanece idempotente para futuras
  reconstrucciones del entorno demo.

- **Auto-registro de instalador por invitación — EN PRODUCCIÓN (2026-07-21,
  commit `2212ae1`).** Antes, un instalador sin cuenta que abría
  `/invite/<token>` era mandado a "Iniciar sesión" — callejón sin salida (no
  tenía usuario). Ahora esa pantalla muestra un **formulario de alta** (nombre
  + contraseña; el email viene de la invitación, bloqueado). Al enviar:
  `signUpInstaller` (Server Action en `lib/actions/invite-signup.ts`) crea el
  usuario vía `admin.createUser` con **rol fijo `installer` server-side** (el
  cliente nunca controla el rol → sin escalación de privilegios), lo loguea y
  acepta la invitación con la RPC `accept_invitation` ya vetada; redirige a
  `/tasks`. Quien ya tiene cuenta usa el link "¿Ya tenés cuenta? Iniciar
  sesión". `admin.ts` ahora se permite también en ese archivo (documentado en
  AGENTS.md). **Verificado E2E dos veces:** (1) en local, alta real de un
  instalador de prueba → landing en `/tasks` con su nombre, y en DB
  `profiles.role=installer`, fila `installers`, `company_installers.status=active`
  e invitación `accepted`, cuenta de prueba eliminada sin huérfanos; (2) en
  **producción**, tras el deploy (`dpl_5uYkVYch1JP5d9JS551i4tipBWqE`, READY),
  se confirmó que `saasinstalaciones.vercel.app/invite/<token>` sirve el
  formulario de alta correcto; invitación de prueba creada y eliminada por API
  REST sin dejar residuos. 27 tests, build y lint OK; paridad i18n es/pt
  (517=517 claves).

### D. Endurecimiento futuro (recomendado, no bloqueante)
- Agregar una CSP con nonces (los otros headers de seguridad ya están).
- `pnpm.overrides` de `postcss@>=8.5.10` cuando Next lo permita.

## Pasos siguientes (resumen)
Producto terminado y desplegado. Ver "⏳ Pendientes para retomar" al principio
de este documento para la lista completa y actualizada.

---

## Notas de entorno (importantes)

- **`node-linker=hoisted` en `.npmrc`:** Turbopack no resuelve los symlinks de
  pnpm en esta ruta (Windows + OneDrive) → "Module not found" en deps de Radix.
  Con node_modules plano funciona. Instalar siempre desde PowerShell nativo, no
  Git Bash (los symlinks quedan con rutas `/c/...` que Windows no sigue).
- **Traducción del navegador:** al pegar SQL en el editor de Supabase, desactivar
  la traducción automática de Chrome — traduce las palabras clave (`create` →
  "crear") y rompe el script. Usar vista raw de GitHub.
- **Seed de auth:** al insertar en `auth.users` a mano, las columnas de token van
  en `''` y no `NULL`, o el login falla con "Database error querying schema".
  Ya corregido en `supabase/seed.sql`.
- **Migraciones:** la CLI está vinculada al proyecto `rpdjjvcmtcpvmwrjqhke` y
  el historial remoto ya fue reconciliado. Usar `supabase db push --linked`;
  recurrir al SQL Editor sólo si la CLI pierde autenticación.
- **Vitest:** config en `.mts` (no `.ts`) por resolución ESM/CJS en este entorno.
- El proxy deja pasar `/api/*` sin redirigir a login (responden su propio JSON).

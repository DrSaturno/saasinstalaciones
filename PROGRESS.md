# Instala Pro — Estado del proyecto

> Última sesión: 2026-07-20 · Estado: **construcción COMPLETA (Pasos 1-14).**
> Pendiente del usuario: deploy Vercel + activación Web Push (ver abajo).

Registro de avance para retomar la construcción. El plan completo (16 secciones,
14 pasos) está en [`../BLUEPRINT.md`](../BLUEPRINT.md). Las reglas del proyecto
están en [`AGENTS.md`](AGENTS.md).

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
- **Deploy:** todavía no (Vercel — Paso 14)

### Cómo levantar en local
```bash
cd instalapro
pnpm install          # node-linker=hoisted, ver nota de entorno abajo
pnpm dev              # http://localhost:3000
pnpm test             # 23 tests
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
  históricos de Postgres sin bits RFC de versión. **Pendiente de infraestructura:**
  generar y guardar secretos VAPID, desplegar la Edge Function y configurar
  la clave pública en Vercel.

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

## Activación pendiente del Paso 11

1. Generar un nuevo par de claves VAPID y guardar en Supabase Edge Functions
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT`.
2. Desplegar `send-event-push`, preparado en el editor web, o ejecutar:
   `npx supabase functions deploy send-event-push --project-ref rpdjjvcmtcpvmwrjqhke --use-api`.
3. En Vercel definir `NEXT_PUBLIC_VAPID_PUBLIC_KEY` y volver a desplegar.

Después de esto, verificar aceptar/rechazar la postulación demo desde empresa y
el push real en un dispositivo. La bandeja in-app queda activa apenas se aplica
la migración, aun antes de configurar VAPID.

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
  idempotencia offline. Recomendación de endurecimiento futuro: CSP con nonces.

---

## PENDIENTE DEL USUARIO (infraestructura — no es código)

La construcción está completa. Falta lo que requiere tus credenciales:

### A. Deploy a Vercel
- El build de producción pasa en local. Conectá el repo a Vercel (si no está) y
  configurá las env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`. Redeploy.

### B. Activar Web Push (opcional — la bandeja in-app ya funciona sin esto)
1. ✅ Claves VAPID generadas (2026-07-21), guardadas en
   `~/Escritorio/vapid-keys-instalapro.txt` (no commiteado).
2. ✅ Cargadas en **Supabase → Edge Functions → Secrets**: `VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
3. ⏳ **Pendiente:** desplegar la función (requiere login CLI del usuario, la
   conexión Supabase de la sesión ve otra cuenta):
   `npx supabase functions deploy send-event-push --project-ref rpdjjvcmtcpvmwrjqhke --use-api`
4. ✅ **RESUELTO Y VERIFICADO (2026-07-21).** La variable estaba cargada en
   Vercel sin el prefijo (`VAPID_PUBLIC_KEY`), así que Next no la exponía al
   cliente y el toggle quedaba "Pendiente de configuración". Se recreó como
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY` y se redeployó (commit `32e87eb`). Verificado
   en prod: el payload RSC de `/dashboard` ahora trae `"vapidPublicKey":"BIVqG5…"`
   (antes `null`) y el botón "Activar" quedó habilitado. Lección: toda env var
   que el navegador deba leer necesita el prefijo `NEXT_PUBLIC_`; cambiarla en
   Vercel exige redeploy. La clave se lee en un Server Component y viaja como
   prop en el HTML/RSC, no en los chunks JS (a diferencia del ref de Supabase).

### C. Email de invitaciones (opcional)
- Setear `RESEND_API_KEY` si querés que las invitaciones se manden por email en
  vez de compartir el link a mano.

### D. Endurecimiento futuro (recomendado, no bloqueante)
- Agregar una CSP con nonces (los otros headers de seguridad ya están).
- `pnpm.overrides` de `postcss@>=8.5.10` cuando Next lo permita.

## Pasos siguientes (resumen)
14 — Deploy + `/cyber-neo` (último).

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
- **Migraciones:** se aplican a mano en el SQL Editor de Supabase (el MCP de
  Supabase de la sesión no ve este proyecto). Copiar desde la vista raw de GitHub.
- **Vitest:** config en `.mts` (no `.ts`) por resolución ESM/CJS en este entorno.
- El proxy deja pasar `/api/*` sin redirigir a login (responden su propio JSON).

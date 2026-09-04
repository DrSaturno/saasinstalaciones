# Auditoría de seguridad — Se Instala

**Fecha:** 2026-09-04 · **Objetivo:** OWASP Top 10 2025 + ASVS Level 2 ·
**Alcance:** pre-producción.

> **Estado de remediación (Bloque A — P1):** SEC-01, SEC-02 y SEC-03
> **CORREGIDOS** en `supabase/migrations/20260908000005_rpc_execute_hardening.sql`,
> aplicados a Demo y verificados remotamente (los cuatro ataques confirmados
> ahora dan `401 permission denied`; el camino autenticado sigue intacto; pgTAP
> `rpc_execute_hardening` 12/12). La misma migración cierra un BOLA adicional
> hallado durante el fix: `reputation_contributions` filtraba el detalle por
> evento con `company_id` a cualquier usuario, salteando el filtro por empresa
> de `reputation_detail` (DEC-17).
>
> **SEC-04 CORREGIDO** — `xlsx` fijado a la build oficial de SheetJS
> `0.20.3` (`https://cdn.sheetjs.com/...`), que corrige el prototype pollution
> y el ReDoS. Se conserva SheetJS (no exceljs) a propósito: su tolerancia con
> dialectos de `.xlsx` es la que el importador necesita. Misma API, sin cambio
> de código; `pnpm audit --audit-level=high` ya no lista `xlsx`.
>
> **SEC-05 y SEC-09 CORREGIDOS** — `supabase/migrations/20260908000006_storage_hardening.sql`
> fija `allowed_mime_types` + `file_size_limit` en los buckets. `avatars`
> (público) queda restringido a imágenes de trama: verificado
> empíricamente en Demo con una sesión real — subir `image/svg+xml` da
> **400 `invalid_mime_type`**, un PNG entra. `evidence` a imágenes+PDF,
> `chat` sólo con límite de tamaño (transporta documentos, es privado y
> aislado). Resto (P2/P3): pendientes.
>
> **Con esto los cuatro P1 (SEC-01..05) están cerrados.**
>
> **Bloque B (P2/P3) — en curso:**
> - **SEC-06 (parcial):** `shadcn` movido a `devDependencies` (era CLI, no se
>   importa en runtime). El árbol de **producción** baja de 17 a **6** vulns
>   high; las 6 restantes son DoS de build en transitivas de `next`/`exceljs`
>   (browserslist, nanoid, brace-expansion), sin exploit en esta app (requieren
>   config/args controlados por el atacante) — **se aceptan como residual** en
>   vez de forzar overrides que saltan de versión mayor (nanoid 3→6 rompía
>   next). Se limpian cuando se actualice el framework.
> - **SEC-14 CORREGIDO y DESPLEGADO**: la Edge Function `send-event-push` ya
>   autoriza `announcement` y `blocker_reported` (mismo patrón que
>   `update_received`/`order_assigned`). **Redeployada a producción (v3)** el
>   04-09-2026 y verificada por MCP (`get_edge_function` → version 3, ambas ramas
>   presentes). No viaja con las migraciones: requiere `supabase functions deploy`.
> - **SEC-08 CORREGIDO y ACTIVO en prod**: rate limiting distribuido con Upstash
>   Redis (`lib/security/rate-limit.ts`), aplicado a login (8/5min por IP),
>   recuperación de contraseña (5/15min por IP, respuesta uniforme), export de
>   locaciones (20/h por usuario) y verificación MFA (`mfa_verify`, 10/5min).
>   **Degrada a no-op sin las env vars**, así que dev/CI andan igual. En prod se
>   aprovisionó Upstash por la integración de Vercel, que inyecta
>   `KV_REST_API_URL`/`KV_REST_API_TOKEN`; por eso `client()` lee ambas
>   convenciones (`UPSTASH_REDIS_REST_URL`/`TOKEN` preferido, `KV_*` como
>   fallback). Falla abierto ante error de Redis (un problema del limitador no
>   puede dejar a la gente afuera de su cuenta). Test del no-op incluido.
> - **SEC-07 CORREGIDO** (código): la CSP pasó de `Report-Only` (que no
>   bloqueaba ni reportaba) a **enforcing**. Se conserva `unsafe-inline`
>   (Next/Radix), se saca `unsafe-eval` en producción, y se endurece el resto.
>   Verificado: el header sale enforcing y bien formado (preview de Vercel), y
>   login/dashboard/settings **hidratan sin ninguna violación de CSP** (dev
>   local contra Demo). El salto a nonce+strict-dynamic (para quitar
>   `unsafe-inline`) queda pendiente: fuerza render dinámico y toca el caché del
>   PWA.
> - **SEC-11 BLOQUEADO POR PLAN — residual aceptado.** La protección de
>   contraseñas filtradas (HIBP) **sólo está disponible en plan Pro**. El
>   proyecto está en Hobby/Free, así que al intentar guardarlo el dashboard
>   devuelve "available on Pro Plans and up" y el advisor lo sigue marcando
>   deshabilitado. Es un control **preventivo P2**, no una vulnerabilidad viva:
>   se acepta como residual hasta que se suba a Pro (donde es un toggle inmediato).
> - **SEC-13 CORREGIDO y ACTIVO en prod**: segundo factor TOTP con la API MFA de
>   Supabase Auth. **TOTP habilitado a nivel proyecto en producción** (sin eso el
>   enrolamiento obligatorio falla). **Obligatorio para `platform_admin` y `company_manager`**
>   (`MFA_REQUIRED_ROLES` en `lib/data/two-factor.ts`), **opcional para el
>   instalador**. El enrolamiento forzado y el step-up se resuelven en los
>   layouts de `(company)`/`(master)` (`twoFactorGate`) y en `loginAction`; el
>   área installer nunca invoca el gate, así que un instalador jamás es forzado.
>   La ruta `/two-factor/*` vive fuera de los route groups de rol para no entrar
>   en loop de redirección. `confirmTotpEnrollment`/`verifyTotpChallenge` pasan
>   por el rate-limiter (`mfa_verify`, 10/5min). Verificado end-to-end en Demo
>   con navegador real y TOTP RFC-6238 calculado con Web Crypto: (1) gerente sin
>   factor → `/two-factor/setup` → activar → `/dashboard` con sesión en AAL2;
>   (2) tras cerrar y volver a entrar → `/two-factor/verify` → código → dashboard;
>   (3) instalador no forzado (garantía arquitectónica + `two-factor.test.ts`
>   5/5). Datos de prueba de Demo limpiados. **No lleva migración** — usa las
>   tablas de MFA nativas de Supabase Auth.
> - **Config de prod — NO prender el Captcha de Supabase Auth.** La app no
>   implementa captcha; si se habilita "Enable Captcha protection", Supabase le
>   exige un token a cada login/registro y **rompe todos los ingresos**. Quedó
>   apagado a propósito. Prenderlo sólo si antes se integra hCaptcha en la app.
> - **SEC-12 VERIFICADO — bajo riesgo, sin acción.** Las 14 funciones que marca
>   el advisor son todas `SECURITY INVOKER` (corren con los privilegios del que
>   llama, no elevan). Las `SECURITY DEFINER` ya tienen `search_path` fijo. Dos
>   de las marcadas (`immutable_unaccent`, `tokenizable_words`) alimentan
>   índices de búsqueda: alterarlas es riesgo real por beneficio marginal. Se
>   deja como hygiene opcional para más adelante.
> - **SEC-10 REEVALUADO — no es un hueco de seguridad.** Verificado
>   empíricamente: la policy `evidence_read`/`evidence_company_delete` usa
>   `storage.foldername(name)` dentro de un subquery `sites s`, donde `name`
>   resuelve a `sites.name` (no `objects.name`). Sobre un nombre de sitio real,
>   `foldername(...)` da `[]` y `[2]` es NULL → `s.id = NULL` **nunca** concede.
>   **Falla cerrado:** no hay fuga; es un bug de funcionalidad (los
>   coordinadores no leen evidencia a nivel sitio por esa rama). Fuera del
>   alcance de seguridad; se deja anotado para un fix de corrección aparte.

> Las pruebas dinámicas se ejecutaron **exclusivamente contra Demo**
> (`krxewmfauohixmmzsvkp`) y contra la base por SQL. En producción sólo se
> leyó/ajustó configuración (permisos de función, límites de bucket); **no se
> ejecutó ninguna RPC con efectos** ni se inyectó dato alguno.

Cada hallazgo se marca como **[CONFIRMADO]** (probado empíricamente),
**[POTENCIAL]** (código indica el riesgo, falta prueba dinámica) o
**[PREVENTIVO]** (recomendación de endurecimiento).

---

## 1. Resumen de arquitectura de seguridad

| Capa | Tecnología | Postura |
|---|---|---|
| Framework | Next.js 16.2.12 (App Router) + React 19.2.4 + TS strict | Server Components + Server Actions |
| Auth | Supabase Auth (GoTrue), contraseña + OTP de recuperación/invitación | Hash bcrypt delegado a Supabase |
| Sesión | Cookies `@supabase/ssr`, HttpOnly + SameSite=Lax, rotación en `getUser()` | Refresh en `proxy.ts` en cada request |
| AuthZ | RLS en Postgres (fuente de verdad) + guardas en Server Actions | Denegación por defecto |
| Multi-tenant | `company_id` + RLS por tenant en toda tabla de dominio | Aislamiento fuerte a nivel fila |
| Datos | Supabase Postgres 17, `@supabase/supabase-js` (no ORM) | RLS activa en las 100% de las tablas `public` |
| Archivos | Supabase Storage: `avatars` (público), `chat`/`evidence` (privados) | Policies por path/tenant |
| `service_role` | `lib/supabase/admin.ts` con `server-only` | 2 sitios de import: `/api/master/**` e `invite-signup` |
| Secretos | Variables de entorno; cifrado de tokens Google con AES-256-GCM | Sin secretos en repo ni historial |
| Cabeceras | HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy | CSP en **Report-Only** |

**Controles fuertes ya presentes** (ver §5). El grueso del riesgo residual está
en **una sola clase de problema**: RPCs `SECURITY DEFINER` expuestas a `anon`
sin guarda interna, y en la cadena de suministro de dependencias.

---

## 2. Superficie de ataque

**Roles:** `platform_admin` (tablero maestro, `service_role`), `company_manager`
(empresa, atado a un tenant), `installer` (PWA; "coordinator" es una membresía
por empresa dentro del área instalador). `anon` (sin sesión).

**Puntos de entrada:**
- 10 rutas `/api` (2 con `service_role` tras guarda `platform_admin`; 1 OAuth
  Google; 2 exportan Excel; 1 PDF; 1 reporte de import).
- ~100 Server Actions en 40 archivos.
- **PostgREST directo** (`/rest/v1/rpc/*`) con la **anon key pública** — éste es
  el borde más subestimado: cualquiera con la anon key (embebida en el cliente)
  puede llamar cualquier RPC con `EXECUTE` para `anon`.
- Edge Function `send-event-push` (verifica JWT + autoriza recurso).
- Subida de archivos: avatar, evidencia de órdenes, adjuntos de chat, import de
  locaciones (`.xlsx`/`.csv`).

**Límites de confianza:** navegador → proxy (refresca sesión, rutea por rol) →
Server Action/Route (guarda) → Postgres (RLS). **PostgREST saltea el proxy y las
guardas de aplicación** y queda sólo con RLS + los `GRANT EXECUTE` de las RPC.

**Servicios externos:** Supabase (Auth/DB/Storage/Realtime/Edge), Google Calendar
(OAuth), Resend (emails), Web Push (VAPID).

**Datos sensibles:** PII de instaladores y clientes (nombre, email, dirección,
lat/lng), reputación/confiabilidad, tokens OAuth de Google (cifrados), datos
operativos por tenant.

---

## 3. Hallazgos P0 y P1

| ID | Sev | Categoría | Ubicación | Evidencia | Escenario | Impacto | Prob. | Solución propuesta |
|---|---|---|---|---|---|---|---|---|
| **SEC-01** | **P1** | Broken Access Control (API) — data tampering | 103 funciones `SECURITY DEFINER` con `GRANT EXECUTE` a `anon`; subconjunto **sin** guarda interna | **[CONFIRMADO]** en Demo, rol `anon` sin claims: `emit_reliability_event(...)` insertó un evento de confiabilidad negativo para un instalador arbitrario (eventos 1→2). `emit_performance_event` tiene la misma forma (insert puro sin auth). | Un atacante con la anon key pública llama `POST /rest/v1/rpc/emit_reliability_event` e inyecta faltas o rachas falsas contra cualquier instalador, envenenando el sistema de reputación entre tenants. | Integridad del núcleo de reputación/confiabilidad; difamación de instaladores; corrupción de datos que alimentan decisiones de negocio. | Media | `REVOKE EXECUTE ... FROM anon, authenticated` en las funciones internas/de trigger; para las RPC legítimas de usuario, agregar guarda `auth_role()`/`auth.uid()` al inicio y limitar el `GRANT` al rol correcto. |
| **SEC-02** | **P1** | Sensitive Data Exposure (unauth) | `reputation_summary`, `reputation_contributions`, `reputation_summaries`, `installer_streak`, `order_min_photos`, `order_condition_snapshot`, `announcement_audience`, `estimated_travel_minutes`, `installer_*` (varias) | **[CONFIRMADO]** remoto contra Demo: `POST /rest/v1/rpc/reputation_summary` con la anon key → **HTTP 200** con `{score, faults, streak, completed, sample_size...}` de un instalador, **sin sesión**. | Sin autenticarse, se enumera y lee reputación, disponibilidad, roster (`announcement_audience(company,{})` devuelve instaladores activos de cualquier empresa) y datos operativos de cualquier tenant. | Fuga de PII y datos de negocio entre organizaciones; enumeración masiva. | Media | Igual que SEC-01: `REVOKE` de `anon` en las de lectura interna; añadir chequeo de pertenencia/tenant en las que deban seguir siendo llamables. |
| **SEC-03** | **P1** | Broken Access Control — job sin auth | `public.run_reliability_jobs()` (`GRANT EXECUTE` a `anon`) | **[CONFIRMADO]** remoto: `POST /rest/v1/rpc/run_reliability_jobs` con la anon key → **HTTP 200** `{ran_at, timeouts, reminders}`. Es el job que también corre por `pg_cron`. | Cualquiera dispara el procesamiento de timeouts/recordatorios a voluntad (abuso/DoS lógico, condiciones de carrera con el cron, emisión de recordatorios fuera de tiempo). | Disrupción de la lógica temporal de confiabilidad. | Media | `REVOKE EXECUTE ... FROM anon, authenticated`; dejarla sólo para el rol del cron (o `postgres`). |
| **SEC-04** | **P1** | Cadena de suministro | `xlsx@0.18.5` (SheetJS), usado en `lib/actions/projects/import.ts:542` para parsear archivos **subidos por el usuario** | **[CONFIRMADO]** versión instalada 0.18.5; `pnpm audit` reporta *Prototype Pollution* (GHSA) y ReDoS. La versión parcheada **no está en el registro npm público** (SheetJS migró a su CDN). | Un `.xlsx` malicioso subido al importador puede contaminar `Object.prototype` o colgar el worker (ReDoS) durante `XLSX.read`. | Posible RCE/DoS del proceso server que corre el import. | Media | Migrar a la build oficial de SheetJS desde su CDN (`https://cdn.sheetjs.com/...`) fijada por versión+hash, **o** reemplazar el parseo por `exceljs` (ya presente para escribir). Aislar el parseo. Validar `Content-Type`/tamaño real. |
| **SEC-05** | **P1/P2** | Stored XSS / archivo peligroso | `components/installer/avatar-upload.tsx` (validación sólo cliente) + bucket `avatars` **público** sin `allowed_mime_types` ni `file_size_limit` | **[CONFIRMADO]** por código: la única validación de tipo es `file.type.startsWith("image/")` en el cliente; `image/svg+xml` la pasa. El bucket `avatars` es `public=true` y sirve el archivo tal cual. | Un instalador sube un `.svg` con `<script>` como "avatar"; la URL pública lo sirve con content-type SVG y ejecuta JS en el origen de Storage (y puede embeberse). | XSS almacenado, phishing con contenido en dominio de confianza. | Media | Fijar `allowed_mime_types` (jpeg/png/webp) y `file_size_limit` en el bucket; validar el **magic number** server-side; servir avatares con `Content-Disposition: attachment` o vía transformación de imagen; considerar bucket privado con URL firmada. |

---

## 4. Riesgos P2 y P3

| ID | Sev | Categoría | Ubicación | Estado | Nota / Solución |
|---|---|---|---|---|---|
| **SEC-06** | P2 | Cadena de suministro | `shadcn` en **dependencies** (no devDependencies); arrastra `qs`, `hono`, `undici`, `ip-address`, `fast-uri`, `js-yaml` vulnerables vía `@modelcontextprotocol/sdk`→`express` | [CONFIRMADO] `pnpm audit`: 17 high + 13 moderate, casi todas por `shadcn` | `shadcn` es un CLI de scaffolding, no runtime: mover a `devDependencies` (o eliminar) saca ~la mayoría de los advisories del árbol de producción. |
| **SEC-07** | P2 | Config web | `next.config.ts`: CSP en `Content-Security-Policy-Report-Only`, **sin `report-uri`**, con `unsafe-inline`+`unsafe-eval` | [CONFIRMADO] | No bloquea ni reporta nada hoy. Plan: nonces + pasar a enforcement (`Content-Security-Policy`), quitar `unsafe-eval`. Es el mitigante de defensa-en-profundidad para SEC-05. |
| **SEC-08** ✅ | P2 | Rate limiting | Todo el repo: **cero** rate limiting propio (grep sin coincidencias) | [CORREGIDO] | Rate limiting distribuido con Upstash Redis (`lib/security/rate-limit.ts`) en login, reset, export y `mfa_verify`. Upstash aprovisionado en prod (vars `KV_*` de Vercel; el código lee ambas convenciones). Ver bloque de estado. |
| **SEC-09** | P2 | Storage | Buckets `chat` y `evidence`: sin `file_size_limit` ni `allowed_mime_types` | [CONFIRMADO] §storage.buckets | Aunque privados y con RLS por tenant, falta límite de tamaño/tipo → subida de archivos enormes o peligrosos (aunque el acceso esté acotado). Fijar límites. |
| **SEC-10** | P2 | AuthZ (policy) | `storage.objects`: policies `evidence_read`/`evidence_company_delete` usan `storage.foldername(s.name)` (columna `sites.name`) en vez de `objects.name` | [POTENCIAL] | Parece copy-paste: esa rama OR evalúa el path sobre el *nombre* del sitio. Probablemente **falla cerrado** (no concede), pero hay que verificar que no conceda lecturas inesperadas ni rompa lecturas legítimas de evidencia ligada a sites. **Requiere revisión humana.** |
| **SEC-11** ⛔ | P2 | Auth config | Advisor Supabase `auth_leaked_password_protection` = deshabilitado | [BLOQUEADO POR PLAN] | La protección HIBP **sólo existe en plan Pro**; el proyecto está en Hobby/Free (guardar da "available on Pro Plans and up"). Preventivo, no vuln viva: residual aceptado hasta subir a Pro. Ver bloque de estado. |
| **SEC-12** | P2 | Config DB | Advisor Supabase: 14 funciones `function_search_path_mutable` | [POTENCIAL] | Mi consulta directa mostró que **todas las `SECURITY DEFINER` tienen `search_path` fijo**; las 14 flagueadas serían no-secdef o falsos positivos. Revisar el listado del advisor y fijar `search_path` donde falte. |
| **SEC-13** ✅ | P3 | Config MFA | Sin MFA para `platform_admin` ni `company_manager` | [CORREGIDO] | TOTP con la API MFA de Supabase Auth: **obligatorio** para admin/gerencia (enrolamiento forzado + step-up en login vía `twoFactorGate`/`loginAction`), **opcional** para el instalador. Verificado end-to-end en Demo. Ver bloque de estado arriba. |
| **SEC-14** ✅ | P3 | Funcional/seguridad | Edge Function `send-event-push`: eventos `announcement` y `blocker_reported` en `EVENTS` **sin rama en `isAuthorized`** → siempre 403 | [CORREGIDO y DESPLEGADO] | Ramas de autorización agregadas; función **redeployada a prod (v3)** y verificada por MCP. El push de anuncios y bloqueos ya se entrega. Ver bloque de estado. |
| **SEC-15** | P3 | CSRF | `POST /api/master/*` autentican por cookie de sesión | [POTENCIAL, bajo] | Mitigado por SameSite=Lax (bloquea POST cross-site) + esperan JSON (preflight CORS, sin CORS permisivo). Las Server Actions de Next 16 traen verificación de Origin propia. Residual bajo; documentar y, opcionalmente, doble-submit token en `/api/master`. |

---

## 5. Controles correctamente implementados (verificados)

- **RLS universal:** las 100% de tablas `public` tienen RLS activa **con** policies (query sobre `pg_class`/`pg_policy`: 0 tablas sin policy). Aislamiento por `company_id`.
- **Lección del punto 21 aplicada:** `projects` **no** tiene policy para instaladores; el `GET /api/projects/[id]/sites/export` que confía sólo en RLS devuelve 404 a un instalador. No hay fuga de export cross-tenant.
- **Frontera `service_role`:** `admin.ts` marcado `server-only` (rompe el build si se filtra a cliente); sólo 2 importadores, ambos legítimos (`/api/master/_guard`, `invite-signup`).
- **`/api/master/**` correctamente vetado:** `requirePlatformAdmin()` verifica rol **antes** de entregar el cliente admin.
- **Alta por invitación sin escalada:** rol fijado a `installer` server-side; email tomado de la invitación, no del formulario; rollback compensatorio del usuario Auth si falla el alta.
- **Escalada de roles bloqueada:** `promote/demote/grant/revoke_company_member_role` validan `auth_role()='company_manager'`; probado como `anon` → "Acceso denegado".
- **Sin enumeración de usuarios:** login devuelve error genérico; `requestPasswordReset` responde idéntico exista o no la cuenta (ni propaga el error de Supabase).
- **Open redirect mitigado:** `loginAction` rechaza `//` y `/\`; `auth/callback` y OAuth usan `applicationOrigin()`, no parámetros.
- **OAuth Google robusto:** `state` aleatorio de 32 bytes, cookie HttpOnly con `path` acotado y `maxAge` 600s, verificado en el callback.
- **Cifrado de tokens correcto:** AES-256-GCM con IV por operación y auth tag verificado; clave de 32 bytes exigida. No hay criptografía casera.
- **Sin secretos en el repo:** sólo `.env.example` trackeado; nada en el historial; cero secretos hardcodeados; `service_role` nunca con prefijo `NEXT_PUBLIC`.
- **Sin sinks de XSS:** cero `dangerouslySetInnerHTML`, `eval`, `new Function`, `innerHTML=`.
- **`SECURITY DEFINER` con `search_path` fijo:** las secdef tienen `search_path=public` (mitiga secuestro por search_path).
- **Cabeceras de seguridad:** HSTS (2 años, preload), X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy restrictiva.
- **Cookies de sesión:** HttpOnly + SameSite=Lax + Secure en producción; rotación preservada en redirects (`redirectKeepingSession`).
- **Suspensión de empresa enforced:** el gerente de una empresa suspendida es deslogueado en proxy y en login.

---

## 6. Plan de corrección ordenado

**Bloque A — antes de producción (P1):**
1. **SEC-01/02/03 (raíz común):** auditar los `GRANT EXECUTE` de todas las
   `SECURITY DEFINER`. `REVOKE` de `anon`/`authenticated` en funciones internas,
   de trigger y de jobs; para las RPC legítimas de usuario, guarda de
   `auth_role()`/tenant al inicio y `GRANT` sólo al rol correcto. **Test pgTAP
   por función**: `anon` y un usuario de otro tenant deben ser rechazados.
2. **SEC-05:** `allowed_mime_types` + `file_size_limit` en bucket `avatars` +
   validación de magic number server-side.
3. **SEC-04:** reemplazar `xlsx` (SheetJS npm) por la build oficial pinneada o
   por `exceljs` para el parseo del import.

**Bloque B — endurecimiento previo (P2):**
4. **SEC-06:** mover/eliminar `shadcn` de `dependencies`; re-correr `pnpm audit`.
5. **SEC-09:** límites de tamaño/tipo en `chat` y `evidence`.
6. **SEC-08:** rate limiting en login, import/export, PDF y RPC sensibles.
7. **SEC-07:** CSP a enforcement con nonces (quitar `unsafe-eval`).
8. **SEC-11:** activar protección de contraseñas filtradas en Supabase.
9. **SEC-10 / SEC-12:** revisar la policy de storage `evidence` y el listado de
   `search_path` del advisor. **(Requieren revisión humana.)**

**Bloque C — mejoras (P3):**
10. **SEC-13:** MFA para admin/gerencia. **SEC-14:** ramas de auth de push.
    **SEC-15:** documentar/endurecer CSRF en `/api/master`.

---

## 7. Archivos que sería necesario modificar

- **Migración nueva** `supabase/migrations/…_rpc_execute_hardening.sql` — `REVOKE`/`GRANT` y guardas de las RPC (SEC-01/02/03). *El grueso del trabajo.*
- Configuración de buckets Supabase (SEC-05, SEC-09) — vía migración o dashboard.
- `lib/actions/projects/import.ts` + `package.json` (SEC-04).
- `components/installer/avatar-upload.tsx` + acción/validación server-side (SEC-05).
- `package.json` (SEC-06, SEC-04).
- `next.config.ts` (SEC-07).
- Rate limiting: nuevo `lib/security/rate-limit.ts` + call-sites (SEC-08).
- `supabase/functions/send-event-push/index.ts` (SEC-14).
- Config de Supabase Auth (SEC-11 leaked passwords, SEC-13 MFA).
- Migración de policy `storage.objects` (SEC-10, tras revisión).

---

## 8. Tests que habría que crear

- **pgTAP por RPC sensible:** `anon` rechazado; usuario de tenant B rechazado;
  tenant propio permitido. Cubre SEC-01/02/03 y previene regresiones.
- **pgTAP storage `evidence`:** instalador sólo lee/borra evidencia de sus
  órdenes; tenant B no; verificar la rama `sites` (SEC-10).
- **E2E/integración:** subida de `.svg` como avatar → rechazada server-side
  (SEC-05); `.xlsx` malformado/malicioso al import → rechazado sin colgar (SEC-04).
- **Test de humo de dependencias:** `pnpm audit --audit-level=high` en CI como gate.
- **E2E CSRF:** POST cross-site a `/api/master/*` sin cabeceras válidas → bloqueado.
- **E2E authZ existentes:** ya hay cobertura (dual-role, location-review); extender
  a "anon contra RPC" y "tenant A contra recurso de tenant B" vía PostgREST.

---

## 9. Riesgos que requieren revisión humana

1. **SEC-10** — policy de storage `evidence` con `storage.foldername(s.name)`:
   confirmar si concede lecturas indebidas o si sólo rompe lecturas legítimas.
2. **SEC-12** — 14 funciones flagueadas por el advisor de `search_path`: cruzar
   con las secdef (que ya lo tienen fijo) para descartar falsos positivos.
3. **Alcance del `REVOKE` (SEC-01/02/03):** decidir función por función cuál debe
   seguir siendo llamable por `authenticated` y con qué guarda — es una decisión
   de negocio (p. ej. `reputation_summary` ¿la consume el cliente logueado?).
   **No aplicar un `REVOKE` masivo a ciegas:** algunas alimentan la UI y hay que
   moverlas a `authenticated` + guarda, no romperlas.
4. **`invitation_preview`** es pública **a propósito** (preview del link antes de
   registrarse): confirmar que sólo devuelve lo mínimo (email + validez) y no PII
   extra.
5. **CSP a enforcement (SEC-07):** relevar en staging qué scripts inline existen
   antes de quitar `unsafe-inline`, para no romper la app.

---

*Fin de la Fase 1. No se aplicó ninguna corrección. A la espera de aprobación
del plan para proceder.*

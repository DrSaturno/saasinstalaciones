# Auditoría de preparación para producción — Se Instala

**Fecha:** 2026-09-04 · **Alcance:** operaciones, infraestructura, despliegue y preparación para producción ·
**Método:** inspección del repositorio + consulta de configuración real de producción por MCP. **No se ejecutó ningún despliegue, migración ni cambio de infraestructura.**

> **Recomendación: NO-GO para lanzamiento comercial.**
> No por calidad del código —que es buena y está bien probada— sino porque
> **hoy no existe capacidad de recuperación ante desastre**: la organización de
> Supabase está en plan `free`, que no ofrece backups restaurables ni PITR, y
> nunca se ejecutó una restauración de prueba. Un borrado accidental o una
> migración fallida es, a día de hoy, **pérdida definitiva de datos**.
> Los detalles y el camino a GO están en §11 y §13.

> **Estado de remediación (2026-09-04, misma jornada).** Se implementó todo lo
> que no depende de plan contratado ni de una decisión de negocio:
>
> - **OPS-05 CERRADO** — los 7 scripts sueltos se movieron a
>   `supabase/scripts-manuales/`; los dos destructivos llevan prefijo `PELIGRO_`
>   y una guarda que **aborta la ejecución** hasta comentarla a propósito. CI
>   ahora falla si vuelve a aparecer un `.sql` suelto en `supabase/`.
> - **OPS-10 CERRADO** — `GET /api/health` verifica Supabase y Redis de verdad
>   (no un 200 vacío); 503 si Supabase no responde.
> - **OPS-09 CERRADO** — los boundary de error ahora reportan `digest` y ruta a
>   `POST /api/client-errors`. Se registra el digest, **nunca el mensaje**.
> - **OPS-12 / OPS-13 CERRADOS** — timeouts en Resend (×2), Google (×4) e
>   invocación de push, vía `lib/http/timeout.ts`.
> - **OPS-14 CERRADO** — `proxy.ts` distingue "no hay sesión" de "Supabase no
>   responde": ya no produce deslogueo masivo ante una caída.
> - **OPS-19 CERRADO** — los fallos de push se registran (antes: `catch {}`).
> - **OPS-21 MITIGADO** — `seed.sql` aborta si la base tiene empresas ajenas al
>   seed. Falta **rotar la contraseña**, que es acción humana.
> - **OPS-17 CERRADO** — `config.toml` pasa a Postgres 17, igual que producción.
> - **OPS-27, OPS-29, OPS-30, OPS-31, OPS-41 CERRADOS.**
> - **OPS-20 PARCIAL** — CI suma auditoría de dependencias (informativa) y la
>   guarda de scripts sueltos. La puerta de despliegue con smoke test sigue
>   pendiente: depende de tener staging, que depende del plan.
> - **OPS-32 RETIRADO — era un falso positivo.** Las dos suites pgTAP sí
>   declaran `plan(10)`; usan la forma `select ... from plan(10) msg`, que el
>   grep inicial no capturó. No había nada que arreglar.
>
> **Los P0 siguen abiertos** (OPS-01/02/03/04/06): son plan contratado y una
> reconciliación que requiere autorización explícita. La recomendación **NO-GO
> no cambia**.

## Nota de método y honestidad

- Todo lo marcado **[VERIFICADO]** se comprobó contra producción o contra el
  repositorio con evidencia citada (archivo:línea o consulta).
- **[POTENCIAL]** = el código indica el riesgo, falta prueba dinámica.
- **[PREVENTIVO]** = recomendación de endurecimiento, no un defecto probado.
- **No se midieron bundles ni Core Web Vitals.** El árbol de trabajo tenía
  cambios sin commitear de otra herramienta al momento de auditar, así que
  cualquier medición no habría representado a `main`. La FASE 7 entrega el
  **procedimiento de medición**, no números inventados.
- Distinción importante: la documentación en `docs/operations/` describe un
  estado **diseñado**. Esta auditoría verifica el estado **implementado**. Donde
  difieren, se dice.

---

## 1. Arquitectura operativa detectada

### Stack

| Capa | Tecnología | Evidencia |
|---|---|---|
| Framework | Next.js **16.2.12**, React 19.2.4, App Router | `package.json:40,44` |
| Runtime | Node **22.14.0** (fijado) | `.nvmrc`, `package.json:6-9` |
| Gestor | pnpm **11.9.0**, lockfile versionado | `package.json:5`, `pnpm-lock.yaml` |
| Hosting | **Vercel** (integración GitHub, sin `vercel.json`) | ausencia de `vercel.json`; checks "Vercel" en PRs |
| Base de datos | Supabase Postgres **17.6.1** (`us-east-1`) | MCP `get_project` |
| Auth / Storage / Realtime | Supabase | `@supabase/ssr`, `@supabase/supabase-js` |
| Rate limiting | Upstash Redis (plan Free) | `lib/security/rate-limit.ts` |
| Email | Resend (`fetch` directo, sin SDK) | `lib/email/invitations.ts:102` |
| Push | Edge Function `send-event-push` + VAPID | `supabase/functions/send-event-push` |
| Clima | Open-Meteo | `lib/weather/forecast.ts:98` |
| Calendario | Google Calendar API + OAuth | `lib/google-calendar/sync.ts` |
| PWA offline | Service Worker propio + Dexie | `public/sw.js`, `lib/offline/sync.ts` |

**Sin contenedores, sin reverse proxy propio, sin Procfile.** No existen
`Dockerfile`, `docker-compose`, `.dockerignore` ni configuración de nginx. El
despliegue es íntegramente gestionado por Vercel.

### Flujo de una petición

```
                      ┌──────────────────────────────────────────┐
                      │  Navegador / PWA instalada (installer)    │
                      │  · Service Worker (public/sw.js)          │
                      │    – stale-while-revalidate en estáticos  │
                      │    – network-first + fallback en rutas    │
                      │      de campo (/home /tasks /route …)     │
                      │  · Dexie outbox (mutaciones idempotentes) │
                      └───────────────────┬──────────────────────┘
                                          │ HTTPS
                                          ▼
                      ┌──────────────────────────────────────────┐
                      │  Vercel Edge / CDN  (DNS + TLS gestionado)│
                      └───────────────────┬──────────────────────┘
                                          ▼
                      ┌──────────────────────────────────────────┐
                      │  proxy.ts  (middleware Next 16)           │
                      │  ⚠ SIN try/catch  ⚠ 2-3 viajes a la DB   │
                      │  1. supabase.auth.getUser()               │
                      │  2. select profiles (rol, locale, empresa)│
                      │  3. select companies.status (si gerente)  │
                      │  → enruta por rol / expulsa de otras áreas │
                      └───────────────────┬──────────────────────┘
                                          ▼
        ┌─────────────────────────────────┴───────────────────────────┐
        │  Next.js en Vercel (funciones serverless)                    │
        │  · Server Components (lectura)                               │
        │  · ~45 módulos de Server Actions (mutación, Zod)             │
        │  · 10 route handlers en /api                                 │
        │     ⚠ NINGUNO es health/readiness                            │
        └───┬───────────────┬───────────────┬───────────────┬─────────┘
            │               │               │               │
            ▼               ▼               ▼               ▼
   ┌────────────────┐ ┌───────────┐ ┌────────────┐ ┌─────────────────┐
   │ Supabase       │ │ Resend    │ │ Upstash    │ │ Google Calendar │
   │ PostgREST/Auth │ │ (email)   │ │ (rate lim.)│ │ + Open-Meteo    │
   │ Storage/RT     │ │ sin       │ │ falla      │ │ sin timeout     │
   │ RLS + 80 migr. │ │ timeout   │ │ ABIERTO    │ │ (salvo clima)   │
   └───────┬────────┘ └───────────┘ └────────────┘ └─────────────────┘
           │
           ▼
   ┌────────────────────────────────────┐
   │ Edge Function send-event-push (v3) │
   │ → Web Push (VAPID) → dispositivos  │
   │ ⚠ invocada sin timeout; fallo      │
   │   silencioso (catch vacío)         │
   └────────────────────────────────────┘

   ⚠ NO EXISTE: scheduler/cron · colector de logs · APM · uptime monitor
   ⚠ NO EXISTE: entorno de staging · backups restaurables
```

### Superficie de `/api` (10 handlers)

`auth/callback` · `google-calendar/callback` · `google-calendar/connect` ·
`master/companies` · `master/companies/[id]` · `master/overview` ·
`orders/[id]/pdf` · `projects/[id]/imports/[importId]/report` ·
`projects/[id]/sites/export` · `site-template`

**No hay webhooks entrantes** (no hace falta verificación de firma — ausencia
de riesgo, no un hueco). **No hay endpoint de salud.**

---

## 2. Bloqueantes de producción (P0)

| ID | Hallazgo | Evidencia | Impacto |
|---|---|---|---|
| **OPS-01** | **Supabase en plan `free`: sin backups restaurables ni PITR.** | MCP `get_organization` → `"plan":"free"` | **Pérdida definitiva de datos** ante borrado, corrupción o migración fallida. No hay RPO ni RTO alcanzables. |
| **OPS-02** | **Proyectos free se pausan por inactividad.** | MCP `list_projects`: `Base 3 - Legacy` → `"status":"INACTIVE"` | La aplicación puede quedar **caída sola** tras un período de baja actividad. Prueba viva en la propia organización. |
| **OPS-03** | **Vercel en plan Hobby.** | Captura del dashboard (badge "Hobby") | El plan Hobby **prohíbe uso comercial** por ToS, no tiene SLA ni log drains. Riesgo contractual y operativo. **[REQUIERE VERIFICACIÓN HUMANA]** |
| **OPS-04** | **Deriva de migraciones repo ↔ producción: 11 migraciones aplicadas con versión distinta.** | Consulta a `supabase_migrations.schema_migrations` (ver §6) | `supabase db push` desde un checkout limpio **intentaría reaplicarlas**. El orden real en prod difiere del declarado. **El verde de CI no prueba el esquema de producción.** |
| **OPS-05** | **Scripts destructivos sin guarda en `supabase/`.** | `reset_a_cero.sql` (borra 26 tablas + `auth.users`), `limpiar_usuarios.sql` (borra `auth.users`) | Un clic en "Run" del SQL Editor **destruye un tenant**. La única guarda de `reset_a_cero.sql` es la existencia de `gerente@demo.dev` — que en una prod sembrada alguna vez, **no protege**. |
| **OPS-06** | **Nunca se ejecutó una restauración.** | Ausencia total de procedimiento y de evidencia | "Hay backups" es indemostrable. Con plan free, además, **no los hay**. |

---

## 3. Riesgos P1 — impiden operación confiable

| ID | Hallazgo | Evidencia |
|---|---|---|
| **OPS-07** | **Cero visibilidad: no existe ningún colector de logs, APM, RUM ni error tracker.** Los logs salen por `console.*` a stdout efímero de Vercel. **Las 7 alertas de `docs/operations/observability.md:40-50` son hoy inimplementables.** | Sin dependencias de Sentry/Datadog/OTel/Axiom; `observability.md:55` lo admite |
| **OPS-08** | **Los eventos más críticos nunca llegan al servidor.** `lib/offline/sync.ts` corre en el navegador: `offline.sync.item_blocked` (= trabajo de campo perdido) se registra **sólo en la consola del teléfono del instalador**. | `sync.ts:178,200,246,259` + `observability.md:34,43` |
| **OPS-09** | **Los crashes de cliente son invisibles.** `app/error.tsx` recibe `error` (con `digest`) y **no lo usa**; `useAutoReloadOnError` recarga y borra la evidencia. | `app/error.tsx:12-20`, `app/global-error.tsx:30` |
| **OPS-10** | **No hay endpoint de salud** (`health`/`ready`/`live`). Ningún monitor de uptime puede sondear la app ni verificar que Supabase responde. | Inventario completo de `app/api` |
| **OPS-11** | **89 de 107 bloques `catch` descartan el error** (`} catch {`). Sólo 3 de 45 módulos de Server Actions están instrumentados. | Censo del explorador; `observability.md:54` lo lista como pendiente |
| **OPS-12** | **6 de 7 llamadas externas no tienen timeout** (Resend ×2, Google ×3, invoke de Edge Function, Upstash, y todas las de Supabase). La única con timeout es el clima. | `forecast.ts:98` es la excepción; documenta por qué hacía falta |
| **OPS-13** | **El rollback del alta de empresa puede quedar a medias.** Un Resend colgado agota el timeout de la función *después* de crear empresa + usuario y *antes* de compensar → queda exactamente el huérfano que el rollback existe para evitar. | `app/api/master/companies/route.ts:210-224` sin `AbortSignal` |
| **OPS-14** | **`proxy.ts` no tiene try/catch alrededor de Supabase.** Una caída de Supabase se manifiesta como **deslogueo masivo** (todos a `/login`) o 500 en toda ruta. | `proxy.ts:88-90,108-112,136-142` |
| **OPS-15** | **No existe scheduler: los jobs de confiabilidad nunca corren.** Sin `pg_cron`, sin cron de Vercel, sin cron en CI. Los instaladores **nunca reciben el aviso de vencimiento** de su ventana de respuesta. | Reconocido en `docs/specs/2026-09-01-.../tasks.md:41` |
| **OPS-16** | **No existe entorno de staging.** El plan free permite 2 proyectos y los dos están usados (Producción + Demo). Los previews de Vercel no tienen variables de Supabase. | MCP `list_projects`; `docs/operations/environment-matrix.md` describe un staging que **no existe** |
| **OPS-17** | **Deriva de versión de Postgres.** Local/CI corre PG **15** (`config.toml:6`); producción corre PG **17.6**; Demo corre 17.6.1.**155** vs prod 17.6.1.**147**. Las migraciones se validan en una major distinta a la que ejecutan. | `config.toml:6` vs MCP `get_project` |
| **OPS-18** | **Push parcialmente entregado se marca como entregado.** `push_sent_at` se estampa para **todas** las filas sin importar cuántas se enviaron; nunca se reintenta. | `send-event-push/index.ts:182-185` |
| **OPS-19** | **Fallos de push totalmente silenciosos** (`catch {}` vacío, sin log ni métrica). Una caída del 100% del push es invisible. | `lib/push/events.ts:29` |
| **OPS-20** | **Sin puerta de despliegue.** Vercel despliega `main` automáticamente: sin smoke test, sin aprobación manual, sin verificación posterior. CI **no** corre auditoría de dependencias ni verifica migraciones. | `.github/workflows/ci.yml` (3 jobs, ninguno despliega ni audita) |
| **OPS-21** | **Contraseña de `platform_admin` versionada en el repo** (`InstalaPro2026!`, en 4 lugares) y `seed.sql` **sin guarda de entorno**. Sólo el camino de invocación (CLI local) lo mantiene fuera de prod. | `seed.sql:44,48-49`; `e2e/actors.ts:8`; `PROGRESS.md:925` |
| **OPS-22** | **Sin rollback de base de datos.** No hay migraciones `down`, ni procedimiento. El rollback de código (Vercel) no revierte el esquema. | Ausencia en `supabase/migrations/` |

---

## 4. Riesgos P2

| ID | Hallazgo | Evidencia |
|---|---|---|
| OPS-23 | 92 índices creados **sin `CONCURRENTLY`** y **sin `lock_timeout`**, incluido un **GIN sobre `order_updates`** (tabla de crecimiento ilimitado). Bloquea escrituras durante la construcción. | `20260901000000:107` |
| OPS-24 | `drop constraint` **sin `if exists`** en `order_updates_type_check` (×2): si el nombre difiere, la migración falla entera. | `20260901000000:32`, `20260908000000:247` |
| OPS-25 | `syncCompanyCalendar` recorre **todas** las órdenes agendadas, secuencial, sin paginación ni límite → no sobrevive la escala objetivo (proyectos de 2000 sitios). | `lib/google-calendar/sync.ts:66-76` |
| OPS-26 | Reintentos del outbox **sin backoff ni tope**; el umbral `tries >= 3` es sólo visual, nunca bloquea. | `lib/offline/sync.ts:238-241` |
| OPS-27 | `GET /api/master/companies` devuelve `error.message` crudo de Postgres por la red. | `app/api/master/companies/route.ts:39` |
| OPS-28 | Mensaje crudo de Supabase mostrado en un toast al instalador. | `components/messages/chat-panel.tsx:187` |
| OPS-29 | El limitador loguea bajo la clave `message`, que el sanitizador **redacta siempre** → el error de Upstash es indiagnosticable. Además **falla abierto** sin alerta. | `lib/security/rate-limit.ts:112-118` |
| OPS-30 | 4 `console.error` sin sanitizar en email y recuperación de contraseña; violan la regla propia (`observability.md:7`, `AGENTS.md` regla 6). | `password-reset.ts:45,47`; `invitations.ts:120,125`; `announcements.ts:48,53` |
| OPS-31 | `.env.example` **desactualizado**: faltan `KV_REST_API_URL`, `KV_REST_API_TOKEN` (las que realmente usa prod) y `VERCEL_PROJECT_PRODUCTION_URL`. | grep de `process.env` vs `.env.example` |
| ~~OPS-32~~ | ~~2 suites pgTAP sin `select plan()`~~ **RETIRADO: falso positivo.** Ambas declaran `plan(10)` con la forma `select ... from plan(10) msg`, que el grep inicial no capturó. Sí afirman. | Verificado leyendo los archivos |
| OPS-33 | `output: "standalone"` vestigial (apunta a un hosting SiteGround que no se usa); ambigüedad sobre el destino real. | `next.config.ts:51` |
| OPS-34 | Serwist en `devDependencies` pero **nunca conectado**; el service worker es artesanal. | `public/sw.js:4-6` |
| OPS-35 | Proyecto `Base 3 - Legacy` inactivo sigue en la organización (limpieza y retención de datos). | MCP `list_projects` |
| OPS-36 | Migración de cutover **desactiva el trigger anti-escalada** y estrecha `profiles_role_check`; declara un orden de despliegue que **nada en CI verifica**. | `20260728000015:184,203-206,1-6` |
| OPS-37 | `truncate` + renumeración total de `work_orders` bajo el supuesto "los datos existentes son demo". | `20260722000001:297` |

---

## 5. Riesgos P3

| ID | Hallazgo |
|---|---|
| OPS-38 | Redacción de logs sólo por **nombre de clave**: un token bajo `url` o `link` pasaría sin redactar. |
| OPS-39 | `correlation_id` sólo en 3 flujos; ausente en `proxy.ts`, en 7 de 10 rutas `/api` y en 42 de 45 Server Actions. Nunca se devuelve al cliente, así que un usuario no puede aportar nada para buscar. |
| OPS-40 | `observeOperation()` definido y testeado pero con **0 usos** en producción. |
| OPS-41 | `errorMessage()` con dos ramas idénticas: acepta `error` y lo descarta. `lib/actions/broadcasts.ts:69-72`. |
| OPS-42 | Scripts de reparación duplicados (`arreglar_roles_instaladores.sql` y `reparar_instaladores.sql` hacen lo mismo). |
| OPS-43 | UUID de producción embebido en un script de QA (`qa_doble_membresia.sql:166`). |

---

## 6. Estado de base de datos y migraciones

**80 archivos locales / 80 registros aplicados.** El total coincide, pero **11 no coinciden en versión**:

| Archivo en el repo | Versión registrada en producción |
|---|---|
| `20260906000003_assignment_gate.sql` | `20260903180931` |
| `20260906000004_projects_installer_assigned_read.sql` | `20260903192646` |
| `20260907000000_notification_archive.sql` | `20260903235511` |
| `20260907000001_announcement_audience.sql` | `20260903235545` |
| `20260908000000_field_flow_states.sql` | `20260904054150` |
| `20260908000001_completion_evidence_minimum.sql` | `20260904054216` |
| `20260908000002_blocker_incident_link.sql` | `20260904054239` |
| `20260908000003_review_decision_notice.sql` | `20260904054255` |
| `20260908000004_evidence_status_trace.sql` | `20260904054310` |
| `20260908000005_rpc_execute_hardening.sql` | `20260904123451` |
| `20260908000006_storage_hardening.sql` | `20260904124849` |

**Causa:** se aplicaron por MCP/dashboard, que estampa su propio timestamp en
lugar de respetar el del archivo.

**Consecuencias reales (OPS-04):**
1. Un `supabase db push` desde un checkout limpio ve esas 11 versiones como
   **pendientes** e intenta reaplicarlas. Varias no son idempotentes.
2. El **orden aplicado difiere del declarado**: en prod `assignment_gate` corrió
   *antes* de `activate_work_activities`; en el repo va después.
3. Un entorno nuevo (CI, un staging futuro) construye una base **distinta** a
   producción. El verde de CI no es evidencia sobre prod.
4. Contradice `AGENTS.md` ("`supabase/migrations/` es la única fuente de verdad").

**Lo que sí está bien:** cero `DROP TABLE`, cero `DROP COLUMN`, cero
`ALTER COLUMN ... TYPE`, cero `ADD COLUMN NOT NULL` sin default en las 80
migraciones. **92 índices** con buena cobertura de claves foráneas.
**42 suites pgTAP con ~527 asserts**, fuertes en RLS y reglas de negocio.

**Lo que la suite no cubre:** reversibilidad de migraciones, orden de despliegue
/ compatibilidad hacia atrás, y presencia de índices.

---

## 7. Estado de backups y restauración

| Ítem | Estado |
|---|---|
| Backups automáticos | **NO** — el plan `free` no los provee |
| PITR | **NO** — es complemento de pago |
| Retención | **N/A** |
| Restauración probada | **NUNCA** |
| RPO alcanzable hoy | **Indefinido / infinito** |
| RTO alcanzable hoy | **Indefinido** |
| Export manual | No hay procedimiento ni programación |

Es el bloqueante principal. El procedimiento completo —qué hacer para que esto
pase a PASS— está en [`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md).

---

## 8. Estado de monitoreo y alertas

| Capacidad | Estado |
|---|---|
| Logs estructurados | ✅ **Sí** — `lib/observability.ts` es real, con redacción, truncado y correlación. Bien hecho. |
| Destino de logs | ❌ `console.*` → stdout efímero de Vercel. Sin retención ni consulta. |
| Alertas | ❌ Diseñadas (7, en `observability.md`) e **inimplementables** hoy |
| Uptime | ❌ Sin monitor y **sin endpoint que sondear** |
| Errores de frontend | ❌ Descartados por el boundary |
| Métricas / trazas | ❌ Inexistentes (`observeOperation` con 0 usos) |
| CPU / memoria / latencia / DB | ❌ Sólo lo que muestre el panel de Vercel/Supabase |
| Certificados | ✅ Gestionados por Vercel |

**Diagnóstico:** la instrumentación *base* está bien construida pero
**desconectada**. Falta el tramo final: un destino con retención y consulta.

---

## 9. Estrategia de despliegue (actual vs necesaria)

**Actual:** push a `main` → Vercel construye y publica **automáticamente**.
Sin smoke test, sin aprobación, sin verificación posterior. CI (3 jobs: calidad,
pgTAP, Playwright) corre en paralelo pero **no bloquea** el despliegue de Vercel
ni lo ejecuta.

Lo que **sí** está resuelto: `deploymentId` con `VERCEL_DEPLOYMENT_ID`
(`next.config.ts:77`) mitiga el desfasaje de versiones (skew) — muy buen
detalle, con la salvedad de que conviene además activar Skew Protection en el
panel.

La estrategia propuesta está en [`DEPLOYMENT_RUNBOOK.md`](DEPLOYMENT_RUNBOOK.md).

## 10. Estrategia de rollback

**Código:** Vercel permite promover un despliegue anterior (instantáneo). ✅
**Base de datos:** **no existe.** Sin migraciones `down`, sin PITR, sin backup.
**Service Worker:** un cliente con SW cacheado puede seguir sirviendo assets
viejos tras el rollback.

Plan completo en [`ROLLBACK_PLAN.md`](ROLLBACK_PLAN.md).

---

## 11. Plan de implementación

### Bloque 0 — Desbloquear producción (obligatorio antes de operar)

| # | Acción | Resuelve |
|---|---|---|
| 0.1 | **Subir Supabase a plan Pro** y activar backups diarios; evaluar PITR | OPS-01, OPS-02, OPS-06 |
| 0.2 | **Subir Vercel a plan Pro** (uso comercial + SLA + log drains) | OPS-03 |
| 0.3 | **Reconciliar la deriva de migraciones** (procedimiento en §6 del runbook) | OPS-04 |
| 0.4 | **Mover los scripts destructivos** a `supabase/scripts-manuales/` con prefijo `PELIGRO_` y encabezado de confirmación | OPS-05 |
| 0.5 | **Ejecutar y documentar una restauración real** en un proyecto aislado | OPS-06 |

### Bloque 1 — Visibilidad (sin esto se opera a ciegas)

| # | Acción | Resuelve |
|---|---|---|
| 1.1 | Endpoint `GET /api/health` (verifica Supabase y Upstash) + monitor de uptime externo | OPS-10 |
| 1.2 | Conectar un destino de logs (log drain de Vercel → Axiom/BetterStack) y activar las 7 alertas ya diseñadas | OPS-07 |
| 1.3 | Reportar errores de cliente: usar `error`/`digest` en los boundaries y enviar los eventos del outbox al servidor | OPS-08, OPS-09 |
| 1.4 | Instrumentar los 42 módulos de Server Actions sin logging; reemplazar `} catch {` por `} catch (error) {` con `logEvent` | OPS-11 |
| 1.5 | Corregir la clave `message` del limitador y los 4 `console.error` sin sanitizar | OPS-29, OPS-30 |

### Bloque 2 — Resiliencia

| # | Acción | Resuelve |
|---|---|---|
| 2.1 | `AbortSignal.timeout()` en Resend, Google, invoke de push y Upstash (el patrón ya existe en `forecast.ts:98`) | OPS-12, OPS-13 |
| 2.2 | try/catch en `proxy.ts` con degradación explícita (no deslogueo masivo) | OPS-14 |
| 2.3 | Agendar `run_reliability_jobs()` (pg_cron o cron de Vercel) | OPS-15 |
| 2.4 | Estampar `push_sent_at` sólo en lo efectivamente entregado; loguear fallos de push | OPS-18, OPS-19 |
| 2.5 | Backoff y tope de reintentos en el outbox | OPS-26 |
| 2.6 | Paginar y acotar `syncCompanyCalendar` | OPS-25 |

### Bloque 3 — Proceso y entornos

| # | Acción | Resuelve |
|---|---|---|
| 3.1 | Crear un proyecto **staging** (requiere plan Pro) y darle variables a los previews | OPS-16 |
| 3.2 | Alinear Postgres local/CI con producción (PG 17) | OPS-17 |
| 3.3 | Agregar a CI: `pnpm audit`, verificación de migraciones, smoke test post-deploy | OPS-20 |
| 3.4 | Rotar la contraseña sembrada y poner guarda de entorno en `seed.sql` | OPS-21 |
| 3.5 | Definir el procedimiento de rollback de datos (expand/contract ya documentado) | OPS-22 |

---

## 12. Acciones que requieren acceso o decisión humana

Ninguna de estas la puede hacer un agente: son de cuenta, plan o dinero.

1. **Subir el plan de Supabase** (free → Pro). Habilita backups, PITR, sin pausa.
2. **Subir el plan de Vercel** (Hobby → Pro). Uso comercial, SLA, log drains.
3. **Decidir el proveedor de logs** (Axiom, BetterStack, Datadog…) y contratarlo.
4. **Decidir el monitor de uptime** (BetterStack, Cronitor…).
5. **Autorizar la reconciliación de migraciones** contra producción.
6. **Confirmar el destino de hosting**: Vercel definitivo, o el `output: standalone`
   apunta a un plan de mudanza a SiteGround todavía vigente.
7. **Rotar la contraseña de las cuentas sembradas** si alguna existe en prod.
8. **Decidir sobre `Base 3 - Legacy`**: borrarlo o conservarlo (¿tiene datos reales?).
9. **Definir RPO y RTO objetivo** — es una decisión de negocio, no técnica.

---

## 13. Recomendación: **NO-GO**

**No se debe abrir a operación comercial real en el estado actual.**

El motivo no es la calidad del producto. El código está bien construido: RLS en
todas las tablas, 527 asserts de pgTAP, 444 tests unitarios, una cola offline
genuinamente idempotente, logging estructurado con redacción, y una auditoría de
seguridad ya cerrada. **El problema es que no hay red de contención.**

Tres hechos, cada uno suficiente por sí solo:

1. **Un error destruye datos para siempre.** Plan free = sin backups ni PITR.
   Y hay dos scripts en el repo que borran `auth.users` y 26 tablas, a un clic
   de distancia en el SQL Editor.
2. **Nadie se entera de nada.** No hay colector de logs, ni alertas vivas, ni
   monitor de uptime, ni endpoint que sondear. La señal más crítica del sistema
   —trabajo de campo perdido— sólo se escribe en la consola del teléfono del
   instalador.
3. **El despliegue no es reproducible.** El esquema de producción se construyó
   en un orden distinto al que declara el repo, así que el verde de CI no dice
   nada sobre producción.

**Camino a GO:** completar el **Bloque 0** convierte la recomendación en
*GO condicionado* (operación con supervisión estrecha). Completar además el
**Bloque 1** la convierte en **GO**. Los bloques 2 y 3 son consolidación y
pueden ir después del lanzamiento, con la salvedad de OPS-15 (los recordatorios
de reprogramación) si esa función se promete a los usuarios desde el día uno.

Estimación honesta: el Bloque 0 es mayormente **decisión y dinero**, no
ingeniería (salvo 0.3 y 0.5). El Bloque 1 es trabajo real de desarrollo.

---

## Referencias

- [`DEPLOYMENT_RUNBOOK.md`](DEPLOYMENT_RUNBOOK.md) — cómo desplegar
- [`ROLLBACK_PLAN.md`](ROLLBACK_PLAN.md) — cómo volver atrás
- [`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md) — respaldo y restauración
- [`INCIDENT_RESPONSE.md`](INCIDENT_RESPONSE.md) — runbooks de incidente
- [`PRODUCTION_CHECKLIST.md`](PRODUCTION_CHECKLIST.md) — checklist con estado
- [`SECURITY_AUDIT.md`](SECURITY_AUDIT.md) — auditoría de seguridad (cerrada)
- [`operations/`](operations/) — documentación operativa previa (estado diseñado)

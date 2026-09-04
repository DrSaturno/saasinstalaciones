# Runbook de despliegue — Se Instala

Complementa [`operations/release-runbook.md`](operations/release-runbook.md), que
define la disciplina **expand/contract**. Este documento describe el
procedimiento concreto sobre la infraestructura que existe hoy (Vercel +
Supabase) y marca explícitamente lo que todavía **no** está implementado.

> **Estado actual:** el despliegue es **automático y sin puerta**. Un push a
> `main` hace que Vercel construya y publique, sin smoke test ni aprobación.
> Las secciones marcadas 🔴 describen controles que **hay que construir**.

---

## 1. Matriz de variables de entorno

Sin valores — sólo nombres, propósito y ubicación.

### Aplicación Next.js (Vercel)

| Variable | Propósito | Entornos | Oblig. | Secreta | Ubicación | Si falta |
|---|---|---|:--:|:--:|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Endpoint de Supabase (cliente y servidor) | todos | **Sí** | No | Vercel env + `.env.local` | La app no arranca; `proxy.ts` lanza en cada request |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública; RLS aplica | todos | **Sí** | No | Vercel env + `.env.local` | Ídem |
| `SUPABASE_SERVICE_ROLE_KEY` | Sólo servidor; `/api/master` y alta por invitación | todos | **Sí** | **Sí** | Vercel env (Server) | Alta de empresa y de instalador fallan |
| `APP_URL` | Origen público para links de invitación | todos | **Sí** | No | Vercel env | Los emails salen con links rotos |
| `RESEND_API_KEY` | Envío de emails | prod, staging | No | **Sí** | Vercel env | Degrada a `not_configured`: el alta entrega el link a mano |
| `RESEND_FROM_EMAIL` | Remitente de dominio verificado | prod, staging | No | No | Vercel env | Ídem |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Suscripción Web Push en el navegador | prod, staging | No | No | Vercel env | No se puede suscribir a push |
| `GOOGLE_CLIENT_ID` | OAuth de Google Calendar | prod, staging | No | No | Vercel env | La conexión de calendario no arranca |
| `GOOGLE_CLIENT_SECRET` | OAuth de Google Calendar | prod, staging | No | **Sí** | Vercel env | Ídem |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Cifra los tokens de Google en reposo (32 B base64) | prod, staging | No | **Sí** | Vercel env | No se guardan conexiones de calendario |
| `KV_REST_API_URL` | Redis de Upstash (**nombre que inyecta Vercel**) | prod | No | No | Inyectada por la integración | Rate limiting degrada a **no-op silencioso** |
| `KV_REST_API_TOKEN` | Ídem | prod | No | **Sí** | Inyectada por la integración | Ídem |
| `UPSTASH_REDIS_REST_URL` | Alternativa manual (dev/Upstash directo) | dev | No | No | `.env.local` | Ídem |
| `UPSTASH_REDIS_REST_TOKEN` | Ídem | dev | No | **Sí** | `.env.local` | Ídem |
| `VERCEL_DEPLOYMENT_ID` | Identidad del build; mitiga desfasaje de versiones | prod | auto | No | Provista por Vercel | Vuelven los errores de "skew" al navegar con pestañas viejas |
| `VERCEL_PROJECT_PRODUCTION_URL` | URL canónica de producción | prod | auto | No | Provista por Vercel | — |
| `NODE_ENV` | Modo de ejecución | todos | auto | No | Provista | `unsafe-eval` quedaría en la CSP |

### Edge Function `send-event-push` (secretos de Supabase, **no** de Vercel)

| Variable | Propósito | Oblig. | Secreta | Si falta |
|---|---|:--:|:--:|---|
| `SUPABASE_URL` | Auto-provista por Supabase | Sí | No | 503 |
| `SUPABASE_ANON_KEY` | Verifica el token del llamador | Sí | No | 503 |
| `SUPABASE_SERVICE_ROLE_KEY` | Lee notificaciones y suscripciones | Sí | **Sí** | 503 |
| `VAPID_PUBLIC_KEY` | Firma Web Push | Sí | No | 503 |
| `VAPID_PRIVATE_KEY` | Firma Web Push | Sí | **Sí** | 503 |
| `VAPID_SUBJECT` | `mailto:` de contacto VAPID | Sí | No | 503 |

**Regla:** las claves VAPID privadas **nunca** van en Vercel. Viven sólo como
secretos de la función.

### 🔴 Deuda detectada

- `.env.example` **no incluye** `KV_REST_API_URL`, `KV_REST_API_TOKEN` ni
  `VERCEL_PROJECT_PRODUCTION_URL`. Un desarrollador nuevo no puede reproducir
  la configuración real de producción desde el repo.
- **No hay validación al iniciar.** Ninguna variable se valida en el arranque:
  las faltantes se descubren como un 500 en runtime. Debería existir un módulo
  que valide el conjunto obligatorio y falle rápido y claro.
- **No hay feature flags.** El runbook de release menciona desplegar "con la
  funcionalidad desactivada"; ese mecanismo **no existe** en el código.

---

## 2. Estado de los entornos

| Entorno | Existe | Proyecto Supabase | Datos | Notas |
|---|:--:|---|---|---|
| Local | ✅ | CLI (Postgres **15**) | `seed.sql` sintético | ⚠️ Major distinta a producción |
| CI | ✅ | CLI efímero | `seed.sql` | 3 jobs; no despliega |
| Demo | ✅ | `krxewmfauohixmmzsvkp` | Sintéticos | Cumple de facto el rol de staging |
| **Staging** | ❌ | — | — | **No existe.** El plan free permite 2 proyectos y están usados |
| Producción | ✅ | `rpdjjvcmtcpvmwrjqhke` | Reales | Postgres **17.6**, `us-east-1` |

Los previews de Vercel **no tienen variables de Supabase**, así que devuelven
500. No sirven como verificación previa.

---

## 3. Despliegue de código (procedimiento actual)

1. Rama desde `main`, cambios, PR.
2. CI corre 3 jobs: *Application quality* (lint, type-check, 444 tests, build),
   *Database pgTAP* (~527 asserts), *Playwright E2E*.
3. Vercel construye un preview (que hoy 500ea por falta de variables).
4. Merge a `main`.
5. **Vercel publica automáticamente.** No hay puerta ni verificación.

### 🔴 Procedimiento objetivo (a construir)

Insertar entre 4 y 5:

1. Identificador de versión: usar `VERCEL_DEPLOYMENT_ID` (ya cableado) y el SHA.
2. Verificación previa: `pnpm audit --audit-level=high` y verificación de que
   no hay migraciones pendientes.
3. Migración controlada (§5).
4. **Health check** contra `/api/health` (a construir) — debe verificar Supabase
   y Upstash, no sólo responder 200.
5. **Smoke test**: login de un usuario por rol + una lectura de cada área.
6. Confirmación explícita antes de promover a producción.
7. Verificación posterior: errores, latencia y tasa de 5xx durante 15 minutos.

---

## 4. Despliegue de la Edge Function

**No viaja con las migraciones ni con Vercel.** Hay que desplegarla a mano:

```bash
npx supabase functions deploy send-event-push --project-ref <REF_DEL_PROYECTO>
```

Verificar la versión resultante antes de dar por hecho el despliegue: la función
debe subir de `version` y el código servido debe contener los cambios.

---

## 5. Migraciones

### Procedimiento normal

```bash
# 1. Verificar qué se aplicaría (NUNCA a ciegas)
npx supabase migration list --linked

# 2. Aplicar
npx supabase db push --linked

# 3. Regenerar tipos y estrecharlos (obligatorio)
pnpm db:types
```

**Reglas no negociables** (heredadas de `operations/release-runbook.md`):
- Sólo migraciones **expansivas** en el mismo despliegue que el código.
- Las **contractivas** (drop de columna/tabla) van en una release posterior,
  nunca como mecanismo de rollback.
- Aplicar migraciones **antes** de mergear el código que las necesita.

### 🔴 Reconciliar la deriva actual (OPS-04) — requiere autorización

Hay **11 migraciones aplicadas con versión distinta** a la del repo (tabla
completa en §6 de la auditoría). Mientras no se reconcilie, `supabase db push`
desde un checkout limpio intentará reaplicarlas.

Opción recomendada — **alinear el registro, no el esquema** (el esquema ya es
correcto; lo que está mal es el índice de qué se aplicó):

1. **Backup primero.** Sin backup restaurable, no hacer esto (ver
   [`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md)).
2. Verificar equivalencia: para cada par, confirmar que el contenido aplicado
   coincide con el archivo del repo (comparar objetos creados, no texto).
3. Insertar en `supabase_migrations.schema_migrations` las 11 versiones del
   repo como ya aplicadas, y eliminar los 11 registros con timestamp espurio.
4. Confirmar: `npx supabase migration list --linked` no debe mostrar pendientes.
5. Verificar en un proyecto limpio que aplicar el repo desde cero produce el
   mismo esquema que producción.

El paso 5 es el que realmente cierra el hallazgo: mientras no exista, la
reproducibilidad sigue siendo una afirmación sin prueba.

---

## 6. Verificación posterior

| Qué | Cómo | Umbral |
|---|---|---|
| App responde | `/api/health` 🔴 | 200 y dependencias OK |
| Login por rol | Smoke test 🔴 | 3 roles entran |
| Errores | Panel de Vercel (hoy) / colector 🔴 | Sin pico de 5xx |
| Migraciones | `supabase migration list --linked` | Sin pendientes |
| Push | Provocar un evento y observar entrega | Llega al dispositivo |
| Rate limiting | Verificar que las vars `KV_*` existen | No en no-op |

Mientras no exista colector de logs, la "verificación posterior" es mirar el
panel de Vercel a mano durante unos minutos. Es insuficiente, y es exactamente
lo que resuelve el Bloque 1 del plan.

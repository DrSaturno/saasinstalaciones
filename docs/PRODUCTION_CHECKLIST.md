# Checklist de producción — Se Instala

**Fecha de evaluación:** 2026-09-04
**Estados:** ✅ PASS · ❌ FAIL · ⛔ BLOCKED (depende de plan/decisión) ·
➖ N/A · 👤 REQUIERE REVISIÓN HUMANA

**Resultado inicial: 11 PASS · 13 FAIL · 5 BLOCKED · 4 REQUIERE REVISIÓN HUMANA**

> **Actualización tras la remediación del mismo día.** Pasaron a ✅ PASS:
> #7 (auditoría de dependencias en CI), #14 (`.env.example`), #22 (paridad de
> Postgres), #24 (guarda de entorno en el seed), #33 (índices — sin cambio,
> ver nota), #39 (**era falso positivo**: las suites sí declaran plan), #40
> (scripts destructivos aislados + guarda en CI), #51 (`console.error` sin
> sanitizar), #54 (endpoint de salud), #57 (errores de frontend), #61 (fallos
> de push), #63 (timeouts), #68 (degradación ante caída de Supabase), #79
> (aviso si se cae el limitador), #83 (fuga de errores internos).
>
> **Sin cambio, y son los que importan:** #41–48 (backups y restauración),
> #85–86 (planes), #18 (staging), #28 (deriva de migraciones). Todos dependen
> de plan contratado o de una autorización explícita.

---

## Build y despliegue

| # | Ítem | Estado | Evidencia / qué falta |
|---|---|:--:|---|
| 1 | Build de producción funciona | ✅ | `pnpm build` corre en CI en cada PR |
| 2 | Instalación reproducible | ✅ | `pnpm install --frozen-lockfile`, lockfile versionado |
| 3 | Versión de runtime fijada | ✅ | `.nvmrc` = 22.14.0, `engines` en `package.json` |
| 4 | Identificador de versión en el despliegue | ✅ | `deploymentId` con `VERCEL_DEPLOYMENT_ID` |
| 5 | Mitigación de desfasaje de versiones (skew) | ✅ | Ídem. 👤 Verificar que Skew Protection esté activo en el panel |
| 6 | Artefacto y dependencias de dev separadas | ✅ | `devDependencies` correctas tras mover `shadcn` |
| 7 | Verificación previa al despliegue | ❌ | No hay `pnpm audit` ni verificación de migraciones en CI |
| 8 | Aprobación manual antes de producción | ❌ | Vercel publica `main` automáticamente |
| 9 | Smoke test posterior | ❌ | No existe |
| 10 | Estrategia de rollback de código | ✅ | Promover despliegue anterior en Vercel |
| 11 | Estrategia de rollback de datos | ❌ | **No existe**: sin `down`, sin PITR, sin backup |
| 12 | Destino de hosting inequívoco | 👤 | `output: "standalone"` apunta a SiteGround; ¿sigue vigente? |

## Configuración y entornos

| # | Ítem | Estado | Evidencia / qué falta |
|---|---|:--:|---|
| 13 | Variables obligatorias documentadas | ✅ | Matriz en `DEPLOYMENT_RUNBOOK.md` §1 |
| 14 | `.env.example` completo | ❌ | Faltan `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `VERCEL_PROJECT_PRODUCTION_URL` |
| 15 | Validación de variables al iniciar | ❌ | Ninguna; las faltantes aparecen como 500 en runtime |
| 16 | Separación de credenciales por entorno | ✅ | Proyectos Supabase distintos; secretos separados |
| 17 | Separación de datos por entorno | ✅ | Producción y Demo son proyectos distintos |
| 18 | Entorno de staging | ⛔ | **No existe**; el plan free permite 2 proyectos y están usados |
| 19 | Previews funcionales | ❌ | Sin variables de Supabase → 500 |
| 20 | Debug desactivado en producción | ✅ | `unsafe-eval` sólo en dev; sin `console.log` sueltos |
| 21 | Feature flags | ❌ | No existen (el release-runbook asume que sí) |
| 22 | Paridad de versión de Postgres | ❌ | Local/CI **PG 15** vs producción **PG 17.6** |
| 23 | Datos demo fuera de producción | ✅ | `seed.sql` sólo lo invoca el CLI local/CI… |
| 24 | …con guarda de entorno | ❌ | `seed.sql` **no tiene guarda**; sólo lo protege el camino de invocación |
| 25 | Credenciales iniciales seguras | ❌ | Contraseña de `platform_admin` versionada en 4 lugares |
| 26 | Procedimiento de alta del primer admin | ❌ | No documentado; se hace fuera de banda |

## Base de datos

| # | Ítem | Estado | Evidencia / qué falta |
|---|---|:--:|---|
| 27 | Migraciones versionadas | ✅ | 80 archivos, convención consistente |
| 28 | Repo = fuente de verdad del esquema | ❌ | **11 migraciones con versión distinta en producción** |
| 29 | Sin migraciones pendientes | 👤 | Coincide el total (80/80) pero no las versiones; verificar tras reconciliar |
| 30 | Sin operaciones destructivas de esquema | ✅ | Cero `DROP TABLE`/`DROP COLUMN`/`ALTER TYPE` |
| 31 | Compatibilidad hacia atrás verificada | ❌ | Nada la verifica; hay cambios de `CHECK` y firmas de función que rompen builds viejos |
| 32 | Índices adecuados | ✅ | 92 índices, buena cobertura de FK |
| 33 | Índices creados sin bloquear | ❌ | Cero `CONCURRENTLY`; GIN sobre tabla de crecimiento ilimitado |
| 34 | `lock_timeout` en migraciones | ❌ | Ninguna lo fija |
| 35 | RLS activa en todas las tablas | ✅ | Verificado en la auditoría de seguridad |
| 36 | Base no expuesta públicamente | ✅ | Todo por PostgREST; sin cadena de conexión directa en la app |
| 37 | Configuración del pool representada en el repo | ❌ | Es estado del panel; nada la versiona |
| 38 | Tests de base | ✅ | 42 suites pgTAP, ~527 asserts, en CI |
| 39 | …todas afirmando algo | ❌ | 2 suites sin `select plan()` |
| 40 | Scripts destructivos aislados | ❌ | `reset_a_cero.sql` y `limpiar_usuarios.sql` junto a las migraciones |

## Backups y recuperación

| # | Ítem | Estado | Evidencia / qué falta |
|---|---|:--:|---|
| 41 | Backups automáticos | ⛔ | Plan `free`: no los provee |
| 42 | PITR | ⛔ | Complemento de pago |
| 43 | Retención definida | ⛔ | Depende de 41 |
| 44 | **Restauración probada** | ❌ | **Nunca ejecutada** |
| 45 | RPO definido y alcanzable | ❌ | Indefinido; hoy infinito |
| 46 | RTO definido y alcanzable | ❌ | Indefinido |
| 47 | Backup de Storage | ❌ | La evidencia de obra no se respalda |
| 48 | Backup de configuración y secretos | ❌ | Sólo en paneles |

## Observabilidad

| # | Ítem | Estado | Evidencia / qué falta |
|---|---|:--:|---|
| 49 | Logs estructurados | ✅ | `lib/observability.ts`: JSON, redacción, truncado — bien hecho |
| 50 | Sin datos sensibles en logs | ✅ | Redacción por clave + disciplina verificada |
| 51 | …sin excepciones | ❌ | 4 `console.error` sin sanitizar (email, reset de contraseña) |
| 52 | Destino de logs con retención | ❌ | `console` → stdout efímero de Vercel |
| 53 | Alertas activas | ❌ | 7 diseñadas, **0 implementables hoy** |
| 54 | Endpoint de salud | ❌ | No existe |
| 55 | Monitor de uptime | ❌ | No existe (ni hay qué sondear) |
| 56 | Errores de backend capturados | ❌ | 89 de 107 `catch` descartan el error |
| 57 | Errores de frontend capturados | ❌ | El boundary descarta `error` y `digest` |
| 58 | IDs de correlación | ❌ | Sólo en 3 flujos; ausentes en middleware y 7 de 10 rutas |
| 59 | Métricas de duración | ❌ | `observeOperation` con 0 usos |
| 60 | Visibilidad de la cola offline | ❌ | Los eventos quedan en el teléfono del instalador |
| 61 | Visibilidad de fallos de push | ❌ | `catch {}` vacío |
| 62 | Trazas | ➖ | Fuera de alcance para esta etapa |

## Resiliencia

| # | Ítem | Estado | Evidencia / qué falta |
|---|---|:--:|---|
| 63 | Timeouts en llamadas externas | ❌ | Sólo el clima (1 de 7) |
| 64 | Reintentos con backoff | ❌ | Cero reintentos del lado servidor |
| 65 | Idempotencia de mutaciones de campo | ✅ | UUID de cliente + upsert; **muy bien resuelto** |
| 66 | Sin doble procesamiento | ✅ | `ignoreDuplicates`, no-op idempotente en transiciones |
| 67 | Claves de idempotencia en email | ✅ | `Idempotency-Key` en Resend |
| 68 | Degradación ante caída de Supabase | ❌ | Deslogueo masivo; sólo el instalador tiene caché |
| 69 | Degradación ante caída de push/email | ✅ | No bloquean (salvo el alta de empresa, que revierte a propósito) |
| 70 | Jobs programados | ❌ | **No hay scheduler**: los recordatorios nunca se emiten |
| 71 | Entrega de push registrada con precisión | ❌ | `push_sent_at` se marca aunque falle |
| 72 | Operaciones acotadas a escala | ❌ | Sync de calendario recorre todo sin paginar |
| 73 | Webhooks entrantes seguros | ➖ | No hay webhooks entrantes |
| 74 | Callbacks OAuth con CSRF | ✅ | Verificación de `state` contra cookie |

## Seguridad (heredado de `SECURITY_AUDIT.md`)

| # | Ítem | Estado | Evidencia |
|---|---|:--:|---|
| 75 | HTTPS y HSTS | ✅ | Gestionado por Vercel + cabecera HSTS |
| 76 | CSP enforcing | ✅ | SEC-07 |
| 77 | MFA para roles sensibles | ✅ | SEC-13, TOTP habilitado en producción |
| 78 | Rate limiting | ✅ | SEC-08 + Upstash aprovisionado |
| 79 | …con aviso si se cae | ❌ | Falla abierto y el log se auto-redacta |
| 80 | RPCs no expuestas a `anon` | ✅ | SEC-01/02/03 |
| 81 | Límites en buckets de Storage | ✅ | SEC-05/09 |
| 82 | Protección de contraseñas filtradas | ⛔ | Requiere plan Pro de Supabase |
| 83 | Sin fuga de errores internos | ❌ | 2 casos (`/api/master/companies`, toast de chat) |
| 84 | Captcha **desactivado** | ✅ | Correcto: la app no lo implementa; activarlo rompería el login |

## Plataforma y contrato

| # | Ítem | Estado | Evidencia |
|---|---|:--:|---|
| 85 | Plan de Supabase apto para producción | ⛔ | `free`: sin backups, se pausa por inactividad |
| 86 | Plan de Vercel apto para uso comercial | 👤 | Hobby: **prohíbe uso comercial**, sin SLA. Verificar y subir |
| 87 | Proyectos huérfanos limpiados | ❌ | `Base 3 - Legacy` inactivo en la organización |
| 88 | Dominio y certificado | ✅ | Gestionados por Vercel |
| 89 | Responsables definidos | ❌ | `environment-matrix.md` los deja sin completar |
| 90 | Política de retención de datos | ❌ | No definida |

---

## Los cinco que hay que cerrar primero

Si sólo se pudieran arreglar cinco cosas antes de operar, estas:

1. **#41–46 — Backups y restauración.** Sin esto, cualquier error es
   irreversible. Requiere plan Pro. Es el motivo del NO-GO.
2. **#40 — Aislar los scripts destructivos.** Cuesta cinco minutos y quita el
   riesgo individual más grande del repositorio.
3. **#28 — Reconciliar la deriva de migraciones.** Sin esto no hay despliegue
   reproducible y el verde de CI no significa nada sobre producción.
4. **#52–55 — Un destino de logs, un endpoint de salud y un monitor.** Sin esto
   se opera a ciegas: el tiempo de detección de cualquier incidente es
   impredecible.
5. **#86 — Plan de Vercel.** Es un riesgo contractual, no técnico, y no se
   resuelve con código.

**Los tres primeros son baratos o son sólo dinero. Ninguno es un problema de
ingeniería difícil.** Ese es el dato alentador de esta auditoría: el producto
está mejor construido que operado.

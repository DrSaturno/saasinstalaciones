# Instala Pro — Estado del proyecto

> Última sesión: 2026-07-20 · Próximo paso: **Paso 8 — PWA del instalador**
> Deploy a Vercel: en progreso (env vars configuradas)

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
- **Instalador** (`installer`) — PWA mobile offline-first (todavía no construida).

Fusiona dos proyectos legacy (`../proyecto1*` y `../proyecto2*`), que quedan
**solo como referencia de lógica** — no se copia código.

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript strict · Tailwind v4 ·
shadcn/ui (radix-nova) · Supabase (Postgres + RLS + Auth + Storage) ·
TanStack Query/Table/Virtual · next-intl (pendiente, Paso 12) · Vitest · pnpm.

## Infraestructura

- **Repo:** https://github.com/DrSaturno/saasinstalaciones (rama `main`)
- **Supabase:** proyecto `rpdjjvcmtcpvmwrjqhke` (URL en `.env.local`, NO commiteado)
- **Deploy:** todavía no (Vercel — Paso 14)

### Cómo levantar en local
```bash
cd instalapro
pnpm install          # node-linker=hoisted, ver nota de entorno abajo
pnpm dev              # http://localhost:3000
pnpm test             # 11 tests del parser CSV
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
20 órdenes en varios estados, 1 calificación.

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

## Próximo: Paso 8 — PWA del instalador (online)

El área del instalador, mobile-first (diseñar a 375px). Por ahora ONLINE (el
offline con Serwist+Dexie es el Paso 9). A construir:
1. `/tasks`: lista de órdenes asignadas al instalador logueado (RLS
   `work_orders_installer_read` ya filtra por `assigned_installer_id`).
2. Detalle de tarea: ver el punto, iniciar trabajo, cargar avances
   (`order_updates`: checkin/progress/blocker/done) con foto opcional.
3. El instalador mueve la orden en_proceso → en_revision al terminar
   (transiciones del instalador; el manager aprueba a finalizada).
4. Manifest PWA + íconos (instalable). Service worker offline recién en Paso 9.

Ojo regla #5: las mutaciones del instalador deben ser idempotentes (uuid
generado en cliente) para cuando llegue el offline. `order_updates.id` ya se
genera en cliente por diseño.

## Pasos siguientes (resumen)
7 — Invitaciones y roster · 8 — PWA instalador (tareas + avances online) ·
9 — Offline (Serwist + Dexie) · 10 — Calificaciones · 11 — Bolsa de zona +
notificaciones · 12 — i18n pt-BR · 13 — Landing + pulido · 14 — Deploy + `/cyber-neo`.

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

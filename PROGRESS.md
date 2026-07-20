# Instala Pro — Estado del proyecto

> Última sesión: 2026-07-20 · Próximo paso: **Paso 6 — Órdenes de trabajo**
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

## Próximo: Paso 6 — Órdenes de trabajo

El corazón del sistema (lógica de proyecto1). A construir:
1. Crear órdenes: individual y **masiva "una por punto"** de un proyecto.
2. **Máquina de estados** con validación server-side vía una acción
   `transitionOrder` (el trigger `validate_order_transition` ya existe en la DB;
   la regla no negociable #4 dice que el status solo cambia por ahí, nunca por
   update directo). Estados: pendiente → relevamiento → planificada → en_proceso
   → en_revision → finalizada | cancelada.
3. Asignación de instalador desde el roster de la empresa.
4. Vista `/orders` con filtros por estado/instalador y detalle de orden.

Reutilizar: `components/shared/status-badge.tsx`, `lib/domain/status.ts`,
`lib/actions/projects.ts` (patrón `requireManager`), la tabla virtualizada.

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

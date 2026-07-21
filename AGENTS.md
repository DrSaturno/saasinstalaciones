<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Instala Pro

SaaS B2B multi-tenant para gestionar equipos de instaladores de gráfica de gran formato en proyectos masivos (ej. 2000 estaciones de servicio). Tres áreas: tablero maestro (platform_admin), empresa (company_manager) e instalador (PWA mobile offline-first). El plan completo vive en `../BLUEPRINT.md` — seguir su orden de construcción.

## Commands

- `pnpm dev` — Dev server
- `pnpm build` — Production build
- `pnpm lint` — Lint
- `pnpm test` — Vitest
- `supabase db push` — Aplicar migraciones
- `supabase gen types typescript --linked > types/database.ts` — Regenerar tipos (tras CADA migración)

## Tech Stack

Next.js 16 (App Router) + TypeScript strict + Tailwind v4 + shadcn/ui (radix-nova) + Supabase (Postgres/Auth/Storage/Realtime, RLS) + next-intl (es/pt) + Serwist/Dexie (PWA offline) + Vercel

## Architecture

- `app/(master)|(company)|(installer)/` — tres apps por route group; `proxy.ts` (el middleware de Next 16) resuelve `profiles.role` y enruta.
- Lecturas: Server Components + cliente server Supabase. Mutaciones: Server Actions con Zod. `/api` solo para push, webhooks y tablero maestro.
- `lib/supabase/admin.ts` (service_role) SOLO se importa en `app/api/master/**` y en `lib/actions/invite-signup.ts` (alta de instalador por invitación: crea el usuario con rol fijo `installer` server-side, el cliente nunca controla el rol). Importarlo en cualquier otro lado es un bug de seguridad.
- Área installer: mutaciones pasan por `lib/offline/sync.ts` (cola Dexie, idempotente por uuid generado en cliente).
- `supabase/migrations/` es la única fuente de verdad del schema. Nada de cambios manuales en el dashboard.

## Code Organization Rules

1. Un componente por archivo, máx 300 líneas.
2. Imports con `@/`. Sin barrel exports.
3. Server Components por defecto; `"use client"` solo con interactividad real.
4. Todo string visible via next-intl (`messages/es.json` + `pt.json`). Cero texto hardcodeado.
5. Toda tabla de dominio nueva lleva `company_id` + política RLS en la misma migración.

## Design System

Tokens definidos en `app/globals.css` (:root). Colores: primary #2597d0 · primary-soft #c0eaff · bg #fafafa · surface #fff · text #070709 · text-2 #60606c · muted #868c98 · cream #ffecc0 · lavender #c0d5ff · purple #371866 · success #43a047 · warning #ff9800 · destructive #d32f2f.
Estados de orden (clases `status-*`): pendiente #868c98 · relevamiento #2196f3 · planificada #c0d5ff · en_proceso #2597d0 · en_revision #ffecc0 · finalizada #43a047 · cancelada #d32f2f.
Tipografía: Inter (sans/headings — Open Runde pendiente de agregar como woff2 local), Fragment Mono (números de orden, KPIs, códigos → `font-mono`).
Estilo: claro y aireado, bordes sutiles en vez de sombras, radius 10-14px, chips pastel, transiciones 150ms. Sin dark mode en v1. Área installer se diseña a 375px primero.

## Environment Variables

| Variable | Description |
|----------|-------------|
| NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY | Cliente Supabase (RLS aplica) |
| SUPABASE_SERVICE_ROLE_KEY | Solo server, solo /api/master |
| NEXT_PUBLIC_VAPID_PUBLIC_KEY | Clave pública Web Push en Next/Vercel |
| VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT | Secretos de la Edge Function de Supabase; nunca en Next |
| RESEND_API_KEY | Emails de invitación |
| RESEND_FROM_EMAIL | Remitente Resend de un dominio verificado |
| APP_URL | Origen público usado en links de invitación por email |

## Reglas No Negociables

1. TypeScript strict, sin `any`. Tipos de DB solo desde `types/database.ts` generado.
2. RLS activa en toda tabla; ningún dato cruza tenants. Test de RLS obligatorio por tabla nueva.
3. `SUPABASE_SERVICE_ROLE_KEY` jamás en client ni con prefijo NEXT_PUBLIC.
4. Transiciones de estado de órdenes solo por `transitionOrder` (server valida); nunca update directo de `status`.
5. Mutaciones del área installer siempre idempotentes (uuid cliente) — el retry offline no puede duplicar.
6. Nunca commitear `.env*`. Nunca loggear tokens ni URLs firmadas.
7. Los proyectos legacy (`../proyecto1*`, `../proyecto2*`) son solo referencia de lógica de negocio; no copiar código.

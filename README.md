# InstalaPro

Plataforma multiempresa para coordinar proyectos, locaciones, órdenes de trabajo e instaladores. Está construida con Next.js, React, TypeScript, Supabase/Postgres con RLS y una PWA con Dexie para operación de campo.

## Desarrollo local

Requisitos fijados: Node `22.14.0`, pnpm `11.9.0`, Docker y Supabase CLI.

```bash
pnpm install --frozen-lockfile
supabase start
supabase db reset
pnpm dev
```

Copiar `.env.example` a `.env.local` y usar las credenciales locales que informa Supabase. La aplicación queda disponible en [http://localhost:3000](http://localhost:3000).

## Verificación

```bash
pnpm lint
pnpm type-check
pnpm test
supabase test db
pnpm build
```

## Evolución SDD

La especificación derivada de la reunión del 04-08-2026 está en [`docs/specs/2026-08-04-evolucion-producto`](docs/specs/2026-08-04-evolucion-producto/README.md), con requisitos, estado actual, diseño, ADRs y releases R0–R9.

Documentación operativa:

- [`docs/BACKUP-PRE-SDD-20260805.md`](docs/BACKUP-PRE-SDD-20260805.md): punto de restauración previo.
- [`docs/operations/environment-matrix.md`](docs/operations/environment-matrix.md): entornos, accesos y umbrales.
- [`docs/operations/release-runbook.md`](docs/operations/release-runbook.md): canary y rollback.
- [`docs/operations/quality-evidence-template.md`](docs/operations/quality-evidence-template.md): evidencia exigida por gate.

## Seguridad

No usar datos productivos en local o staging. `SUPABASE_SERVICE_ROLE_KEY`, claves de email, Google OAuth y cifrado son secretos exclusivos de servidor. Toda tabla o bucket nuevo debe tener RLS/Storage policies y pruebas negativas entre al menos dos empresas.

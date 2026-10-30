# Tareas

## Estado (24-09-2026)

**Implementado y verificado en Demo; producción sin tocar.** Falta la verificación visual y
llevarlo a producción (ver `docs/PENDIENTES_NICOLAS.md`).

- **Migración aplicada a Demo:** `supabase/migrations/20260924000001_shared_locations.sql`. En Demo
  había 60 locaciones: quedaron 60 vínculos de origen, 60 asociaciones a proyectos y 60 eventos, sin
  códigos distintos entre la ficha y los puntos (AC-LOCSHARE-F). La migración se aborta sola si los
  conteos no coinciden.
- **Pruebas de base, contra Demo con el arnés de pgTAP:** la suite nueva `shared_locations` (19/19) y
  las existentes `canonical_locations` (28/28, con el mensaje de error actualizado),
  `sites_projection_sync` (8/8), `locations_insert_returning` (6/6) y las dos invariantes de
  `rpc_execute_hardening` (2/2, incluyendo las funciones nuevas). **Sin correr:** el resto de las
  suites de base y los E2E (los corre el CI).
- **Código:** `pnpm type-check`, `pnpm lint`, `pnpm test` (638 pruebas) y `pnpm build` en verde.
  Pruebas nuevas: `canonical-locations.attach.test.ts` (5, con mutación verificada: si no se crea el
  vínculo, fallan) y 2 casos nuevos en `sites.test.ts`.
- **Tipos** editados a mano (`client_locations`, `can_read_location_client`); regenerar con el CLI.
- **Aviso menor de Supabase:** las claves foráneas compuestas nuevas sin índice que las cubra
  (informativo, el proyecto ya tiene decenas iguales). `client_locations` tiene un índice
  `(company_id, client_id)` pero la clave es `(client_id, company_id)`: si el volumen lo pide, se
  agrega el índice en ese orden.

## Fase 0 — Pruebas primero (pgTAP)

- [x] **LOCSHARE-T-01** — `supabase/tests/shared_locations.test.sql` (19). → AC-LOCSHARE-A..E

## Fase 1 — Migración (Demo)

- [x] **LOCSHARE-T-02** — Tabla `client_locations` con RLS y grants. → DEC-01
- [x] **LOCSHARE-T-03** — Relleno de un vínculo por locación y verificación de conteos (aborta si no
  coincide). → DEC-06, AC-LOCSHARE-F
- [x] **LOCSHARE-T-04** — Trigger de vínculo de origen al insertar una locación (`BEFORE INSERT`, con
  la clave a `locations` diferida) y trigger que sigue el código de origen. → DEC-06
- [x] **LOCSHARE-T-05** — Las cuatro claves foráneas apuntan al vínculo. Hubo que forzar la
  comprobación de la clave diferida (`set constraints all immediate`) antes de los `ALTER`, porque
  Postgres no deja alterar una tabla con eventos de trigger pendientes. → DEC-02
- [x] **LOCSHARE-T-06** — Funciones de validación por vínculo (4). → DEC-04
- [x] **LOCSHARE-T-07** — Código del local por vínculo (`sync_site_identity_from_location`,
  `propagate_location_identity_to_sites` y propagación desde `client_locations`). → DEC-03
- [x] **LOCSHARE-T-08** — `can_read_location_client` y las políticas de documentos, requisitos y
  eventos por cliente. → DEC-05

## Fase 2 — Código

- [x] **LOCSHARE-T-09** — `attachCanonicalLocations` asegura el vínculo y no exige cliente de origen.
  → DEC-07
- [x] **LOCSHARE-T-10** — Importación: reconoce existentes por el vínculo del cliente. → R3.4
- [x] **LOCSHARE-T-11** — Reutilización: lista y vincula locaciones de otros clientes, indicando de
  cuál vienen y sin mostrar su código. → R1.2
- [x] **LOCSHARE-T-12** — Documentos con el cliente del proyecto desde el que se suben. → R4.1
- [x] **LOCSHARE-T-13** — Conteo de locaciones por cliente y detalle del cliente por el vínculo (las
  órdenes del detalle son sólo las de proyectos de ese cliente); la ficha dice qué clientes la usan
  («Locación compartida por: …»). Edición del código desde el proyecto de un cliente: va a su vínculo y
  no pisa el de otro. → R3, R4.3
- [x] **LOCSHARE-T-14** — Informe de divergencia contra el vínculo. → riesgo de falsos positivos
- [x] **LOCSHARE-T-15** — Tipos (a mano) y cadenas es/pt.

## Fase 3 — Verificación

- [x] **LOCSHARE-T-16** — `pnpm type-check`, `pnpm lint`, `pnpm test`, `pnpm build`.
- [x] **LOCSHARE-T-17** — Suites de base relacionadas en Demo con el arnés.
- [ ] **LOCSHARE-T-18** — Verificación visual (Nicolás). Ver `docs/PENDIENTES_NICOLAS.md`.

## Fase 4 — Producción (requiere autorización explícita)

- [ ] **LOCSHARE-T-19** — Backup confirmado, aplicar la migración, comparar conteos, desplegar.
  **Orden a tener en cuenta:** el código nuevo necesita la tabla; la migración no rompe el código
  anterior (el vínculo de origen se crea solo), así que se aplica primero la migración y después se
  despliega el código.

## Riesgos abiertos

- **La lectura de eventos de cambio pasó a ser por cliente** (`location_change_events`): quien opera un
  proyecto del cliente B no ve el historial de ediciones registradas bajo el cliente de origen A. El
  gerente los ve todos. Es lo que evita filtrar el código del local de otro cliente por el historial,
  pero es un cambio de comportamiento a confirmar con Nicolás.
- **Locaciones duplicadas ya existentes** no se fusionan (fuera de alcance).
- **Cambiar el cliente de un proyecto** ahora exige que sus locaciones estén vinculadas al cliente
  nuevo; no hay todavía una pantalla para vincularlas antes del cambio.

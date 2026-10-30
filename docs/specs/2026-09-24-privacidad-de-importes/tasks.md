# Tareas

## Estado (24-09-2026)

Implementado y verificado **en Demo**. Producción **no se tocó**. Pendiente: T-03,
T-20 (parte visual) y toda la Fase 5.

- **Migración A aplicada a Demo** (`20260924000000_order_pricing_privacy.sql`). Demo no
  tenía importes cargados, así que el backfill movió 0 filas; el desvío y el
  vaciado se probaron con datos creados dentro de una transacción abortada.
- **Pruebas:** `supabase/tests/order_pricing_privacy.test.sql` corrida contra Demo
  con un arnés (`finish()` sin diagnósticos, plan de 25 coincidente); **no la ejecutó
  todavía el CI** (no hay Docker local). Antes de la migración, la misma
  escritura de un instalador (`installer_amount`, `payment_status`) afectaba todas
  sus filas; ahora da `42501`. `pnpm type-check`, `pnpm lint` y `pnpm test`
  (581 pruebas) en verde. **Los E2E no se corrieron** (necesitan Docker/CI).
- **Cambio respecto del diseño (PRIV-DEC-04):** la migración A ya **vacía** las
  columnas viejas y un trigger desvía a las tablas nuevas lo que el código anterior
  les escriba. Así la fuga queda cerrada desde A y no recién en la contracción.
  La contracción (T-23) pasa a ser limpieza: quitar las columnas, los desvíos y la
  referencia de `formalize_project_from_broadcast`, y ajustar la aserción de
  `broadcast_quotes.test.sql` (`w.amount` → ausencia de fila en
  `work_order_pricing`). **No se agregó al repo a propósito**: si viajara junto con
  A, un `db push` rompería la versión desplegada del código.
- **Verificación adicional (24-09-2026, tarde), contra Demo:** además de la suite nueva
  se corrieron con el mismo arnés `rpc_execute_hardening` (15/15; la invariante de
  «ninguna `security definer` fuera de la allowlist ejecutable por `anon`» sigue en
  verde con las funciones nuevas), `installer_finance` (14/14), `field_flow_states`
  (10/10), `broadcast_quotes` (24/24; `formalize_project_from_broadcast` no genera
  filas de precios), `atomic_order_status_change` (10/10) y `no_self_approval` (6/6),
  o sea 104 aserciones. El arnés tiene control negativo: una aserción que falla
  se reporta. `pnpm build` de producción compila. Los avisos de seguridad de
  Supabase (Demo) quedan idénticos a los de antes (14/16/61/1) y **no mencionan**
  ningún objeto nuevo. **Sin correr:** las ~40 suites restantes y los E2E.
- **Tipos:** `types/database.ts` se editó a mano (dos tablas y una función). Hay que
  regenerarlo con el CLI apuntando a Demo cuando haya CLI disponible.
- **No verificado visualmente:** las pantallas están tras el login. Verificar a mano
  con un gerente y un instalador de Demo: alta y edición de orden con importe,
  proyecto por contrato, finanzas, tablero y PDF descargado por cada rol.

Orden estricto. Nada llega a producción sin autorización explícita y sin
haberse probado en Demo.

## Fase 0 — Preparación

- [x] **PRIV-T-01** — Pregunta O1 resuelta: el coordinador **no** ve el precio
  al cliente; sólo el gerente y quienes éste habilite (bloque 4). → PRIV-DEC-02,
  PRIV-R1.4
- [x] **PRIV-T-02** — Inventariar las columnas que escribe el instalador hoy
  (`lib/actions/orders/*`, `lib/actions/tasks.ts`, `lib/offline/sync.ts`,
  RPC `atomic_order_status_change`) y fijar la lista blanca. → PRIV-DEC-03,
  PRIV-R2.2
- [ ] **PRIV-T-03** — Antes de tocar producción: confirmar en el panel que hay al
  menos un backup diario de Supabase. → PRIV-DEC-04 (riesgos)

## Fase 1 — Pruebas que fallan primero (pgTAP)

- [x] **PRIV-T-04** — `supabase/tests/order_pricing_privacy.test.sql`:
  el instalador no lee importes comerciales. → AC-PRIV-A
- [x] **PRIV-T-05** — Mismo archivo: el instalador no puede escribir
  `installer_amount`, `payment_status` ni reasignarse. Debe fallar **antes** de
  la migración (reproduce el hallazgo). → AC-PRIV-B
- [x] **PRIV-T-06** — El gerente sí lee y escribe importes; el gerente de **otra**
  empresa no. → PRIV-R4.1, RLS obligatoria por tabla nueva
- [x] **PRIV-T-06b** — El coordinador (sin ser gerente) no ve ninguna fila de las
  tablas de precios y conserva el resto de sus permisos sobre órdenes.
  → AC-PRIV-A2, PRIV-R1.4

## Fase 2 — Migración A (expand)

- [x] **PRIV-T-07** — Tablas `work_order_pricing` y `project_pricing` con
  `company_id` y RLS en la misma migración. → PRIV-DEC-01
- [x] **PRIV-T-08** — `auth_can_see_commercials(company_id)`. → PRIV-DEC-02
- [x] **PRIV-T-09** — Backfill desde `work_orders.amount` y
  `projects.contract_amount`, con conteo y suma verificados. → AC-PRIV-E
- [x] **PRIV-T-10** — Trigger de lista blanca de columnas para el instalador.
  → PRIV-DEC-03
- [x] **PRIV-T-11** — Sincronización entre columnas viejas y tablas nuevas
  mientras coexistan. → PRIV-DEC-04
- [~] **PRIV-T-12** — Regenerar tipos contra Demo + `narrow-database-types`. (Editados a mano: falta regenerar con el CLI.)

## Fase 3 — Código

- [x] **PRIV-T-13** — Lecturas de la empresa: `lib/data/{orders,finance,dashboard}.ts`,
  páginas de orden, proyecto y sitio. → PRIV-R4.1
- [x] **PRIV-T-14** — Escrituras: `lib/actions/orders/{intake,bulk}.ts`,
  `lib/actions/projects/crud.ts`, `lib/actions/broadcasts.ts` (donde el
  formalizar proyecto copia `contract_amount`).
- [x] **PRIV-T-15** — Formularios y tablas de la empresa que muestran o editan el
  importe (`order-form-*`, `edit-order-dialog`, `orders-table`,
  `project-form-fields`, `create-orders-dialog`).
- [x] **PRIV-T-16** — PDF según rol: `app/api/orders/[id]/pdf/route.tsx` y
  `lib/pdf/order-document.tsx`; el instalador ve «Tu paga». Prueba con importes
  distintos. → PRIV-R3.1, PRIV-R3.2, AC-PRIV-C
- [x] **PRIV-T-17** — Verificar que Realtime y las exportaciones no incluyan
  importes comerciales. → PRIV-DEC-06
- [x] **PRIV-T-18** — Cadenas nuevas en `messages/es.json` y `pt.json`.

## Fase 4 — Verificación

- [~] **PRIV-T-19** — `pnpm lint`, `pnpm test`, type-check, pgTAP completo y E2E
  de la empresa. → AC-PRIV-D. (Hechos: lint, test, type-check y la suite nueva de pgTAP
  contra Demo. **Sin correr:** las otras ~46 suites de pgTAP y los E2E; los corre el CI.)
- [~] **PRIV-T-20** — Aplicar A a **Demo**, repetir la prueba de escritura y de
  lectura con un instalador real de Demo. (No puedo ver pantallas: ver memoria
  de verificación visual.)

## Fase 5 — Producción y cierre (requiere autorización explícita)

- [ ] **PRIV-T-21** — Aplicar A a producción tras backup confirmado; comparar
  conteos y sumas. → AC-PRIV-E
- [ ] **PRIV-T-22** — Publicar el código nuevo.
- [ ] **PRIV-T-23** — **Migración B (contract):** quitar `work_orders.amount` y
  `projects.contract_amount`. Recién acá se cierra PRIV-R1. → PRIV-DEC-04
- [ ] **PRIV-T-24** — Marcar en `docs/SECURITY_AUDIT.md` un hallazgo nuevo con
  este cierre y actualizar `docs/PRODUCTION_CHECKLIST.md`.

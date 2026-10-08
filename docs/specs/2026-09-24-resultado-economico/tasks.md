# Tareas

## Fase 0 — Pruebas primero (pgTAP)

- [x] **RESULT-T-01** — `supabase/tests/project_expenses.test.sql`: sólo
  quien pasa `auth_can_see_commercials` puede ver/cargar/borrar; un
  coordinador y un instalador no ven nada; un gerente de otra empresa no ve
  ni puede escribir; FK cruzada proyecto↔empresa se respeta. → RESULT-R1.
  9 assertions, verificadas contra Demo con el arnés manual (fixtures en una
  llamada que confirma, diagnóstico en otra).

## Fase 1 — Migración (Demo)

- [x] **RESULT-T-02** — Tabla `project_expenses` (concepto, monto, fecha,
  `created_by`, `company_id`, `project_id`) + RLS `auth_can_see_commercials`,
  separada en policies de select/insert/delete (sin `update`: la app corrige
  borrando y volviendo a cargar, no hay ninguna escritura que necesite esa
  política).

## Fase 2 — Código

- [x] **RESULT-T-03** — `lib/actions/project-expenses.ts`:
  `addProjectExpense`, `deleteProjectExpense`.
- [x] **RESULT-T-04** — `lib/domain/project-performance.ts`: `buildProjectPerformance`
  ganó `otherCosts` (5º parámetro, default 0) y lo resta de `profit`;
  `ProjectPerformance` ganó `otherCosts` y `completionPct`. `costMissing`
  ajustado: con gastos cargados ya hay algo real que mostrar aunque falte el
  costo de instaladores. 5 tests nuevos.
- [x] **RESULT-T-05** — `lib/domain/finance.ts`: `FinanceProjectInput` ganó
  `otherCosts?`; se resta en `margin` por proyecto y se sube a
  `currency.realizedCost` para el margen a nivel moneda. `lib/data/finance.ts`:
  nueva consulta a `project_expenses`, sumada por proyecto en un `Map` antes
  de llamar a `buildFinancialOverview`.
- [x] **RESULT-T-06** — `components/company/order-completion-pie.tsx`: dona
  SVG pura (círculo con `stroke-dasharray`), sin librería nueva.
- [x] **RESULT-T-07** — `components/company/project-expenses-panel.tsx`:
  formulario inline (concepto/monto/fecha) + lista + borrado.
- [x] **RESULT-T-08** — Wiring en `app/(company)/projects/[id]/page.tsx`:
  fetch de gastos y sus autores, `otherCosts` a `buildProjectPerformance`,
  torta dentro de `ProjectPerformancePanel`, panel de gastos debajo.
  **Hallazgo de paso, corregido**: esta página pasaba `canManageFinance`
  **fijo en `true`** a `EditProjectDialog` y `ProjectSitesActions` desde
  antes del bloque 4 — cualquier subcuenta sin permiso de finanzas editaba
  igual el monto de contrato y el precio por instalación. Se corrigió con el
  mismo cálculo `isOwner || canManageFinance` que ya usa `/finance` y
  `/settings`, porque el panel de gastos nuevo necesitaba exactamente ese
  valor y dejar el viejo hardcodeo al lado habría sido un remiendo a medias.
- [x] **RESULT-T-09** — Wiring en `lib/data/finance.ts` (ver T-05): la
  pantalla `/finance` no necesitó cambios propios, `FinanceProjects` ya
  muestra `project.margin`, que ahora viene corregido desde el dominio.
- [x] **RESULT-T-10** — Tipos de base (a mano): `project_expenses`. Cadenas
  es/pt: `ProjectPerformance.otherCosts/completionTitle/ordersDone/ordersOpen`,
  namespace `ProjectExpenses` completo.

## Fase 3 — Verificación

- [x] **RESULT-T-11** — `pnpm type-check`, `pnpm lint`, `pnpm test` (653),
  `pnpm build` — los cuatro en verde.
- [ ] **RESULT-T-12** — pgTAP de regresión (`order_pricing_privacy`,
  `company_staff`) **no se volvió a correr**: este bloque no modificó
  ninguna función ni policy existente, sólo agregó una tabla nueva con
  policies propias — bajo riesgo, pero no confirmado de nuevo.
- [ ] **RESULT-T-13** — Verificación visual (Nicolás): cargar un gasto, ver
  la ganancia bajar en la ficha del proyecto y en `/finance`, ver la torta, y
  confirmar que una subcuenta sin permiso de finanzas ya NO puede editar el
  monto de contrato de un proyecto (el hallazgo de T-08).

## Fase 4 — Producción (requiere autorización explícita)

- [ ] **RESULT-T-14** — Backup confirmado, aplicar la migración, desplegar.

# Tareas

## Fase 0 — Pruebas primero (pgTAP)

- [x] **LINKCLI-T-01** — `supabase/tests/project_tracking_links.test.sql`:
  sólo quien opera el proyecto genera/revoca; generar uno nuevo revoca el
  anterior (nunca dos activos); `project_tracking_snapshot` con token válido
  devuelve lo esperado y con token inexistente/revocado devuelve
  `valid:false`; la política de storage deja firmar fotos de un link activo
  y NO deja firmar las de uno revocado ni las de otro proyecto. → LINKCLI-R1..R3.
  23 assertions, cada una verificada individualmente contra Demo con el
  arnés manual de diagnóstico (fixtures y generación de tokens en llamadas
  que confirman, chequeos en llamadas separadas que pueden lanzar
  diagnóstico completo sin perder el estado ya escrito).

## Fase 1 — Migración (Demo)

- [x] **LINKCLI-T-02** — Tabla `project_tracking_links` + índice único
  "un activo por proyecto" + RLS (`can_operate_project`, lado empresa).
- [x] **LINKCLI-T-03** — `rotate_project_tracking_link(p_project_id)`
  (revoca el activo si existe, crea uno nuevo, misma transacción, devuelve
  el TOKEN no el id) y `revoke_project_tracking_link(p_project_id)`.
- [x] **LINKCLI-T-04** — `project_tracking_snapshot(p_token)`: valida token
  + empresa activa, arma proyecto/avance/hitos/fotos. Devuelve `doneCount`/
  `totalCount` SIN el tope de 200 de `milestones`, para que la torta no
  salga mal en un proyecto de miles de puntos. Revoke explícito
  `from public, anon` antes del grant (trampa del bloque 5) — confirmado con
  `has_function_privilege` que no quedó anon-ejecutable por sorpresa esta
  vez.
- [x] **LINKCLI-T-05** — Policy nueva `evidence_public_tracking_read` sobre
  `storage.objects`, acotada a `bucket_id = 'evidence'` + orden `finalizada`
  + link activo, vía el helper `security definer`
  `storage_path_has_active_tracking_link` (una subquery cruda le fallaba a
  `anon` por falta de grant directo sobre `work_orders`/`companies`/
  `project_tracking_links`). Grant base de `anon` sobre `storage.objects`
  confirmado contra Demo (`has_table_privilege`, ya lo tenía por default de
  la plataforma).

## Fase 2 — Código

- [x] **LINKCLI-T-06** — `lib/actions/project-tracking-links.ts`:
  `createProjectTrackingLink`, `revokeProjectTrackingLink`.
- [x] **LINKCLI-T-07** — `app/seguimiento/[token]/page.tsx` (pública);
  `proxy.ts`: `isPublic` gana `/seguimiento/`.
- [x] **LINKCLI-T-08** — Página pública: reusa `OrderCompletionPie` (bloque
  6) para el avance, alimentada por `doneCount`/`totalCount` (nunca por
  `milestones.length`, que está recortado); lista de hitos; grilla de fotos
  con URLs firmadas (`createSignedUrls`, 30 min, mismo criterio que el resto
  de la app).
- [x] **LINKCLI-T-09** — UI en la ficha del proyecto:
  `ProjectTrackingLinkPanel` (generar / copiar / regenerar / revocar),
  gateado por `canOperateThisProject` (gerente, o el coordinador asignado a
  ESE proyecto puntual) — no por `canManageFinance`: esto no es dato
  comercial.
- [x] **LINKCLI-T-10** — Tipos de base (a mano): `project_tracking_links`,
  las 4 funciones nuevas. Cadenas es/pt: `ProjectTrackingLink` (lado
  empresa) y `ProjectTracking` (página pública) completos.

## Fase 3 — Verificación

- [x] **LINKCLI-T-11** — `pnpm type-check`, `pnpm lint`, `pnpm test` (653),
  `pnpm build` — los cuatro en verde.
- [x] **LINKCLI-T-12** — **Verificación en vivo contra Demo, con navegador
  real** — la primera de todo el paquete que no necesitó login, porque la
  página es pública a propósito: se levantó el dev server apuntando a Demo
  (env vars inyectadas en el proceso, sin tocar `.env.local`), se generó un
  link real para un proyecto sembrado ("Refacción Estaciones Norte", Shell
  Argentina), se abrió en el navegador sin sesión y se vio el avance (torta
  15%, 3 de 20), los hitos y el estado, sin ningún dato comercial ni de
  instaladores; un token inexistente mostró "link no disponible"; se revocó
  el link real y el MISMO link dejó de funcionar en el acto. No había fotos
  de evidencia en los datos de Demo para probar esa parte en pantalla — la
  política de storage que las firma ya se verificó a nivel SQL (T-05).
- [ ] **LINKCLI-T-13** — Verificación visual de Nicolás: sigue pendiente
  para el flujo del LADO EMPRESA (el botón "Link para el cliente" en la
  ficha del proyecto, que Claude no puede ejercitar porque necesita login).

## Fase 4 — Producción (requiere autorización explícita)

- [ ] **LINKCLI-T-14** — Backup confirmado, aplicar la migración, desplegar.

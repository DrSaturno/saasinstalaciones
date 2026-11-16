# Informe de integración de Finanzas — 03-11-2026

## Base y entorno

- Rama de trabajo: `feat/finanzas-integracion`, worktree `saasgf/seinstala-finanzas-int`. Parte de `feature/hoja-de-ruta-v2` (la que Demo ya tiene aplicada) y le suma `main` (recuperar contraseña, #54/#55). Sin commits.
- El código de Finanzas viene de `Codex/ModuloFinanzas/seinstala` (HEAD `65b584b` + cambios sin commitear), llevado como parche contra esa base (138 archivos: 109 nuevos, 29 modificados).
- Entorno: **Se Instala - Demo** (`krxewmfauohixmmzsvkp`). Producción no se tocó.

## Conflictos al integrar y cómo se resolvieron

Se conservó la versión de v2 en todos los archivos de subcuentas/invitaciones/auth (`company-staff.ts` y su test, `invite-signup.ts`, `team.ts`, `settings/page.tsx`, `app/invite/[token]/page.tsx`, `auth-authorized.test.ts`, `auth.test.ts`): v2 ya traía esa lógica, más nueva. Del lado de Finanzas se tomó `app/(company)/finance/page.tsx` (nueva pantalla) y se unificó el comentario de `canManageFinance` en `lib/auth.ts`. Si la copia de Codex tenía algo propio en esos archivos (p. ej. reutilizar invitación pendiente aplicando permisos), quedó fuera: revisar.

## Migraciones en Demo

Antes: Demo tenía la hoja de ruta v2 (`company_staff_accounts`, `order_pricing_privacy`, `work_order_team`, `project_expenses`…) y **ninguna** tabla de Finanzas ni el bucket `finance-private`.

| Archivo del repo | Versión en Demo | Resultado |
|---|---|---|
| `20260924000002_company_staff_accounts` | ya aplicada (`20260925022104`) | idéntica salvo saltos de línea; no se reaplicó |
| `20261027084636_finance_operations_foundation` | `20261103052621` | aplicada |
| `20261027084638_finance_cash_foundation` | `20261103052723` | aplicada |
| `20261027084640_finance_module_v2_release` | `20261103052850` | aplicada |
| `20261027084642_finance_operations_integration_release` | `20261103052958` | aplicada |

Las versiones de Demo son los timestamps que asigna el conector; los **nombres** coinciden con los del repo (comparar por nombre, no por versión). Al aplicar se omitieron los comentarios SQL; el código es el mismo.

Verificado en Demo: 14 tablas con RLS, sin permisos para `anon`, 3 vistas `security_invoker`, bucket `finance-private` privado de 10 MiB, y los hooks opcionales instalados (`work_order_pricing`, `project_pricing`, `work_order_team_members`: 6 triggers `finance_*`). El advisor de seguridad marca 7 RPC `SECURITY DEFINER` ejecutables por `authenticated`; es intencional (cada una valida `finance_can_access`). Único aviso propio: `finance_next_payment_date` sin `search_path` fijo (función pura, bajo riesgo).

## Cambio de comportamiento a conocer

La migración `…84640` redefine `auth_can_see_commercials` como «cualquier gerente de la empresa». Antes (v2, bloque 8) eran sólo el dueño y subcuentas con `can_manage_finance`. Ahora un **administrativo ve y edita precios de OTs sin acceder a Finanzas**, y `can_manage_finance` pasa a controlar sólo el libro, la caja y los comprobantes (`finance_can_access`). Es lo que pide el módulo, pero revierte parte del bloque 8 de v2: confirmar con Nico, y revisar los textos de la pantalla de subcuentas que describen ese permiso.

## Tipos

`types/database.ts` regenerado desde Demo + `scripts/narrow-database-types.mjs`. El script ganó dos cosas para que `pnpm db:types` sea reproducible: `work_order_team_members.payment_status → PaymentStatus` (antes era un retoque a mano) y `VIEW_NON_NULL` (las vistas financieras salen con todo `| null`). En `finance-operations.ts` hay un cast en `p_due_on` porque el generador no marca como opcionales los parámetros de RPC.

## Pruebas

- `pnpm type-check` y `pnpm lint`: limpios.
- `pnpm test`: **740 pruebas en 101 archivos**, todas pasan.
- `node scripts/check-finance-schema.mjs`: las 4 migraciones compilan en PGlite.
- `next build --webpack`: compila; rutas `/finance/*`, `/finance-preview` y `/api/finance/*` presentes.
- SQL real en Demo, dentro de una transacción descartada (sin dejar datos), con usuarios de prueba y `set role authenticated`:
  - Pago repartido en 2 obligaciones: 2 movimientos, la obligación chica queda saldada, la otra con saldo 300. Reintento con el mismo UUID: no duplica. Mismo UUID con otro contenido: `idempotency_conflict`.
  - Sobrepago y pago sobre lo reservado por un cheque: `insufficient_available_balance`. Segundo cheque que excede lo disponible: rechazado.
  - Cheque a instalador: `field_team_transfer_or_cash_only`. Acreditar un cheque crea un solo movimiento (repetirlo no suma otro); luego no admite rechazo. Caja de la obligación = su importe, sin duplicar.
  - `finance_import_existing_orders` ejecutado dos veces: mismo conteo.
  - Hook de precios privados: cargar y luego modificar `work_order_pricing` deja **una** cuenta por cobrar con el importe actualizado.
  - Administrativo (subcuenta sin permiso): ve 0 filas de Finanzas, puede ver precios, las RPC dan `finance_denied`, no puede insertar proveedores. Subcuenta con permiso: ve el libro.
  - Otra empresa: 0 filas de obligaciones, movimientos y proveedores; un cheque sobre obligaciones ajenas da `entry_mismatch`.
  - Storage: el dueño sube a la carpeta de su empresa y lee; no puede subir a la de otra; el administrativo y la otra empresa no suben ni leen.

## Pendiente / no verificado

- **Recorrido por la interfaz con login**: no se hizo (las pantallas están tras el login). Falta pasar por `/finance` con un dueño real de Demo: Operaciones → obligación → aprobación → pago/cheque → caja/consulta/PDF. La demo sin login sigue en `/finance-preview/payments`.
- Subida/descarga **real** de archivos a `finance-private` por la URL firmada de la app (se probó la RLS de Storage, no el transporte), y los PDF.
- pgTAP (`supabase/tests/finance_operations.test.sql`): no se ejecutó (la extensión no está en `public` en Demo).
- Concurrencia desde conexiones independientes y rendimiento a escala (la lectura carga el libro completo de la empresa).
- Hooks de sueldos/equipo con OTs reales de Demo con importes cargados (las OTs de Demo no tienen precios).
- Producción: sin aplicar. Cuando se decida, aplicar las 4 migraciones en orden con las v2 ya aplicadas, y verificar antes que `work_order_pricing`, `project_pricing` y `work_order_team_members` existan (los hooks se instalan sólo si existen al correr `…84642`).
- `feature/hoja-de-ruta-v2` sigue sin mergear a `main`; este trabajo depende de ella.
- La nota de memoria sobre el worktree viejo `seinstala-finanzas` (migraciones `20260925000000/01`, choque con v2) queda reemplazada por esta integración.

## Cómo probarlo

```
cd saasgf/seinstala-finanzas-int
pnpm install
pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3001
```

Con las variables de Demo, iniciar sesión como gerente dueño de «Gráfica Demo SA» y abrir `/finance`. Para ver una subcuenta sin Finanzas, crearla desde Equipo sin el permiso: debe poder abrir OTs y precios pero no `/finance`.

## Auditoría para producción — 03-11-2026: NO-GO por ahora

Lo que pasó:
- pgTAP de Finanzas en Demo: 47/47.
- Las rutas de demo (`/finance-preview`, `/api/finance-development`) dan 404 fuera de `next dev` en localhost (proxy + guarda en la página y la API). PGlite está en `devDependencies`.
- El service worker no cachea `/finance` ni sus PDF (`public/sw.test.ts`).
- Todo lo del apartado «Pruebas».

Por qué no se pasó:
1. **Pasar Finanzas a producción es pasar toda la hoja de ruta v2.** Producción no tiene ninguna migración de v2 (última: `20260921224613`) y tiene uso real: 2 empresas, 22 perfiles, 17 proyectos, 115 OTs. Serían 12 migraciones (8 de v2, con traslado de datos de precios y locaciones, más las 4 de Finanzas) y 190+ archivos de código. v2 (PR #52) quedó frenada a la espera de la revisión de pantallas de Nicolás, que no se hizo.
2. **Nadie usó todavía las pantallas de Finanzas con login.** Están probadas las reglas en la base, no el recorrido real (crear proyecto → OTs con precios → cobro/pago → comprobante → PDF).
3. **El preview de Vercel apunta a la base de Producción.** Subir esta rama para revisarla en un preview correría código nuevo contra la base vieja de producción. Antes hay que apuntar el preview a Demo.
4. Falta confirmar que hay un backup reciente de producción y cómo se restaura, antes de aplicar migraciones de datos.

Camino a producción:
1. Apuntar `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` de **Preview** a Demo en Vercel (Nicolás).
2. Subir la rama, abrir el preview y que Nicolás recorra la lista de abajo con un dueño de Demo.
3. Con su OK: backup manual de producción → migraciones de v2 en orden → las 4 de Finanzas → verificar con SQL → merge a `main` → verificar `www.seinstala.com.ar`.

Lista para recorrer en el preview:
- Crear un proyecto con cliente y facturación por instalación, dos OTs con precio y un instalador con importe.
- `/finance/collections`: aparecen los dos cobros. Cambiar el precio de una OT: cambia el importe, sin un cobro nuevo.
- Finalizar una OT y ver el pago del instalador en `/finance/payments`, con su fecha. Registrar una transferencia repartida entre dos pagos y adjuntar un comprobante.
- Registrar un cheque de cobro, acreditarlo, y ver la caja en `/finance/cash`.
- Bajar el PDF de una OT y el resumen.
- Entrar como subcuenta sin permiso de Finanzas: ve precios de OTs y no ve `/finance`.
- Mirar todo en el celular.

## Bug abierto — zona AMBA mal mapeada (detectado 04-11-2026)

`finance_sync_order` (y `finance_sync_helper`) calculan la zona de un pago a instalador con `sites.zone = 'AMBA'`, pero la plataforma guarda `AR-BA-AMBA` / `AR-CBA`. Resultado: **todo pago a instalador queda como «interior»**; en Demo, 20 de 20 pagos, aunque 61 de 72 sitios son AMBA. Efecto: el día de pago (`finance_payment_rules`, `finance_schedule_on_completion`) usa siempre la regla de interior.

**A hacer apenas se pueda:**
1. Nueva migración que redefina `finance_sync_order` y `finance_sync_helper` para mapear `AR-BA-AMBA → 'amba'` y el resto → `'interior'`.
2. Recalcular `zone` y `due_on` de los pagos existentes que no tengan movimientos ni cheques pendientes.
3. Aplicarla en Demo, correr pgTAP de Finanzas y agregar una prueba que cubra un sitio AMBA.
4. Producción: va junto con las otras 4 migraciones de Finanzas; no hace falta migración aparte.

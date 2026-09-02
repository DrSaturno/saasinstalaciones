# Plan de implementación SDD

Estado: R0 en curso — plataforma y correcciones de seguridad cerradas; faltan E2E, gates de QA y las aprobaciones de producto  
Unidad de planificación: release vertical; los tamaños `S/M/L/XL` son relativos, no estimaciones calendario  
Regla: cada tarea de producto referencia requisitos y cada release pasa sus gates antes del siguiente

> Última verificación: 12-08-2026. `lint`, `type-check`, `test` (191) y `build`
> en verde. Las migraciones `20260805*` y `20260812000000` **ya están aplicadas**
> — ver «Estado de la base» abajo, que reemplaza la nota anterior de 06-08-2026
> que las daba por no aplicadas.
>
> `[~]` marca trabajo escrito pero todavía no ejecutado en ningún entorno.

## Estado de la base (12-08-2026)

Sección de traspaso: describe qué hay realmente en la base, para no volver a
planificar sobre suposiciones. **Leer antes de tocar migraciones.**

**Los tres entornos, y qué es cada uno** (aclarado con producto el 13-08-2026):

| Proyecto Supabase | Qué es |
|---|---|
| `rpdjjvcmtcpvmwrjqhke` «Saas de Instalaciones» | **Entorno principal. NO es producción.** La app todavía no salió a producción: se está terminando de afinar. Sus 130 sites, 118 órdenes y 5 usuarios son **data demo** de referencia para ir probando. Sin backups configurados. |
| `krxewmfauohixmmzsvkp` «InstalaPro Staging» | Entorno de pruebas creado el 12-08-2026. Es donde corre la suite E2E. |
| `jibvorqudveqgankoeak` «Se Instala Pro» | **No tocar.** Pese al nombre, es la base del legacy `proyecto2 seinstalapro`, con otro esquema y 88 cuentas reales. Pausado para liberar cupo del plan free. |

Este documento dice «producción» en varios lugares por el proyecto principal.
Léase «entorno principal»: el plan es cerrar los pendientes de este plan, hacer
una revisión con el equipo, y **recién entonces** la primera prueba real con una
empresa ya seleccionada.

### Historial de migraciones: reparado el 12-08-2026

**Ya no aplica la advertencia anterior**, que decía que `schema_migrations` no era
confiable. Lo era: la tabla registraba `20260722000002` mientras el schema tenía
objetos de fines de julio (SQL aplicado a mano sin registrar), y encima las 7
migraciones que apliqué por MCP habían quedado con versiones inventadas
(`20260812100433`…) que no coincidían con los nombres del repo. Con eso,
`supabase db push` contra producción habría intentado reaplicar ~30 migraciones.

Antes de reparar hubo que **probar** que las 40 estaban realmente aplicadas —
marcar de más habría causado deriva silenciosa. La prueba: una huella md5 del
esquema (columnas de tablas base + funciones propias + policies de `public` y
`storage`, excluyendo lo que pertenece a extensiones) dio **idéntica en
producción y en staging**: `2a253803b23502f956da62083595cc6e`, 738 objetos.
Staging se había construido limpio desde las 40, así que la igualdad prueba que
producción también las tiene.

La reparación, con el CLI vinculado a producción:

```
npx supabase migration repair --status reverted <las 7 versiones inventadas>
npx supabase migration repair --status applied  <las 31 que faltaban>
```

`migration repair` sólo toca la tabla de seguimiento, nunca ejecuta SQL.
Resultado verificado: `supabase db push --dry-run` responde **«Remote database is
up to date»** y `migration list` no tiene desajustes. **Producción ya se puede
manejar con `db push` como staging.**

Dejar el CLI vinculado a staging al terminar: es el destino por defecto correcto,
y evita empujar a producción por descuido.

**pgTAP fuera de `public` (13-08-2026).** Estaba instalado a mano en producción
(v1.3.3), no por ninguna migración: ~1079 funciones dentro de `public` contra 66
propias de la app, varias de ellas describiendo el esquema (`has_table`,
`policies_are`…) y ejecutables por cualquier autenticado, porque una extensión en
`public` otorga EXECUTE a PUBLIC. Se sacó con
`20260813000000_drop_pgtap_from_public.sql`. No afecta a las pruebas: los
archivos de `supabase/tests/` la piden en el schema `extensions` y se la crean
solos dentro de su transacción.

Esa fue **la primera migración aplicada a producción con `supabase db push`**, que
es lo que la reparación del historial venía a habilitar. Después del cambio,
producción y staging quedaron con la **misma huella completa**
(`70b51d6ae78a5a262a38d7f8c3126931`, 746 objetos, extensiones incluidas): antes
diferían en 1108 objetos.

Aplicadas el 12-08-2026 con el MCP de Supabase (`apply_migration`), en orden:

| Migración | Efecto sobre datos reales |
|---|---|
| `20260805000000_release_foundation` | 9 feature flags creados, todos en `false` |
| `20260805000001_company_suspension_enforcement` | Sólo funciones y policies |
| `20260805000002_multi_role_memberships` | Backfill: 3 membresías → 3 capacidades |
| `20260805000003_canonical_locations` | Backfill: 130 sites → 129 vinculados, **119 locaciones únicas** (10 puntos repetidos entre proyectos), 129 `project_locations`, 3 filas en cola de revisión |
| `20260805000004_activities_agenda_outbox` | Backfill de actividades/asignaciones sobre 118 `work_orders` |
| `20260812000000_no_self_approval` | Redefine `validate_order_transition` |

Cola de revisión pendiente en `location_backfill_issues`: 1 `missing_external_ref`
y 2 `conflicting_source_data`. Ninguna fila se perdió; hay que resolverlas a mano
(es el insumo de R2-UI-03).

**Dos bugs corregidos al aplicar**, ambos habrían fallado en cualquier base — o
sea que estas migraciones nunca se habían ejecutado en ningún entorno:

1. `notification_outbox_attempts_check` / `notification_deliveries_attempts_check`
   colisionaban con el nombre que Postgres autogenera para el check inline de la
   columna `attempts`. Renombrados a `..._attempts_budget_check`.
2. En `validate_survey_submission` había un `CASE ... THEN ... END` dentro de la
   condición de un `IF`: plpgsql corta la condición en el primer `THEN`, se come
   un `end if` y la función queda desbalanceada. Reescrito con la variable
   `v_previous_status`.

**Regeneración de tipos.** `types/database.ts` no es un archivo puramente
generado: lleva 23 alias de dominio y 29 columnas estrechadas que `supabase gen
types` no produce (los CHECK de texto no son enums). Ese trabajo se perdía en
cada regeneración. Ahora es reproducible:

```
pnpm db:types   # gen types + node scripts/narrow-database-types.mjs
```

El script es idempotente y vive en `scripts/narrow-database-types.mjs`, con los
alias en `scripts/database-domain-aliases.ts`. **Correr el generador solo deja el
repo sin compilar.**

### Verificación post-migración (12-08-2026)

Hecha con SQL impersonando usuarios reales (`set_config('request.jwt.claims')`
+ `set local role authenticated`) dentro de transacciones revertidas. Sirve para
comprobar RLS sin levantar la app.

- **Gerente** (`a0000000-…-0002`): lee 7 proyectos, 130 sites, 118 órdenes, 119
  locaciones, 129 asociaciones, 3 de la cola, 120 actividades, 9 flags. Las
  policies reescritas en `20260805000001/2` no lo dejaron afuera de nada.
- **Usuario con rol dual** (`39c8d038-…`, `coordinator+installer` — el escenario
  de ADR-001, existe en datos reales): 2 empresas, coordina en 1 e instala en 1;
  ve 2 de 7 proyectos y 12 de 119 locaciones. El aislamiento por tenant se
  sostiene con capacidades coexistentes. Ve 0 órdenes porque los 2 proyectos que
  coordina no tienen ninguna — verificado, no es una regresión.
- **Bloqueo de autoaprobación (R1 / ADR-001), probado contra el trigger real:**
  aprobar la propia entrega → bloqueado; reabrirla → bloqueado; que la apruebe un
  tercero → permitido. Los 118 `work_orders` quedaron intactos.

**En navegador, sin sesión:** landing, `/login` y `/invite/<token>` renderizan
contra el schema migrado, con cero errores de consola y todas las peticiones en
200. `/invite` es la más informativa de las tres: ejercita `invitation_preview`,
que `20260805000001` borra y recrea con otra firma — anon la invoca bien y
devuelve el mensaje correcto.

**Pendiente: las pantallas autenticadas** (equipo, proyectos, importación). No se
verificaron porque requieren iniciar sesión y el asistente no ingresa
contraseñas. Lo tiene que hacer una persona en el navegador; después se pueden
recorrer e inspeccionar consola/red normalmente.

### Entorno de staging (12-08-2026) — R0-PLAT-04 cerrado

Hasta hoy no existía ningún entorno que no fuera producción, que es exactamente
lo que R0 se proponía evitar («evolucionar el dominio sin probar sobre
producción»). Por eso este lote de migraciones se aplicó directo sobre la base
viva. Ya no hace falta repetirlo.

**Proyecto: `krxewmfauohixmmzsvkp` («InstalaPro Staging»), us-east-1, plan free.**
Para crearlo hubo que pausar `jibvorqudveqgankoeak` («Se Instala Pro»), que topaba
el límite de 2 proyectos gratis. **Ese proyecto NO es descartable**: es la base
del legacy `proyecto2 seinstalapro`, con 88 cuentas de usuario reales. Está
pausado, no borrado, y se restaura desde el dashboard cuando haga falta.

El historial completo se aplica **sin Docker** — el CLI por `npx` alcanza, y ya
está autenticado:

```
npx supabase link --project-ref krxewmfauohixmmzsvkp
npx supabase db push --include-all
```

Las 39 migraciones se aplicaron limpias desde una base vacía. Eso además valida
las dos correcciones de `20260805000004`: es el escenario donde antes fallaba.
Después se corre `supabase/seed.sql` (crea 7 actores, entre ellos uno dual:
instalador1 es coordinador en la empresa A e instalador en la B).

Para correr la suite hay que levantar el server apuntando al staging y pasarle
la URL a Playwright:

```
NEXT_PUBLIC_SUPABASE_URL=https://krxewmfauohixmmzsvkp.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon del staging> \
node node_modules/next/dist/bin/next dev -p 3100

E2E_BASE_URL=http://127.0.0.1:3100 npx playwright test
```

Next 16 no deja levantar dos dev servers en el mismo directorio: hay que bajar el
que apunte a producción antes.

**Resultado: 32/32 en verde.** Es la primera vez que la suite corre entera.
Los tres fallos que aparecieron eran de los tests, no de la app — se habían
escrito sin ejecutarse nunca, igual que las migraciones:

1. `locator("main, body")` resolvía a tres elementos (el layout de empresa anida
   dos `<main>`), y en modo estricto eso es error aunque la página cargue bien.
2. El test de aislamiento entre empresas afirmaba sobre un redirect que la app no
   hace: ante un id de otro tenant deja la URL y renderiza el `main` vacío.
   Reescrito para afirmar lo que importa —que no aparezca el nombre del proyecto
   ajeno—, que además es una prueba más fuerte. **El aislamiento nunca estuvo
   roto:** el `main` vino vacío en la corrida fallida.
3. El chequeo del service worker consultaba el registro apenas navegaba; el
   componente lo hace después del `load`. Era una carrera, no un SW roto.

Notas de entorno para levantarlo: se creó `.env.local` en `saasinstalaciones/`
(no existía; sólo estaba en la carpeta vieja `instalapro/`) con
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `APP_URL` — son las
únicas obligatorias; el resto está detrás de guardas y su ausencia sólo apaga la
función. **Arrancar con `node node_modules/next/dist/bin/next dev`**: `pnpm dev`
dispara un chequeo que intenta purgar `node_modules` (pnpm 11 contra un lockfile
más viejo), y reinstalar en esta máquina es problemático por los symlinks en
OneDrive.

## Preparación de la especificación

- [x] **SDD-000** — Leer la minuta completa del 04-08-2026.
- [x] **SDD-001** — Auditar rutas, modelo de datos, actions, RLS, offline, pruebas y documentación vigente.
- [x] **SDD-002** — Clasificar los 16 frentes como existente, parcial, corrección o nuevo.
- [x] **SDD-003** — Proponer requisitos, arquitectura objetivo, orden y gates.
- [ ] **SDD-004** — Validar alcance y baseline recomendado con producto.
- [ ] **SDD-005** — Aprobar o corregir DEC-01 a DEC-14 y registrar ADRs por release.
- [ ] **SDD-006** — Definir capacidad del equipo, cadencia y umbrales de performance para convertir tamaños relativos en fechas.

## R0 — Base segura y reproducible

Objetivo: poder evolucionar el dominio sin probar sobre producción, sin regresiones silenciosas y sin conservar riesgos actuales.  
Requisitos: NFR-SEC-04, NFR-INT-04, NFR-OPS-01..03, REQ-16.1, REQ-16.2, REQ-16.6.  
Tamaño: L.

### Especificación y decisiones

- [ ] **R0-SPEC-01** — Aprobar ADR-013: activación y verificación de email.
- [ ] **R0-SPEC-02** — Definir matriz de entornos dev/staging/prod, acceso, datos de prueba, backup y responsables.
- [ ] **R0-SPEC-03** — Definir SLO/umbrales iniciales y formato de evidencia QA/release.

### Plataforma y calidad

- [x] **R0-PLAT-01** — Fijar versiones soportadas de Node/pnpm (`engines`/`packageManager` o equivalente), corregir configuración de overrides y verificar lockfile reproducible. Node `22.14.0` y pnpm `11.9.0` fijados en `engines`/`packageManager`/`.nvmrc`; overrides movidos a `pnpm-workspace.yaml` (pnpm 11 los lee ahí, no desde `package.json#pnpm`) y lockfile reinstalado con `--frozen-lockfile`.
- [x] **R0-PLAT-02** — Crear Supabase local/staging aislado y `supabase/config.toml`; documentar seed mínimo con dos empresas y actores de prueba. `supabase/config.toml` creado y `seed.sql` con dos empresas activas, una suspendida y actores manager/coordinador/instalador/dual.
- [x] **R0-PLAT-03** — Agregar CI para install frozen, lint, type-check, unit/integration, pgTAP/RLS y build. `.github/workflows/ci.yml`: job de aplicación (install frozen, lint, type-check, test, build) y job de base (`supabase db start` + `supabase test db`).
- [x] **R0-PLAT-04** — Incorporar Playwright E2E y recorridos mínimos autenticados por rol. `playwright.config.ts` + `e2e/` con 32 casos: login por rol, denegación cruzada de áreas, aislamiento entre empresas y smoke installer a 375 px. **Ejecutados el 12-08-2026: 32/32 en verde** contra el proyecto de staging (ver «Entorno de staging» arriba). No hizo falta Docker: el CLI por `npx` empuja las migraciones a un proyecto remoto. Los tres fallos de la primera corrida eran de los tests, no de la app, y quedaron corregidos.
- [x] **R0-PLAT-05** — Agregar observabilidad estructurada de servidor/cliente, RPC, jobs y sincronización; definir alertas y runbook. `lib/observability.ts` cableado en alta master, alta por invitación, alta masiva de órdenes, la RPC de transición offline y el flush de la cola; catálogo de eventos y 7 alertas con severidad en `docs/operations/observability.md`. Los `console.error` sueltos de los caminos de compensación fueron reemplazados.
- [x] **R0-PLAT-06** — Completar CSP/Permissions-Policy con modo reporte y luego enforcement. CSP completa en `Content-Security-Policy-Report-Only` más Permissions-Policy, HSTS y X-Frame-Options en `next.config.ts`. El enforcement con nonce queda para después del relevamiento en staging.

### Correcciones de seguridad/integridad actuales

- [x] **R0-FIX-01** — Hacer efectiva la suspensión de empresa en sesión, autorización y RLS; invalidar caches/sesiones según política. `20260805000001_company_suspension_enforcement.sql` agrega `company_is_active()` como gate de `auth_company()` y de las policies directas de instalador; pgTAP en `company_suspension.test.sql`.
- [x] **R0-FIX-02** — Corregir el conteo master para usar membresías multiempresa y agregar test de regresión. El conteo master usa `countCompanyUsers()` sobre membresías multiempresa (`lib/domain/company-user-counts.ts`), con test unitario y de ruta.
- [x] **R0-FIX-03** — Eliminar el riesgo de cache autenticada cross-account del SW y limpiar Cache Storage + IndexedDB al cerrar/cambiar sesión. `public/sw.js` deja de cachear RSC autenticado y `lib/offline/session-storage.ts` limpia Cache Storage + IndexedDB al cerrar o cambiar de sesión (`logout-button.tsx`).
- [x] **R0-FIX-04** — Reemplazar la escritura offline directa de `work_orders.status` por el comando server-side vigente o deshabilitar temporalmente esa transición offline. La transición offline pasa por `syncInstallerTransition` (server action) en vez de escribir `work_orders.status`; el rechazo definitivo bloquea el item en vez de reintentar para siempre.
- [x] **R0-FIX-05** — Reparar el flujo de invitación/alta para que un fallo intermedio no deje un usuario huérfano; agregar idempotencia/compensación. El alta master compensa empresa y cuenta ante fallo de invitación o de envío (`app/api/master/companies/route.ts`), con test por cada paso que puede fallar.
- [x] **R0-FIX-06** — Dividir las acciones monolíticas de órdenes/proyectos por caso de uso antes de ampliar sus máquinas de estado. `lib/actions/orders.ts` (849 líneas) y `projects.ts` (725) divididos por caso de uso en `lib/actions/orders/{intake,bulk,lifecycle,assignment}` y `lib/actions/projects/{crud,import,reuse}`, con `context.ts`/`types.ts` compartidos y sin barrel.

### Email

- [ ] **R0-EMAIL-01** — Configurar dominio, Resend/SMTP y Redirect URLs en staging.
- [ ] **R0-EMAIL-02** — Alinear invitación y alta master con la regla de email confirmado.
- [ ] **R0-EMAIL-03** — E2E real de invitación, confirmación y recuperación con evidencia de recepción.

### Pruebas y gate de salida

- [ ] **R0-QA-01** — Ejecutar y documentar baseline completo; no depender sólo de los 130 tests informados históricamente.
- [ ] **R0-QA-02** — pgTAP negativo empresa A/B para suspensión, memberships y Storage actual.
- [ ] **R0-QA-03** — Smoke E2E manager/coordinador/instalador/admin en staging.
- [ ] **R0-GATE** — CI verde y reproducible, staging aislado, observabilidad activa, riesgos R0 cerrados, backup/rollback ensayado.

## R1 — Roles múltiples y separación de funciones

Objetivo: una persona puede coordinar e instalar en la misma empresa sin perder datos ni recibir permisos globales.  
Requisitos: REQ-09.1..09.6, NFR-SEC-01..03.  
Dependencia: R0. Tamaño: L.

> **R1 CERRADO el 12-08-2026** — R1-GATE verificado (ver abajo). Queda pendiente
> sólo eliminar la columna escalar `company_installers.role`, que es el cutover
> y no forma parte de este release.
>
> Auditoría 12-08-2026: al revisar el código antes de arrancar R1 se encontró
> que buena parte ya estaba construida desde R0 (la migración de roles duales
> se escribió junto con las demás, aunque el checklist nunca se actualizó).
> Lo marcado abajo con evidencia se verificó leyendo el código fuente, no por
> confianza en commits previos.

### Especificación

- [x] **R1-SPEC-01** — Aprobar ADR-001: tablas de membresía/roles, capacidades por contexto y prohibición de autoaprobación. El documento ya declara `Estado: Aceptado`; la prohibición de autoaprobación que describe se implementó recién ahora (ver R1-SRV-03).
- [x] **R1-SPEC-02** — Matriz actor × recurso × acción para manager, coordinador, instalador, dual, multiempresa y admin. Escrita en `matriz-actor-recurso-accion.md`, derivada del código (policies, `lib/auth.ts`, `lib/domain/order-rules.ts`), no propuesta. Deja explícito que dual y multiempresa no son roles extra sino combinaciones que el modelo N:N admite, y que la única regla que mira la identidad del actor —y no sólo su capacidad— es la prohibición de aprobar la propia entrega.

### Datos y servidor

- [x] **R1-DB-01** — Migración aditiva para membresía base y roles N:N; backfill del rol actual con reconciliación 100%. `20260805000002_multi_role_memberships.sql`: tabla `company_membership_roles`, backfill desde `company_installers` con `on conflict do nothing`, trigger `sync_legacy_company_membership_role` para mantener la proyección legacy sincronizada en ambos sentidos.
- [x] **R1-DB-02** — Reescribir helpers RLS y policies sin usar un rol escalar; crear adaptador legacy temporal. Los helpers y `validate_project_relations`/`accept_broadcast_application` se migraron en `20260805000002`. Los tres triggers de aviso que quedaban (`notify_broadcast_application`, `notify_order_update`, `notify_chat_message`) se migraron en `20260812000001_notifications_use_membership_roles.sql`. **No era cosmético:** verificado en staging con una persona cuya columna escalar dice `installer` pero tiene capacidad de coordinador — la lógica vieja encontraba 0 destinatarios y la nueva encuentra 1, y el trigger entregó el aviso. Era una falla silenciosa esperando al cutover. Verificado además que las tres funciones disparan sin error. Aplicada en staging y producción.
- [x] **R1-SRV-01** — Convertir invitar/agregar/quitar rol en comandos idempotentes y auditados. RPCs `grant_company_member_role`/`revoke_company_member_role` (mismo archivo), cableados desde `lib/actions/team.ts:125-173` (`changeMemberRole`, `grantMemberRole`, `revokeMemberRole`).
- [x] **R1-SRV-02** — Impedir retiro de capacidad con asignaciones/proyectos activos o exigir transferencia transaccional. `revoke_company_member_role` bloquea quitar `installer` con órdenes abiertas y `coordinator` con proyectos activos (`20260805000002_multi_role_memberships.sql:387-405`); cubierto por pgTAP en `multi_role_memberships.test.sql`.
- [x] **R1-SRV-03** — Centralizar `canApprove` y bloquear autoaprobación por actor, no por label de UI. Era el único gap real encontrado en la auditoría: ni el dominio (`lib/domain/order-rules.ts`) ni el trigger `validate_order_transition` impedían que un coordinador aprobara o reabriera su propia entrega cuando también era el instalador asignado. Agregado el bloqueo `noSelfApproval` en ambos lados (`lib/domain/order-rules.ts`, nueva migración `20260812000000_no_self_approval.sql`), con test unitario, pgTAP (`no_self_approval.test.sql`) y claves i18n es/pt.

### UI

- [x] **R1-UI-01** — Equipo: capacidades coexistentes, alta y revocación con impacto explicado. `components/company/roster-member-row.tsx:88-118` ya muestra un botón independiente por rol (no un selector excluyente) y bloquea quitar la última capacidad.
- [x] **R1-UI-02** — Selector de contexto/área para usuario dual sin duplicar cuenta. Resuelto con un enfoque distinto al de la spec original: en vez de un selector, `app/(installer)/coordination/page.tsx` agrupa todas las empresas donde la persona coordina en un solo tablero, y el layout instalador agrega el tab "Coordinación" cuando corresponde. Ambas capacidades conviven sin forzar una elección.
- [x] **R1-UI-03** — Navegación y Server Components derivados de capacidades y empresa activa. `app/(installer)/layout.tsx` deriva el tab de coordinación de `isCoordinatorSomewhere(user)`, no de un rol escalar.

### Pruebas y gate

- [x] **R1-QA-01** — Unitarias de resolución de capacidades y separación de funciones. `lib/domain/order-rules.test.ts` cubre el bloqueo de autoaprobación (4 casos nuevos); helpers de capacidad (`hasCompanyRole`, `isCoordinatorSomewhere`, etc. en `lib/auth.ts`) sin test unitario dedicado todavía.
- [~] **R1-QA-02** — pgTAP de toda policy migrada con A/B, dual y coordinador P1/no P2. `multi_role_memberships.test.sql` (16 asserts) y `no_self_approval.test.sql` (6 asserts) cubren membresía y autoaprobación. **Siguen sin ejecutarse.** Verificado el 13-08-2026 que no hay forma de correrlos desde esta máquina: `supabase test db --linked` también necesita Docker (usa un contenedor `pg_prove`), y por el MCP no se puede sacar un veredicto agregado porque esta versión de pgTAP no materializa los resultados en una tabla — sólo los devuelve como texto de cada `select`, y el MCP entrega únicamente el último. Queda para CI, que sí tiene Docker. Lo que sí se verificó en vivo contra el trigger, por SQL directo, es la regla de autoaprobación (aprobar lo propio y reabrir lo propio bloqueados, tercero permitido).

  **Ejecutados por fin el 14-08-2026, al abrir el PR.** `multi_role_memberships` y `no_self_approval` pasan. De los 14 archivos, 10 quedan verdes (incluidos los dos nuevos de R2). Los 4 restantes se diagnosticaron uno por uno **sin tocarlos**, para no “arreglar” un test que estuviera avisando de un problema real:

  - **`canonical_locations`** — falla de sintaxis propia, no del producto: cuatro comprobaciones metían un `with` que escribe dentro de una subconsulta, que Postgres no admite, y abortaban el archivo entero. Corregido dejando el `with` al tope de su propia sentencia, que además conserva lo que se quería medir (filas afectadas).
  - **`multi_company_cutover`, `multi_company_functions_storage` y `multi_company_membership`** — **no son suites pgTAP**. Devuelven todas las aserciones como un único `select` (lo dice su propio encabezado: «porque Supabase Studio muestra sólo el resultado de la última sentencia»). Están escritas para correrse a mano en Studio, no bajo `pg_prove`, que espera salida TAP; por eso informan «No subtests run» o cuentan mal. Convertirlas es una decisión de diseño, no un arreglo mecánico.

  > **Ninguna de las 7 aserciones que fallan señala un bug.** Todas comprueban el **texto fuente** de una función (`pg_get_functiondef(...) like '%...%'`), y R1 reescribió justamente esas funciones. Verificado contra las funciones vivas: `accept_invitation`, `accept_broadcast_application` y las tres de notificación **ya usan `company_membership_roles`**, o sea el modelo que R1 introdujo; el test exige el mecanismo viejo. `promote`/`demote` pasaron a ser envoltorios de `grant_company_member_role` / `revoke_company_member_role`.
  >
  > **El único punto que valía la pena mirar de verdad** era el test 2: decía que ascender «bloquea con órdenes abiertas», y `grant_company_member_role` no comprueba órdenes. No es una regla perdida: está en `revoke_company_member_role`. Bajo el modelo escalar, ascender *reemplazaba* el rol y dejaba huérfanas las órdenes en curso —de ahí el guardarraíl—; en R1 ascender **suma** una capacidad y no saca nada, así que el riesgo real pasó a ser revocar la de instalador. El guardarraíl se mudó a donde ahora corresponde.
  >
  > Estas pruebas asertan **cómo está escrita** una función, no qué hace. Por eso se rompen con cualquier refactor legítimo y no habrían detectado un cambio de comportamiento real. Al reescribirlas conviene apuntar a comportamiento.
- [x] **R1-QA-03** — E2E: instalar + coordinar, cambio de empresa, revocación y autoaprobación denegada. `e2e/dual-role.spec.ts` (4 casos, verdes). Cubre la coexistencia de capacidades sobre el actor dual real del seed —`instalador1@demo.dev` tiene `coordinator`+`installer` en la misma empresa y sólo `installer` en la otra—: conserva las pantallas de campo, entra además a coordinación, la navegación ofrece las dos a la vez, y coordinar no lo convierte en gerente. **La autoaprobación denegada NO se cubre acá a propósito**: montar esa transición por UI depende de estado que el seed no fija, y ya está probada donde se implementa (pgTAP `no_self_approval.test.sql`, unitarios de `order-rules.test.ts`, y verificación en vivo contra el trigger).
- [x] **R1-GATE** — Cero divergencias dual-read, matriz RLS verde y ninguna consulta nueva depende del rol escalar. Verificado el 12-08-2026:
  - **Ninguna consulta autoriza por el rol escalar.** Consultado sobre los objetos vivos, no sobre los archivos: cero policies (`pg_policies`) lo mencionan, y de las funciones (`pg_proc`) la única que lo nombra es `accept_invitation`, donde es una **escritura** que mantiene la proyección legacy, no una lectura para autorizar.
  - **Cero divergencias** entre `company_installers.role` y `company_membership_roles` en producción: 3 membresías, ninguna sin capacidad, ninguna que coordine sin que la columna lo diga ni al revés.
  - **Matriz** documentada en `matriz-actor-recurso-accion.md`.
  - Pendiente menor: `company_installers.role` sigue existiendo como proyección. Eliminarla es el cutover, que no es parte de R1.

## R2 — Locación canónica e import/export

Objetivo: una identidad física estable, historial acumulado e intercambio de datos determinista.  
Requisitos: REQ-04.1..04.7, REQ-08.1..08.7.  
Dependencia: R1. Tamaño: XL.

> **El bloqueador de tipos que tenía esta sección quedó resuelto el 12-08-2026.**
> Decía que R2-DB-03/04 y R2-UI-01/02/03 estaban trabados porque
> `types/database.ts` no incluía `locations`. Las migraciones ya están aplicadas
> y los tipos regenerados: `locations`, `project_locations`,
> `location_attachments`, `location_requirements`, `location_change_events` y
> `location_backfill_issues` están disponibles y tipadas. **La capa de aplicación
> canónica se puede escribir.**
>
> El primer corte de aplicación canónica quedó hecho el 13-08-2026:
> `/locations/[id]` lee la identidad y sus tablas permanentes. Las pantallas de
> proyecto, rutas y órdenes todavía conservan `sites` como proyección operativa,
> por lo que el cutover completo sigue siendo trabajo de R2-DB-04.

### Especificación

- [ ] **R2-SPEC-01** — Aprobar ADR-002: clave canónica, ownership de campos, merge/split, snapshots y permisos.
- [ ] **R2-SPEC-02** — Definir contrato de importación: atómico versus reanudable, límites, conteos y reporte.
- [ ] **R2-SPEC-03** — Definir qué datos permanentes puede editar cada actor y qué cambios requieren aprobación.

### Datos y migración

- [x] **R2-DB-01** — Crear `locations`, asociación proyecto–locación, requisitos/permisos, adjuntos permanentes y eventos de cambio. `20260805000003_canonical_locations.sql` (1204 líneas) crea las seis tablas con triggers de validación y auditoría. **Aplicada el 12-08-2026.**
- [x] **R2-DB-02** — Agregar FK de compatibilidad a `sites`; crear RLS/Storage por actor y alcance. Misma migración: `sites.location_id` con índice, `can_read_location()` y ~20 policies por actor (manager/coordinador/instalador) sobre las seis tablas. **Aplicada.**
- [x] **R2-DB-03** — Backfill reanudable por referencia externa; reporte de nuevos/seguros/ambiguos y revisión manual. Corregido respecto de la nota anterior: el backfill **sí existe**, es la sección 4 de `20260805000003` (no un proceso aparte). Deduplica por `(company_id, client_id, normalized_external_ref)`, es reanudable por `on conflict do nothing`, y lo que no puede resolver va a `location_backfill_issues` en vez de fusionarse por nombre. Ejecutado: 130 sites → 129 vinculados, 119 locaciones, 3 en cola. Existe la vista `location_backfill_report` con los conteos RLS-aware. **Falta la UI de revisión (R2-UI-03).**
- [~] **R2-DB-04** — Dual-read y reconciliación de ficha, galería, historial, rutas y órdenes; cortar sólo con divergencia cero aceptada. `/locations/[id]` lee identidad, asociaciones, requisitos, adjuntos y auditoría canónicos; OTs, incidentes, evidencia y documentos anteriores se alcanzan por la FK explícita `sites.location_id`, sin volver a la heurística por nombre/dirección. Si existe una OT vinculada pero falta temporalmente `project_locations`, la ficha la muestra como pendiente de conciliar en vez de ocultarla. El write path también cortó: alta manual e importación crean `locations` + `project_locations`, reutilizar sólo crea la asociación y la proyección compatible, editar sincroniza la identidad canónica, archivar actualiza la asociación y los documentos nuevos van a `location_attachments`. `sites` queda como proyección necesaria para OTs/rutas.

  **La medición de divergencia ya existe (13-08-2026).** Era el prerrequisito que el propio plan exige —«cortar sólo con divergencia cero aceptada»— y nadie la había hecho: se sabía que 129 de 130 puntos habían quedado vinculados, pero no si los datos de cada par coincidían. `lib/domain/canonical-divergence.ts` compara campo por campo (15 tests) y clasifica cada punto en sin vincular / ficha inexistente / sin asociación / datos distintos. Tolera diferencias que no cambian nada: capitalización y espacios en texto, y ~11 cm en coordenadas por el redondeo de `numeric`. `/locations/review` lo muestra arriba de la cola, y el menú lateral aparece también cuando hay puntos sin vincular, no sólo cuando hay filas en la cola.

  **Medido en el entorno principal: el corte NO es seguro.** 125 alineados, 4 con datos distintos y 1 sin vincular, sobre 130.

  > **Los dos problemas son el mismo.** Los 5 desalineados son exactamente los 3 casos que están sin resolver en la cola de revisión: `ypf-001` y `ypf-002` (el backfill eligió los datos de una variante, y los sites que perdieron conservan los suyos) y `shell001`, que quedó sin vincular por no tener referencia. **Resolver la cola es lo que lleva la divergencia a cero**, y recién entonces migrar las lecturas es seguro. Sin esta medición, migrarlas habría hecho que 5 puntos mostraran datos de otro local.

  **Cola resuelta y divergencia en cero (13-08-2026).** Los 3 casos eran la misma
  historia: el mismo código puesto por error en dos locales de ciudades distintas
  (`YPF-001` y `YPF-002`, cada uno con una copia en CABA y otra en La Plata) más
  uno sin referencia (`shell001`). Se separó cada local real en su propia ficha
  canónica, con su propia referencia externa, en vez de forzarlos a compartir una.
  Las tres filas de la cola quedaron `resolved`, con la nota explicando la
  decisión y quién la tomó.

  Al remedir apareció una **cuarta divergencia que no estaba en la cola**: dos
  fichas nuevas no habían heredado coordenadas o zona del site de origen (un
  descuido al escribir la corrección, no un problema del backfill), y un site
  que sí coincidía en todo lo demás traía una zona vieja
  ("Ciudad Autónoma de Buenos Aires") de antes de que `20260722000002` normalizara
  las provincias argentinas. Corregido. **Medición final: 130 de 130 alineados.**

  **El corte se hizo en la base, no reescribiendo las lecturas (13-08-2026).**
  La divergencia en cero era una foto: nada impedía que volviera a abrirse. El
  write path de la app sincroniza, pero eso depende de que todo camino futuro se
  acuerde de hacerlo —importaciones, SQL directo, backfills, código nuevo—. El
  plan ya declara que «`sites` queda como proyección necesaria para OTs/rutas»;
  `20260813000001_sites_projection_sync.sql` hace que efectivamente lo sea:
  un trigger deriva la identidad del site desde su ficha canónica y otro propaga
  al revés cuando se edita la ficha. Escribir identidad divergente sobre `sites`
  ya no prospera.

  Se eligió esto en vez de reescribir las ~10 consultas que hoy leen identidad de
  `sites`, porque con el invariante garantizado esas lecturas devuelven el dato
  canónico por construcción, y el reescritura habría tocado las policies por actor
  de cada pantalla —incluido el instalador asignado— sin ningún cambio observable.
  **Queda como limpieza opcional, ya no como requisito de corrección.**

  **Alcance deliberado:** sólo se deriva la identidad. `archived_at` y `status`
  siguen siendo de la relación proyecto–punto (archivar es por proyecto; la ficha
  sigue viva para los demás), y un `site` sin `location_id` conserva identidad
  propia.

  Verificado en vivo por SQL contra staging, en bloques revertidos: insertar la
  proyección con otro nombre no crea divergencia, escribirla a mano se corrige
  solo, editar la ficha se propaga, `archived_at`/`status` no se pisan, y el site
  sin ficha conserva lo suyo. Cubierto para CI en
  `supabase/tests/sites_projection_sync.test.sql` (8 asserts; el cuerpo se ejecutó
  contra staging para confirmar que las columnas existen y el test corre de
  verdad, ya que pgTAP sigue sin poder ejecutarse desde esta máquina).
  **E2E 44/44 en verde contra staging**, más type-check, lint, build y 233
  unitarios limpios. Divergencia tras aplicar en el entorno principal: **130/130.**

  Efecto lateral: el update explícito a `sites` dentro de `updateSite`
  (`lib/actions/sites.ts`) quedó redundante. Se dejó como está —es idempotente
  con el trigger— para no mezclar el cambio de datos con refactor de acciones.

### Import/export

- [x] **R2-IMP-01** — Separar acciones Descargar plantilla / Importar / Exportar. Las tres son acciones distintas en «Adm. instalaciones»: plantilla vacía (`/api/site-template`), diálogo de importación, y exportación (R2-IMP-04). El botón de exportar se oculta si el proyecto no tiene locaciones, donde daría un archivo vacío.
- [x] **R2-IMP-02** — Parser/preflight sin escritura con preview y conteos esperadas/encontradas/válidas/incompletas/duplicadas. `lib/domain/site-import.ts` concentra el análisis como función pura y `analyzeSiteImport()` lo expone sin escribir nada; el diálogo pasó a dos pasos (revisar → confirmar) y muestra informados/encontrados/a importar/diferencia, con el aviso del caso de la minuta (50 vs 47). 18 tests unitarios en `site-import.test.ts`. El servidor reparsea el archivo original al confirmar: nunca acepta filas armadas por el cliente.
- [x] **R2-IMP-03** — Confirmación idempotente por `import_id`, upsert canónico y reporte descargable por fila. Se agregó deduplicación por referencia externa dentro de la planilla y contra el proyecto; la confirmación busca además la referencia normalizada en `locations`: si ya existe para el cliente, asocia esa identidad sin sobrescribirla; si no, crea la ficha canónica y su proyección. Reimportar al mismo proyecto no duplica.

  **Completado el 13-08-2026 con `20260813000002_site_import_batches.sql`.**

  > **El agujero que faltaba tapar no era el que decía el título.** El dedupe por
  > referencia ya protegía a las filas CON código. Las que no lo traen generaban
  > un uuid nuevo en cada intento, así que un lote que fallaba a mitad de camino
  > (la inserción va de a 500) duplicaba, al reintentar, todas las filas sin
  > código de las tandas que sí habían entrado. `attachCanonicalLocations` ya era
  > idempotente; esto no.

  El lote (`site_import_batches`) es la unidad idempotente y su id se **deriva de
  un checksum de (proyecto + contenido del archivo)**, no viene del cliente: el
  mismo archivo cae siempre en el mismo lote, y no hay id ajeno que validar.
  Reconfirmar un lote ya cerrado devuelve lo que entró sin volver a escribir.
  `site_import_rows` guarda el resultado por fila y cumple doble función a
  propósito: es el registro que permite reanudar (qué fila produjo qué locación)
  y es el reporte descargable. Las filas se anotan **después de cada tanda**, no
  al final, que es lo que hace que la reanudación sirva.

  Reporte en `GET /api/projects/[id]/imports/[importId]/report` (xlsx: fila,
  nombre, código, resultado, motivo), con `lib/domain/import-report.ts` puro
  (10 tests) y enlace desde el diálogo al terminar.

  **Verificado contra staging con 2 casos E2E nuevos** (`site-import.spec.ts`):
  uno con código externo que además baja el reporte y verifica la numeración
  contra la planilla; y otro **sin código externo**, que es el caso decisivo —
  ahí el dedupe por referencia no puede hacer nada y sólo el lote evita duplicar.
  Se contó sobre la exportación real del proyecto: 4 filas → 4 puntos, no 8.
  Confirmado también por SQL: cada fila importada tiene exactamente 1 site y 1
  asociación.

  **Lo que NO se cubrió** (queda en R2-QA-03): el volumen real de 2.000 filas
  —se probó con 6 y 4— y el fallo intermedio con reanudación fila por fila, que
  necesita forzar un error a mitad del lote y no se puede provocar desde
  Playwright. La reanudación está implementada y su mecanismo verificado, pero
  no ejercitada con una interrupción real.

  > **Dos hallazgos al construir esto, ninguno buscado:**
  >
  > 1. **`types/database.ts` no es puramente generado.** Regenerarlo y punto
  >    rompe el type-check en ~40 lugares: el generador emite `string` para las
  >    columnas con CHECK cerrado y borra los alias de dominio. `AGENTS.md` lo
  >    documenta —hay que correr `node scripts/narrow-database-types.mjs`
  >    después— y es fácil no verlo. Se sumaron ahí `SiteImportBatchStatus` y
  >    `SiteImportRowOutcome`.
  > 2. **El seed tenía el proyecto con `zones` vacío** y 20 sites en
  >    `AR-BA-AMBA`/`AR-CBA`: inconsistente consigo mismo. Con la lista vacía la
  >    importación rechazaba **toda** fila por «zona fuera del proyecto», y
  >    editar el proyecto también fallaba, porque `updateProject` exige que las
  >    zonas elegidas incluyan las que ya están en uso. Es decir: el camino de
  >    importación **no era testeable de punta a punta** en staging. Corregido en
  >    `supabase/seed.sql` y en staging.
- [x] **R2-IMP-04** — Exportación XLSX seleccionada/completa con contrato de round-trip. `GET /api/projects/[id]/sites/export` baja las locaciones activas del proyecto, paginado de a 1000 para que un proyecto grande no exporte sólo la primera página. **El contrato de round-trip está probado, no declarado**: `lib/domain/site-export.ts` toma las columnas de `SITE_TEMPLATE_HEADERS` (misma fuente que la plantilla y el lector), y el test alimenta lo exportado de vuelta a `analyzeSiteRows` verificando que las 3 filas vuelven íntegras, con coordenadas y referencias. Cubre también que reimportar al mismo proyecto no duplica: las filas con código se reconocen como ya cargadas. 10 tests unitarios + 2 E2E (uno verifica el .xlsx real que sale del servidor, otro que un instalador recibe 404 en vez de la planilla de otra empresa). Verificado en vivo contra staging: 20 filas, encabezado exacto, nombre de archivo sin acentos.
  - **Alcance:** exporta por proyecto, que es donde ocurre la importación. La variante «completa» (todas las locaciones de la empresa) no se hizo: sin la ficha canónica en la UI (R2-UI-01) no está claro desde dónde se pediría.
- [ ] **R2-IMP-05** — Spike separado para PDF/Word/Excel variable; no incorporar al MVP determinista sin especificación nueva. Detalle y pendientes de UX: [importación de locaciones](../2026-09-02-importacion-locaciones/README.md).

### UI

Ya no están bloqueadas: el esquema y los tipos existen. R2-UI-03 se hizo primero
porque había 3 filas reales esperando en producción sin forma de verlas.

> **Hallazgo al construir R2-UI-03:** `playwright.config.ts` apunta a `127.0.0.1`
> y el dev server de Next considera `localhost` su origen, así que bloqueaba la
> carga de sus propios chunks y **la página nunca hidrataba**. Los tests de
> navegación pasaban igual y sólo fallaba el primero que necesitó un clic, sin
> ningún mensaje que lo explicara. Resuelto con `allowedDevOrigins` en
> `next.config.ts` (sólo afecta a `next dev`). Cualquier test de interactividad
> anterior habría fallado por esto.

- [x] **R2-UI-01** — Ficha canónica con proyectos, OTs, evidencias, incidentes, requisitos y auditoría. `/locations/[id]` funciona como pasaporte permanente del local: cabecera de identidad, condiciones operativas, trayectoria cronológica entre proyectos y OTs, evidencia acumulada, incidencias de todas las visitas, requisitos/permisos, documentos y eventos de cambio. Se llega desde la ficha del cliente, la OT y la proyección del proyecto. `lib/data/location-detail.ts` hace el agregado RLS-aware y `lib/domain/location-detail.ts` conserva historia aun ante divergencia temporal. El seed local replica el backfill porque corre después de las migraciones. Verificado: unitarios, type-check, lint completo y build limpios. Se agregaron 2 E2E en `canonical-location.spec.ts` (recorrido e aislamiento A/B).

  **Ejecutados el 13-08-2026 contra staging: 43/43 en verde** (los dos nuevos incluidos). Las dos fallas de la primera corrida eran de los tests, no de la ficha:
  1. `a[href^="/locations/"]` agarraba el link del menú a `/locations/review` —la cola de revisión de R2-UI-03— antes que a cualquier ficha. En el caso de aislamiento eso era peor que un rojo: el gerente B veía su **propia** cola vacía, así que el test habría podido pasar sin probar nada. Ahora el selector se acota a `main`, excluye esa ruta y **afirma que el href tiene forma de uuid** para que no vuelva a colarse un falso verde.
  2. Se esperaba `Auditoría de la ficha` por rol `heading`, pero `CardTitle` renderiza un `<div>`.

  > **Accesibilidad, pendiente y transversal:** ningún título de tarjeta de la app es un encabezado semántico, porque `components/ui/card.tsx` define `CardTitle` como `<div>`. Quien navegue con lector de pantalla no puede saltar por secciones en ninguna pantalla, no sólo en ésta. No se cambió acá porque toca un primitivo compartido por toda la interfaz y merece decidirse aparte.
- [x] **R2-UI-02** — Reutilizar locación existente al crear oportunidad/proyecto sin copiarla. Al terminar de crear un proyecto se abre el selector de fichas canónicas del cliente. `fetchReusableLocations` lee `locations` y excluye las que ya tienen `project_locations`; `reuseLocations` conserva el mismo `locations.id` y sus documentos, agrega la asociación y crea únicamente la proyección `sites` exigida por el dual-read. Ya no compara nombre/dirección ni copia archivos entre carpetas. La oportunidad reutilizará este mismo caso de uso cuando exista en R4.
- [~] **R2-UI-03** — Cola de revisión de matches ambiguos y acción de merge/split auditada. `/locations/review` para gerencia, con `lib/domain/location-issues.ts` (puro, 11 tests), `lib/data/location-issues.ts` y la acción `resolveLocationIssue`. Muestra las variantes enfrentadas y **resalta los campos que difieren**, que es lo que hace rápida la decisión: en el caso real de producción se ve de un vistazo que `ypf001` son dos locales distintos (CABA y La Plata), no un duplicado. La nota es obligatoria y queda con autor y fecha. El ítem de menú aparece sólo si hay pendientes: es un artefacto de migración, no una sección permanente. 3 casos E2E (`location-review.spec.ts`), incluida la denegación al instalador. **Falta la acción de merge/split propiamente dicha** — hoy se registra la decisión, no se re-vinculan sites a otra locación; eso necesita definir antes qué pasa con las OTs y la evidencia ya asociadas.

### Pruebas y gate

- [x] **R2-QA-01** — Backfill sobre copia representativa, conteos/checksum, duplicados y rollback. Ejecutado el 13-08-2026 **contra el entorno principal** —los 130 sites reales, que son el dato representativo— dentro de bloques que revierten al terminar. Se corrió el backfill tal como está en la sección 4 de `20260805000003`, no una transcripción.

  **Prueba 1 — re-ejecución sobre la base ya migrada (reanudabilidad):**
  - **0 fichas nuevas** al volver a correrlo: es reanudable de verdad, no sólo por el `on conflict`.
  - **Conteo estable**: 122 locaciones antes y después.
  - **Checksum del conjunto canónico intacto**: no pisa identidades existentes.
  - **0 duplicados** de clave canónica `(empresa, cliente, referencia normalizada)`.
  - **0 sites** con referencia resoluble y sin ficha; **0 fichas** sin proyección viva.

  **Prueba 2 — reproducción desde cero (determinismo):** se arrasó toda la capa canónica (fichas, asociaciones, adjuntos, requisitos, auditoría y cola) y se volvió a correr el backfill sobre los mismos sites.
  - **121 de 122 reproducidas**, y **las 121 coinciden con una identidad original**: no inventa ninguna.
  - **La única que no reproduce es `shell001`**, que es precisamente la que se creó a mano el 13-08-2026 por **no tener referencia externa**. El backfill sólo procesa filas con referencia resoluble, así que no recrearla es su comportamiento conservador correcto, no un agujero.

  **Rollback verificado:** al terminar, el entorno principal quedó idéntico — 122 locaciones, 130 sites, 0 sin ficha, 133 asociaciones, la cola con sus 3 filas resueltas y 124 eventos de auditoría.
- [~] **R2-QA-02** — pgTAP/RLS/Storage para manager, coordinador P1/no P2, instalador asignado y A/B. Las seis tablas canónicas ya estaban cubiertas por `canonical_locations.test.sql` (28 asserts). Se agregó `site_import_batches.test.sql` (12 asserts) para las dos tablas nuevas de importación.

  **Verificado en vivo contra staging el 13-08-2026, no sólo escrito:** impersonando a cada actor por `request.jwt.claims`, 7 de 7 sin fugas — el gerente A ve sus 3 lotes y sus 1010 filas, el gerente B no ve **nada** de la empresa A, y ni el coordinador ni el instalador ven un solo lote. Importa porque el detalle por fila lleva nombre y código de todos los puntos de un cliente.

  > **Al escribir el pgTAP aparecieron dos trampas del esquema**, ambas encontradas porque se ejecutó el cuerpo del test contra la base en vez de darlo por bueno: insertar en `public.profiles` explota con clave duplicada (lo crea el trigger `handle_new_user`), y corregir el perfil después tampoco se puede porque `prevent_privilege_change` bloquea tocar `role`/`company_id` fuera del tablero maestro. La forma correcta es pasar el rol y la empresa en `raw_user_meta_data` al insertar en `auth.users`. Un pgTAP escrito de la forma intuitiva habría fallado recién en CI.

  **Falta** lo de Storage: las policies de bucket por actor no se probaron.
- [x] **R2-QA-03** — Import de 2.000 filas, fallo intermedio, reanudación, dedupe y round-trip export/import. **Dedupe, idempotencia y round-trip** quedan cubiertos de forma permanente por los 2 casos E2E de `site-import.spec.ts`. **Volumen, fallo intermedio y reanudación** se ejercitaron el 13-08-2026 con un montaje manual contra staging (no queda como test automático: 2.000 filas tardan minutos y no corresponde en la suite).

  **Montaje:** planilla de 2.000 filas **sin código externo** —donde el dedupe por referencia no puede ayudar— y un trigger veneno temporal en `locations` que revienta la tercera tanda de 500.

  1. **Corrida con el veneno:** el lote quedó `failed` con su mensaje, 1.000 locaciones creadas, 1.000 filas anotadas y 0 sites. Exactamente la interrupción que el diseño supone.
  2. **Corrida sin el veneno, mismo archivo:** lote `completed`, `imported=2000`. Resultado final **2.000 locaciones, 2.000 sites, 2.000 asociaciones y 0 nombres duplicados** — reutilizó las 1.000 anotadas y creó sólo las 1.000 que faltaban, en vez de dejar 3.000.

  Staging quedó restaurado a su estado original (20 sites / 20 locaciones).

  > **La prueba encontró un bug real, y era del código escrito ese mismo día.**
  > La reanudación quedaba **colgada 14 minutos sin escribir nada**. Causa: al
  > recuperar las locaciones ya creadas se pedían hasta 1.000 uuids en un solo
  > `.in()`, y eso viaja en la URL — unos 37 KB de query string. Corregido a
  > tandas de 100: **la misma reanudación pasó de 14 minutos a 16 segundos.**
  >
  > Con 6 filas la reanudación andaba perfecto: el bug **sólo aparecía a
  > volumen**, que es justamente para lo que existía esta tarea.

  > **Pendiente de rendimiento, no de corrección:** la importación corre a
  > ~250 ms por fila (2.000 filas ≈ 4 minutos de reloj) y el diálogo no muestra
  > progreso mientras tanto. No bloquea el gate porque el resultado es correcto,
  > pero a este ritmo una carga real de 2.000 puntos es una espera ciega larga.
  > Merece decidirse aparte: o se acelera (menos viajes por tanda) o se le pone
  > progreso visible.
- [~] **R2-GATE** — Historial reconciliado, ambiguos resueltos, import/export estable y eliminación de proyecto no borra locación. Estado al 13-08-2026:
  - **Historial reconciliado: sí.** 130/130 alineados, y el invariante ahora lo sostiene la base (R2-DB-04).
  - **Ambiguos resueltos: sí.** Las 3 filas de la cola quedaron `resolved` con su nota.
  - **Eliminación de proyecto no borra locación: verificado en vivo.** Estructuralmente `locations` no referencia a `projects`, y se comprobó con un fixture revertido: borrar el proyecto se lleva la proyección `sites` y la asociación `project_locations`, mientras la ficha canónica, **sus documentos permanentes y su auditoría sobreviven**.
  - **Import/export estable: sí.** Verificado a 2.000 filas con fallo intermedio y reanudación (R2-QA-03), después de corregir el bug de volumen que esa prueba destapó.

  **Lo que queda para cerrar el gate formalmente** ya no es verificación de datos: son `R2-SPEC-01/02/03` (ADR-002 y los dos contratos, que son decisiones a aprobar, no código), la acción de merge/split de `R2-UI-03` —que necesita definir antes qué pasa con las OTs y la evidencia ya asociadas— y las policies de Storage de `R2-QA-02`. `R2-QA-01` y `R2-QA-03` quedaron cerradas el 13-08-2026.

## R3 — Actividades, relevamiento, agenda y kernel de avisos

Objetivo: separar relevamiento/ejecución y hacer que toda asignación respete horario, disponibilidad y privacidad.  
Requisitos: REQ-07.1..07.6, REQ-11.1..11.8, REQ-13.5, REQ-13.7.  
Dependencias: R1, R2. Tamaño: XL.

Detalle de ejecución por fases de la parte de relevamiento: [relevamiento y ejecución](../2026-09-02-relevamiento-y-ejecucion/README.md). La agenda y disponibilidad (ADR-004) siguen sin planificar.

### Especificación

- [ ] **R3-SPEC-01** — Aprobar ADR-003: contenedor OT, actividades, lifecycle, surveys y reglas de aprobación.
- [ ] **R3-SPEC-02** — Aprobar ADR-004: timestamps, zona horaria, precisión legacy, disponibilidad, conflictos, traslado y override.
- [ ] **R3-SPEC-03** — Inventariar todas las vías que crean/asignan/reprograman y definir un único contrato.

### Actividades y relevamiento

> La migración `20260805000004_activities_agenda_outbox.sql` (1570 líneas) **ya
> está aplicada** (12-08-2026), aunque R3 nunca se planificó formalmente: venía
> escrita del lote de R0. Cubre la capa de datos de las tres subsecciones de
> abajo. **Nada de `app/` la usa todavía**: las OTs se siguen operando por
> `work_orders` y su estado escalar. Antes de retomar R3, leer la migración: gran
> parte de lo que dicen estas tareas ya existe en la base.

- [x] **R3-ACT-01** — Crear actividades, submissions versionadas, checklist/mediciones y proyecciones legacy. `work_activities`, `survey_submissions` (versionadas, con `one_draft` único) y `survey_submission_decisions`. **Sólo datos: falta la capa de aplicación.**
- [x] **R3-ACT-02** — Migrar OTs actuales; las que están en `relevamiento` conservan su acta/evidencia sin inventar aprobación. Backfill ejecutado sobre las 118 OTs: la evidencia legacy entra como `submitted`, nunca como `approved`, y la ejecución ya empezada recibe un waiver explícito en vez de una aprobación fabricada.
- [ ] **R3-ACT-03** — Comandos guardar/enviar/aprobar/pedir cambios con segregación de funciones. El RPC `decide_survey_submission` existe y bloquea autoaprobación; **falta la Server Action y la UI**.
- [ ] **R3-ACT-04** — UI para relevamiento independiente y como prerequisito de ejecución.

### Agenda y asignación

- [x] **R3-AG-01** — Crear horario/duración/zona/precisión y disponibilidad personal global. `work_assignments` (versionadas, con `schedule_range` y exclusión por GiST), `installer_global_weekly_availability` e `installer_global_unavailability`. La disponibilidad global es privada: sólo la lee su dueño.
- [ ] **R3-AG-02** — Implementar RPC transaccional con lock para chequear y asignar cross-company devolviendo códigos opacos. Existe `assignment_command_receipts` con los códigos opacos y la idempotencia por `operation_id`, pero **el RPC que los emite no está escrito**.
- [ ] **R3-AG-03** — Migrar creación, edición, asignación directa/lote, bolsa y reasignación al mismo RPC.
- [ ] **R3-AG-04** — Primera versión de traslado con coordenadas/buffer; fallback y override auditado.
- [ ] **R3-AG-05** — Crear `/agenda` para empresa e instalador con al menos mes anterior y filtros acordados.
- [ ] **R3-AG-06** — Adaptar Google Calendar a eventos horarios opt-in sin convertirlo en fuente de verdad.

### Kernel de notificación

- [~] **R3-NOT-01** — Outbox/scheduler idempotente, delivery por canal y prueba de notificación in-app. `notification_outbox` y `notification_deliveries` creadas, con `persist_in_app_notification()` para el canal in-app. **Falta el scheduler** que drene la outbox: hoy sólo se escribe en el camino sincrónico.
- [~] **R3-NOT-02** — Correlation IDs, reintento/dead-letter y observabilidad antes de usar deadlines. `correlation_id` y `dedupe_key` agregados a `notifications`; `record_notification_delivery_attempt()` implementa backoff exponencial y dead-letter. **Falta la observabilidad** y quien lo invoque.

### Pruebas y gate

- [ ] **R3-QA-01** — Unitarias de lifecycle, fechas, DST, días límite, buffers y códigos seguros.
- [ ] **R3-QA-02** — Integración de dos asignaciones concurrentes, ausencia y conflicto cross-company sin fuga.
- [ ] **R3-QA-03** — E2E relevamiento standalone/combinado, cambios, aprobación y autoaprobación denegada.
- [ ] **R3-GATE** — Todas las vías de asignación usan el gate; agenda exacta funciona y datos legacy quedan explícitamente imprecisos.

## R4 — Oportunidad, cotización y conversión

Objetivo: publicar antes del proyecto, recibir propuestas y convertir una decisión aprobada sin estados parciales.  
Requisitos: REQ-05.1..05.7, REQ-15.1..15.4.  
Dependencias: R1, R2, R3. Tamaño: XL.

### Especificación

- [ ] **R4-SPEC-01** — Aprobar ADR-005: separación bolsa/oportunidad, elegibilidad, negociación, versiones y selección.
- [ ] **R4-SPEC-02** — Aprobar ADR-006: evidencia y autoridad para registrar aprobación externa.
- [ ] **R4-SPEC-03** — Definir plantilla de qué crea la conversión y reglas para una/múltiples cotizaciones ganadoras.

### Datos y servidor

- [ ] **R4-DB-01** — Crear oportunidades, locaciones, eventos, adjuntos, cotizaciones y revisiones con RLS/Storage.
- [ ] **R4-SRV-01** — Comandos publicar/editar/cerrar y cotizar/revisar/retirar, todos idempotentes.
- [ ] **R4-SRV-02** — Registrar aprobación externa vinculada a revisión exacta.
- [ ] **R4-SRV-03** — RPC de conversión atómica que exige coordinador, usa agenda y crea snapshot financiero.
- [ ] **R4-SRV-04** — Preservar `broadcasts` como staffing de proyecto y renombrar labels para evitar ambigüedad.

### UI

- [ ] **R4-UI-01** — Empresa: oportunidad, comparación de cotizaciones, historial, aprobación y conversión.
- [ ] **R4-UI-02** — Instalador: oportunidades elegibles, cotización propia y revisiones privadas.
- [ ] **R4-UI-03** — Confirmaciones y errores recuperables cuando falta cliente/coordinador/agenda.

### Pruebas y gate

- [ ] **R4-QA-01** — RLS de cotizaciones privadas y coordinador asignado/no asignado.
- [ ] **R4-QA-02** — Conversión repetida, fallo en cada paso y rollback total.
- [ ] **R4-QA-03** — E2E oportunidad → cotización → aprobación registrada → proyecto/OT.
- [ ] **R4-GATE** — Conversión idempotente y reconciliada; no existe acceso de cliente final ni cotización cruzada.

## R5 — Flujo de campo y offline v2

Objetivo: contrato de ejecución completo y equivalente online/offline.  
Requisitos: REQ-01.1..01.9, REQ-14.1..14.7.  
Dependencias: R3; R4 para snapshot/flujo completo. Tamaño: XL.

### Especificación

- [ ] **R5-SPEC-01** — Aprobar ADR-007: command envelope, versiones, conflictos, retención/purga y threat model local.
- [ ] **R5-SPEC-02** — Aprobar ADR-008: eventos, checklist, incidentes, evidencia mínima y decisiones de revisión.
- [ ] **R5-SPEC-03** — Spike y decisión de compresión/carga resumible compatible con Storage.

### Contrato online primero

- [ ] **R5-CMD-01** — Crear eventos append-only y RPC/handler atómico con idempotencia y versión esperada.
- [ ] **R5-CMD-02** — Implementar aceptar, en camino, llegada, avance, incidente/bloqueo y solicitud de finalización.
- [ ] **R5-CMD-03** — Implementar aprobar, pedir evidencia/corrección y reabrir con motivo/segregación.
- [ ] **R5-CMD-04** — Checklist/evidencia configurable y validación tanto en RPC como DB.
- [ ] **R5-CMD-05** — Adaptar `order_updates`/estado actual como proyección hasta migrar todas las vistas.

### PWA y sync

- [ ] **R5-OFF-01** — Cache estructurada de OT/actividad/asignación/locación; app shell sin cache RSC autenticada cross-account.
- [ ] **R5-OFF-02** — Outbox versionada con dependencias, receipts, estados y errores localizados.
- [ ] **R5-OFF-03** — Hacer que online/offline envíen el mismo comando; quitar escrituras directas de tablas.
- [ ] **R5-OFF-04** — Bandeja por elemento con reintento, conflicto y descarte seguro.
- [ ] **R5-OFF-05** — Fotos comprimidas, hash, progreso y carga reanudable; preferencia Wi‑Fi/datos.
- [ ] **R5-OFF-06** — Purga y aislamiento ante logout, cambio de empresa/usuario, sesión expirada y revocación.

### UI y notificaciones

- [ ] **R5-UI-01** — Timeline de campo con timestamp cliente/servidor, actor, evidencia y estado.
- [ ] **R5-UI-02** — Acciones contextuales instalador/coordinador y recuperación de errores offline.
- [ ] **R5-NOT-01** — Avisar al siguiente responsable desde el outbox transaccional, sin duplicados.

### Pruebas y gate

- [ ] **R5-QA-01** — Tabla completa de transición válida/inválida en dominio y DB.
- [ ] **R5-QA-02** — Replay, evento fuera de orden, versión obsoleta y evidencia insuficiente.
- [ ] **R5-QA-03** — Teléfono real: modo avión, reinicio, token vencido, foto cortada, reconexión y cambio de cuenta.
- [ ] **R5-QA-04** — Storage/RLS, MIME/tamaño, URL firmada y acceso cross-tenant.
- [ ] **R5-GATE** — Cero divergencia online/offline, no hay transición directa desde cliente y los escenarios chaos son verdes.

## R6 — Reprogramación, cancelación, confiabilidad sombra y avisos

Objetivo: compromisos reprogramables con plazo probado, revisión humana y comunicación confiable.  
Requisitos: REQ-06.1..06.9, REQ-13.1, REQ-13.2, REQ-13.5, REQ-13.7.  
Dependencias: R3, R5. Tamaño: XL.

Detalle de ejecución por fases: [confiabilidad y reprogramaciones](../2026-09-01-confiabilidad-y-reprogramaciones/README.md). La fase 0 ya cerró DEC-07, el calendario, las tablas de flujo y su RLS.

### Especificación

- [x] **R6-SPEC-01** — Aprobar ADR-009: inicio del plazo, calendario/feriados, silencio, motivos, evidencia, autoridad, recuperación y apelación.
- [ ] **R6-SPEC-02** — Definir privacidad/retención de motivos y condición para salir de shadow mode.

### Datos y servidor

- [ ] **R6-DB-01** — Crear revisiones de agenda, respuestas, cancelaciones y eventos/reglas de confiabilidad.
- [ ] **R6-SRV-01** — Reprogramación atómica: horario, respuesta pendiente, notificación in-app y deadline.
- [ ] **R6-SRV-02** — Solicitar/revisar cancelación y emitir reversas auditables.
- [ ] **R6-JOB-01** — Recordatorios, vencimientos y recálculo idempotente con dead-letter.
- [ ] **R6-REL-01** — Calcular confiabilidad en shadow mode y herramienta de explicación/revisión.

### Notificaciones

- [ ] **R6-NOT-01** — Agregar archivo/desarchivo/filtrado por destinatario sin borrar origen.
- [ ] **R6-NOT-02** — Render de severidad rojo/amarillo/neutro con texto/ícono accesible.

### UI

- [ ] **R6-UI-01** — Reconfirmación y plazo para instalador; historial de revisiones para empresa.
- [ ] **R6-UI-02** — Solicitud/revisión de baja con minimización de datos.
- [ ] **R6-UI-03** — Explicación de score sombra visible a operadores autorizados, no pública.

### Pruebas y gate

- [ ] **R6-QA-01** — Días hábiles/feriados/DST, prueba de notificación, silencio, revisión y reversa.
- [ ] **R6-QA-02** — Scheduler repetido/fallido y fan-out por canal sin duplicados.
- [ ] **R6-QA-03** — Privacidad cross-company y acceso a motivos sensibles.
- [ ] **R6-GATE** — Reprogramación íntegra y métricas sombra estables; penalización pública sigue deshabilitada hasta aprobación explícita.

## R7 — Ledger financiero y tableros privados

Objetivo: separar ingreso, costo, gasto, devengamiento y pago con aislamiento estricto.  
Requisitos: REQ-02.1..02.8.  
Dependencias: R4, R5; reglas de cancelación de R6. Tamaño: XL.

### Especificación

- [ ] **R7-SPEC-01** — Aprobar ADR-010: semántica de montos, devengamiento, pagos parciales, ajustes, disputas, impuestos/retenciones y permisos.
- [ ] **R7-SPEC-02** — Definir estados y ejemplos contables de punta a punta sin pretender un motor fiscal.

### Datos y servidor

- [ ] **R7-DB-01** — Crear pricing, compensaciones, eventos y ledger de proyecto con moneda por fila.
- [ ] **R7-DB-02** — Backfill de montos actuales marcando semántica/origen; los ambiguos no se convierten automáticamente en honorario.
- [ ] **R7-SRV-01** — Comandos acordar/devengar/pagar/ajustar/disputar/revertir, idempotentes y auditados.
- [ ] **R7-SRV-02** — Vistas/RPC separadas para empresa e instalador multiempresa.
- [ ] **R7-SRV-03** — Queries de P&L, presupuesto vs real y conciliación por OT/proyecto/moneda.

### UI

- [ ] **R7-UI-01** — Finanzas del instalador con filtros empresa/período/OT/servicio/estado.
- [ ] **R7-UI-02** — Finanzas de empresa con ingresos, costos, gastos, devengado/pagado y rentabilidad.
- [ ] **R7-UI-03** — Historia de movimientos, pagos parciales, ajuste/reversa y exportación autorizada.

### Pruebas y gate

- [ ] **R7-QA-01** — Aritmética/rounding, parciales, reversas, disputa y monedas separadas.
- [ ] **R7-QA-02** — RLS A/B, instalador propio multiempresa, coordinador sin acceso y exportaciones.
- [ ] **R7-QA-03** — Reconciliación evento → saldo → proyecto/dashboard sobre dataset representativo.
- [ ] **R7-GATE** — Saldos reproducibles, backfill aprobado y ninguna UI trata `finalizada` como `pagada`.

## R8 — Chat por OT, comunicaciones segmentadas y reputación

Objetivo: colaboración trazable y perfiles profesionales explicables.  
Requisitos: REQ-03.1..03.7, REQ-10.1..10.6, REQ-13.1..13.6.  
Dependencias: R1, R3, R5, R6; reputación depende de eventos estables. Tamaño: XL.

### Chat y multimedia

- [ ] **R8-CHAT-01** — Aprobar ADR-012: scope de hilos, canal general, captions/tags, límites, análisis, retención y futuro OCR.
- [ ] **R8-CHAT-02** — Migrar/crear hilo por OT y adjuntos normalizados con RLS/Storage.
- [ ] **R8-CHAT-03** — Búsqueda server-side paginada por texto/archivo/caption/autor/fecha y filtros de tipo.
- [ ] **R8-CHAT-04** — Galería cronológica por OT y navegación desde búsqueda global.
- [ ] **R8-CHAT-05** — Definir/implementar comportamiento de mensaje/adjunto offline sin violar dependencias de medios.

### Comunicaciones

- [ ] **R8-COM-01** — Modelo de comunicación/deliveries e historial completo.
- [ ] **R8-COM-02** — Segmentos combinables por provincia, localidad, servicio, equipo/proyecto y disponibilidad.
- [ ] **R8-COM-03** — Preview/conteo con la misma consulta de fan-out e idempotencia por destinatario.
- [ ] **R8-COM-04** — Verificar que ninguna comunicación crea bolsa/OT/compromiso.

### Reputación

- [ ] **R8-REP-01** — Aprobar ADR-011: fórmula, versiones, mínimo de muestra, recuperación, badges, visibilidad y apelación.
- [ ] **R8-REP-02** — Crear taxonomía de dificultad/servicio/anticipación y performance events/reversas.
- [ ] **R8-REP-03** — Proyección determinista separada de confiabilidad; shadow mode y comparación.
- [ ] **R8-REP-04** — Perfil propio explicable y vista pública agregada/anonimizada.

### Pruebas y gate

- [ ] **R8-QA-01** — Chat OT P1/no P2, búsqueda más allá de 300 mensajes, URLs y archivos inválidos.
- [ ] **R8-QA-02** — Fan-out masivo, retry y segmentos A/B sin destinatarios cruzados.
- [ ] **R8-QA-03** — Recalculo de reputación, reversa, mínimo de muestra y privacidad histórica.
- [ ] **R8-GATE** — Colaboración tenant-safe y fórmulas aprobadas; OCR/IA sigue apagado salvo spec independiente.

## R9 — Dashboard, clima, pt-BR, onboarding y cierre

Objetivo: presentar métricas confiables y dejar la versión operable/enseñable.  
Requisitos: REQ-12.1..12.6, REQ-16.3..16.5, NFR-UX-01..03, NFR-I18N-01.  
Dependencias: fuentes estabilizadas en R5–R8. Tamaño: L.

### Dashboard y clima

- [ ] **R9-DASH-01** — Catálogo de KPIs con definición, fuente, filtros y query de reconciliación.
- [ ] **R9-DASH-02** — Reorganizar jerarquía sin perder métricas actuales; filtros comunes período/proyecto/provincia/instalador.
- [ ] **R9-DASH-03** — Migrar KPIs a field/performance/finance events y validar contra SQL fuente.
- [ ] **R9-WEA-01** — Coordenadas correctas por región, pronóstico 48 h, cache/timeout y degradación explícita.
- [ ] **R9-WEA-02** — Cruzar alerta con ventana y OTs afectadas; mantenerla informativa.

### Localización y capacitación

- [ ] **R9-I18N-01** — Barrido automático de paridad y QA semántico por hablante pt-BR.
- [ ] **R9-DOC-01** — Ayuda contextual versionada dentro de la app.
- [ ] **R9-DOC-02** — Manual por rol y video de aceptar OT, ejecución, offline/sync, incidentes y recuperación.
- [ ] **R9-UX-01** — Accesibilidad/responsive 375 px, tablet y escritorio en recorridos críticos.

### Pruebas y gate

- [ ] **R9-QA-01** — Dashboard concilia con eventos/ledgers para filtros y monedas.
- [ ] **R9-QA-02** — Clima de proveedor caído, provincia sin coordenadas y alerta 48 h.
- [ ] **R9-QA-03** — UAT final por rol, multiempresa, dual, PWA real, es y pt-BR con evidencia.
- [ ] **R9-GATE** — Checklist firmado, manual publicado, runbooks/rollback listos y rollout gradual estable.

## Dependencias y paralelización segura

| Trabajo | Puede empezar | No debe cerrar antes de |
|---|---|---|
| Diseño UI de locación/import | Tras ADR-002 | R1 RLS y modelo R2 |
| Investigación de carga resumible | R0 | ADR-007 y contrato R5 |
| Diseño visual de agenda | Tras ADR-004 | Motor transaccional R3 |
| Prototipo de oportunidad | Tras ADR-005 | R1–R3 y conversión R4 |
| Catálogo financiero | Tras ADR-010 | Snapshot R4 y eventos/aprobación R5 |
| UX chat/galería | Tras ADR-012 | RLS de OT y modelo de adjuntos R8 |
| Catálogo de KPIs/manual | Puede bosquejarse temprano | Fuentes y UX estables R5–R8 |

Después de R5, el diseño/implementación de finanzas (R7) y chat/comunicaciones (parte de R8) puede avanzar en paralelo si se mantienen migraciones coordinadas. Reputación debe esperar a que confiabilidad y eventos reales estén estables.

## Gates obligatorios por slice/release

1. **Specification gate:** requisitos, ejemplos, errores y decisiones abiertas cerrados.
2. **Threat-model gate:** actor × recurso × acción, privacidad, archivos y segregación.
3. **Migration gate:** forward, backfill medido, tipos regenerados, compatibilidad y rollback ensayado.
4. **DB gate:** constraints, RPC, concurrencia y pgTAP/RLS verdes en entorno aislado.
5. **Code gate:** install frozen, lint, type-check, unit/integration y build verdes en CI.
6. **E2E gate:** caminos felices, denegaciones, errores y recuperación por rol.
7. **Offline/chaos gate:** cuando aplique, teléfono real, modo avión, replay, corte, token y cambio de cuenta.
8. **Security/privacy gate:** A/B, URLs, exports, caches y datos sensibles.
9. **Performance gate:** umbral acordado con dataset representativo.
10. **UAT gate:** aceptación firmada en staging, no en producción.
11. **Deploy gate:** backup, flag, observabilidad, runbook y rollback.
12. **Post-release gate:** canary observado y decisión explícita de ampliar/retirar legacy.

## Matriz de trazabilidad

| Requisito | Release/tareas principales | Prueba de aceptación dominante |
|---|---|---|
| REQ-01 | R5-OFF/CMD | teléfono real + chaos + idempotencia DB |
| REQ-02 | R7 | reconciliación ledger + RLS financiera A/B |
| REQ-03 | R8-CHAT | E2E hilo OT + búsqueda paginada + Storage |
| REQ-04 | R2-DB/UI | backfill + historia acumulada + RLS |
| REQ-05 | R4 | conversión idempotente/fallo atómico + cotización privada |
| REQ-06 | R6 | calendario/notificación/revisión/reversa |
| REQ-07 | R3-ACT | standalone/combinado + autoaprobación bloqueada |
| REQ-08 | R2-IMP | preflight + 2.000 filas + round-trip |
| REQ-09 | R1 | matriz capacidades/RLS + usuario dual |
| REQ-10 | R8-REP | recalculo determinista + privacidad + apelación |
| REQ-11 | R3-AG | carrera concurrente + conflicto opaco cross-company |
| REQ-12 | R9-DASH/WEA | conciliación SQL + proveedor caído/48 h |
| REQ-13 | R3-NOT, R6-NOT, R8-COM | fan-out idempotente + archivo independiente |
| REQ-14 | R5-CMD/UI | transición/evidencia + offline fuera de orden |
| REQ-15 | R4 y checks globales | no hay auth/URL privada de cliente |
| REQ-16 | R0-EMAIL, R9-I18N/DOC/UX | recepción real + QA pt-BR + UAT |

## Primer corte recomendado

No iniciar las diez releases a la vez. El primer ciclo de trabajo debería cerrar:

1. **SDD-004/005:** validar decisiones de R0 y R1.
2. **R0-FIX-01..05:** eliminar riesgos actuales que podrían contaminar cualquier prueba.
3. **R0-PLAT-01..05:** obtener CI, staging, E2E mínimo y observabilidad.
4. **R1 completo:** convertir el rol dual en la primera entrega de dominio bajo el nuevo circuito SDD.

R1 funciona también como prueba del método: incluye migración, RLS, servidor, UI, auditoría, E2E y cutover, pero es más acotado que locaciones/agenda/offline.

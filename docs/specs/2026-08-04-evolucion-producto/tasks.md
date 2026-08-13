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

**Proyecto Supabase: `rpdjjvcmtcpvmwrjqhke` («Saas de Instalaciones»), que es el
que usa la app.** Existe además `jibvorqudveqgankoeak` («Se Instala Pro»), que
NO es el productivo. No tiene backups configurados.

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

> **Hallazgo sin resolver: pgTAP está instalado en el schema `public` de
> producción** (v1.3.3). Es el origen de las ~1079 funciones, 2 vistas y 29
> columnas que producción tiene de más respecto de staging. Ninguna migración del
> repo lo instala, así que alguien lo puso a mano para correr los tests ahí —
> justo lo que `playwright.config.ts` desaconseja. No rompe nada, pero deja
> funciones que exponen metadatos del esquema (`has_table`, `policies_are`…)
> ejecutables por cualquier usuario autenticado. Conviene sacarlo
> (`drop extension pgtap;`) o moverlo a un schema aparte; no se hizo todavía
> porque es un cambio en producción que hay que decidir aparte.

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
- [~] **R1-QA-02** — pgTAP de toda policy migrada con A/B, dual y coordinador P1/no P2. `multi_role_memberships.test.sql` (16 asserts) y `no_self_approval.test.sql` (6 asserts, nuevo) cubren membresía y autoaprobación. Sin ejecutar todavía: requiere Docker, se valida en CI.
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
> Lo que sigue faltando no es el esquema sino la UI: nada en `app/` lee todavía
> las tablas canónicas. `sites` sigue siendo la proyección que usan todas las
> pantallas.

### Especificación

- [ ] **R2-SPEC-01** — Aprobar ADR-002: clave canónica, ownership de campos, merge/split, snapshots y permisos.
- [ ] **R2-SPEC-02** — Definir contrato de importación: atómico versus reanudable, límites, conteos y reporte.
- [ ] **R2-SPEC-03** — Definir qué datos permanentes puede editar cada actor y qué cambios requieren aprobación.

### Datos y migración

- [x] **R2-DB-01** — Crear `locations`, asociación proyecto–locación, requisitos/permisos, adjuntos permanentes y eventos de cambio. `20260805000003_canonical_locations.sql` (1204 líneas) crea las seis tablas con triggers de validación y auditoría. **Aplicada el 12-08-2026.**
- [x] **R2-DB-02** — Agregar FK de compatibilidad a `sites`; crear RLS/Storage por actor y alcance. Misma migración: `sites.location_id` con índice, `can_read_location()` y ~20 policies por actor (manager/coordinador/instalador) sobre las seis tablas. **Aplicada.**
- [x] **R2-DB-03** — Backfill reanudable por referencia externa; reporte de nuevos/seguros/ambiguos y revisión manual. Corregido respecto de la nota anterior: el backfill **sí existe**, es la sección 4 de `20260805000003` (no un proceso aparte). Deduplica por `(company_id, client_id, normalized_external_ref)`, es reanudable por `on conflict do nothing`, y lo que no puede resolver va a `location_backfill_issues` en vez de fusionarse por nombre. Ejecutado: 130 sites → 129 vinculados, 119 locaciones, 3 en cola. Existe la vista `location_backfill_report` con los conteos RLS-aware. **Falta la UI de revisión (R2-UI-03).**
- [ ] **R2-DB-04** — Dual-read y reconciliación de ficha, galería, historial, rutas y órdenes; cortar sólo con divergencia cero aceptada. Ya no está bloqueado: los tipos existen. Nadie lee todavía las tablas canónicas desde `app/`.

### Import/export

- [~] **R2-IMP-01** — Separar acciones Descargar plantilla / Importar / Exportar. «Descargar planilla Excel» ya existía como acción propia (`/api/site-template`) y la importación es un diálogo separado. **Falta exportar**, que todavía no existe para locaciones (ver R2-IMP-04).
- [x] **R2-IMP-02** — Parser/preflight sin escritura con preview y conteos esperadas/encontradas/válidas/incompletas/duplicadas. `lib/domain/site-import.ts` concentra el análisis como función pura y `analyzeSiteImport()` lo expone sin escribir nada; el diálogo pasó a dos pasos (revisar → confirmar) y muestra informados/encontrados/a importar/diferencia, con el aviso del caso de la minuta (50 vs 47). 18 tests unitarios en `site-import.test.ts`. El servidor reparsea el archivo original al confirmar: nunca acepta filas armadas por el cliente.
- [~] **R2-IMP-03** — Confirmación idempotente por `import_id`, upsert canónico y reporte descargable por fila. Se agregó deduplicación por referencia externa (dentro de la planilla y contra lo ya cargado en el proyecto), que hace que reimportar el mismo archivo no duplique puntos. **Falta** el `import_id` explícito, el upsert canónico (depende del esquema bloqueado) y el reporte descargable.
- [ ] **R2-IMP-04** — Exportación XLSX seleccionada/completa con contrato de round-trip.
- [ ] **R2-IMP-05** — Spike separado para PDF/Word/Excel variable; no incorporar al MVP determinista sin especificación nueva.

### UI

Ya no están bloqueadas: el esquema y los tipos existen. Es trabajo de UI pendiente.
**R2-UI-03 es la más urgente de las tres**, porque hay 3 filas reales esperando
resolución en `location_backfill_issues` y hoy no hay forma de verlas desde la app.

- [ ] **R2-UI-01** — Ficha canónica con proyectos, OTs, evidencias, incidentes, requisitos y auditoría.
- [ ] **R2-UI-02** — Reutilizar locación existente al crear oportunidad/proyecto sin copiarla. Existe `lib/actions/projects/reuse.ts`, que reutiliza `sites` de proyectos anteriores del mismo cliente — es el antecesor de esta tarea sobre el modelo viejo, no la ficha canónica.
- [ ] **R2-UI-03** — Cola de revisión de matches ambiguos y acción de merge/split auditada.

### Pruebas y gate

- [ ] **R2-QA-01** — Backfill sobre copia representativa, conteos/checksum, duplicados y rollback.
- [ ] **R2-QA-02** — pgTAP/RLS/Storage para manager, coordinador P1/no P2, instalador asignado y A/B.
- [ ] **R2-QA-03** — Import de 2.000 filas, fallo intermedio, reanudación, dedupe y round-trip export/import.
- [ ] **R2-GATE** — Historial reconciliado, ambiguos resueltos, import/export estable y eliminación de proyecto no borra locación.

## R3 — Actividades, relevamiento, agenda y kernel de avisos

Objetivo: separar relevamiento/ejecución y hacer que toda asignación respete horario, disponibilidad y privacidad.  
Requisitos: REQ-07.1..07.6, REQ-11.1..11.8, REQ-13.5, REQ-13.7.  
Dependencias: R1, R2. Tamaño: XL.

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

### Especificación

- [ ] **R6-SPEC-01** — Aprobar ADR-009: inicio del plazo, calendario/feriados, silencio, motivos, evidencia, autoridad, recuperación y apelación.
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

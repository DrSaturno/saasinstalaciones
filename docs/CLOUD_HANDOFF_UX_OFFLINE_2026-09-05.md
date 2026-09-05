# Handoff para Cloud — fase UX de riesgo operativo, offline y validación externa

**Fecha:** 2026-09-05  
**Proyecto:** Se Instala / `saasinstalaciones`  
**Directorio local:** `C:\Users\nicol\OneDrive\Documentos\Planeta Saturno\Claude\saasgf\saasinstalaciones`  
**Rama observada al cerrar este informe:** `ops-reconciliar-migraciones`  
**HEAD observado:** `d1e6761`  
**Documento de línea de base:** `docs/UX_AUDIT.md`

## 1. Instrucción operativa para Cloud

Este documento es un handoff ejecutable. Antes de modificar algo:

1. Leer completo `AGENTS.md` y respetar sus límites de seguridad y arquitectura.
2. Leer `docs/UX_AUDIT.md`; los findings originales siguen siendo la línea de base y la tabla inicial registra qué parte ya fue implementada.
3. Preservar el working tree actual. No usar `git reset`, `git checkout --`, restauraciones masivas ni limpiezas de archivos no rastreados.
4. No asumir que todos los cambios sin commit pertenecen a una sola persona. Revisarlos como una unidad y no sobrescribir trabajo preexistente.
5. No abrir, imprimir, copiar, resumir ni versionar secretos, archivos `.env`, tokens ni los estados autenticados de `e2e/.auth/*.json`.
6. No usar producción para los E2E. Los tests autenticados escriben datos y fueron diseñados para Supabase local o un proyecto de testing aislado.
7. Antes de cualquier escritura externa —Supabase, Vercel, Git, correo, calendario u otra integración— obtener la autorización explícita que exijan el usuario y `AGENTS.md`.
8. Empezar por verificaciones read-only. Si una verificación falla, identificar la causa y corregirla; no desplegar ni promover a producción para “ver si funciona”.

## 2. Estado ejecutivo

Se implementó la primera fase de mayor riesgo operativo de la auditoría UX:

- continuidad de órdenes durante `en_camino` y `en_sitio`;
- reapertura de rutas de campo previamente visitadas cuando no hay red;
- aislamiento de caché y almacenamiento offline por identidad;
- recuperación visible de operaciones offline bloqueadas o con múltiples reintentos;
- separación entre “consulta vacía” y “falló la lectura” en consultas críticas;
- confirmaciones contextuales para acciones irreversibles o de alto impacto;
- salida y orientación de recuperación dentro del flujo MFA;
- cálculo de “hoy” según país/zona operativa, incluyendo finalizaciones cercanas a medianoche.

La implementación local está verde en TypeScript, lint, pruebas unitarias y build de producción. No se declara cerrada al 100% porque falta el recorrido E2E autenticado/offline contra Supabase local o un entorno de testing aislado, más validación real de MFA y accesibilidad asistida.

No se realizaron:

- commits, pushes, merges ni pull requests;
- despliegues de Vercel;
- escrituras en Supabase;
- migraciones, cambios de schema o regeneración de tipos;
- lectura de secretos o contenidos de los estados autenticados de Playwright;
- cambios de dependencias o lockfile.

## 3. Estado del working tree

Al momento de este handoff había 38 archivos rastreados modificados y, antes de crear este documento, 3 archivos nuevos sin rastrear. El diff rastreado informaba aproximadamente **873 inserciones y 164 eliminaciones**. Ese conteo no incluye los archivos nuevos.

Archivos nuevos de esta fase:

- `docs/UX_AUDIT.md`
- `lib/data/errors.ts`
- `lib/offline/sync.test.ts`
- `docs/CLOUD_HANDOFF_UX_OFFLINE_2026-09-05.md` — este informe

No hay diff en:

- `supabase/**`
- `types/database.ts`
- `package.json`
- lockfiles

Git muestra una advertencia de normalización LF → CRLF para `public/sw.test.ts`; `git diff --check` no detectó errores de whitespace. Tratarla como advertencia de fin de línea, no como falla funcional.

El `package.json` declara Node `22.14.0` y pnpm `11.9.0`. La máquina donde se validó tenía Node `22.23.2` y pnpm `11.19.0`; por eso las verificaciones también se ejecutaron invocando directamente los binarios locales de Node.

## 4. Cambios implementados

### 4.1 UX-001 — continuidad de estados operativos

Problema original: al pasar de `planificada` a `en_camino` o `en_sitio`, una orden podía desaparecer de Inicio o Ruta aunque el instalador siguiera trabajando sobre ella.

Cambios:

- `lib/data/installer-home.ts`
  - `OPEN` ahora incluye `en_camino` y `en_sitio`.
  - `en_camino`, `en_sitio` y `en_proceso` tienen prioridad al elegir el próximo trabajo.
  - los tres estados cuentan como trabajo en progreso.
- `app/(installer)/route/page.tsx`
  - la consulta de Ruta incluye `en_camino` y `en_sitio`.
  - conserva el filtro por instalador asignado y por fecha operativa.
- `app/(installer)/home/page.tsx`
  - usa una fecha derivada de la zona operativa real del usuario.

Resultado esperado: una orden activa no debe desaparecer al iniciar traslado, llegar al sitio o comenzar ejecución.

### 4.2 UX-002 — lectura/reapertura offline de campo

Problema original: la cola Dexie protegía mutaciones, pero las páginas autenticadas no podían reabrirse de forma útil sin señal.

Cambios:

- `public/sw.js`
  - versión de caché elevada de `v5` a `v6`;
  - nueva caché privada `field-v6`;
  - estrategia `network-first` para:
    - `/home`
    - `/tasks` y `/tasks/**`
    - `/schedule`
    - `/route`
    - `/jobs` y `/jobs/**`
    - `/earnings`
    - `/coordination`
  - si la red falla, intenta primero coincidencia exacta y luego coincidencia por pathname con `ignoreSearch: true`, necesaria para queries efímeras de RSC;
  - no intercepta otros orígenes: Supabase y servicios externos siguen yendo a red;
  - mantiene `stale-while-revalidate` para estáticos;
  - elimina cachés anteriores durante `activate`;
  - responde a `clear-cache` borrando todas las cachés del service worker;
  - acepta `cache-current-route` solo para el mismo origen y una ruta de campo permitida.
- `components/installer/service-worker-register.tsx`
  - espera registro y `navigator.serviceWorker.ready`;
  - calienta la ruta actual con credenciales incluidas;
  - solo registra el SW en build de producción, igual que antes.
- `components/shared/logout-button.tsx`
  - mantiene la limpieza del almacenamiento offline antes de cerrar sesión;
  - admite `className` para asegurar un target adecuado en MFA.
- `components/installer/task-actions.tsx`
  - restaura la transición optimista pendiente al reabrir una tarea;
  - antes de consultar Dexie llama `prepareOfflineStorageForUser(userId)`;
  - esto corrige una carrera real: sin esa espera, el componente podía leer datos locales antes de validar o limpiar al propietario anterior.
- `app/(installer)/tasks/[id]/page.tsx`
  - exige usuario autenticado y pasa su `userId` a `TaskActions`.

Límite intencional: no se cachean todas las páginas autenticadas ni respuestas de Supabase. La cobertura se restringe a rutas operativas de campo y depende de limpieza de identidad.

### 4.3 UX-003 — recuperación visible de la cola offline

Problema original: una operación rechazada quedaba bloqueada en Dexie sin explicación ni salida visible.

Cambios:

- `lib/offline/sync.ts`
  - agrega `QueueSnapshot` y `SyncIssue`;
  - `queueSnapshot()` distingue total pendiente, bloqueados e ítems problemáticos;
  - considera visible un ítem bloqueado o con 3+ intentos;
  - `retryOutboxItem(id)` desbloquea y limpia el último error;
  - `discardOutboxItem(id)` elimina la operación y las fotos locales dependientes dentro de una transacción Dexie;
  - `latestPendingTransition(orderId)` recupera el estado optimista más reciente que no haya sido rechazado.
- `lib/offline/use-sync.ts`
  - expone pendientes, bloqueados, issues, retry y discard;
  - vuelve a leer el snapshot después de cada flush;
  - emite `instalapro:sync-settled` cuando cambia el estado efectivo de la cola.
- `components/installer/sync-indicator.tsx`
  - diferencia sincronizando, pendiente y bloqueado;
  - presenta una bandeja persistente con tipo de cambio, orden, fecha, motivo seguro y cantidad de intentos;
  - permite abrir la orden, reintentar o descartar;
  - el descarte exige confirmación y explica que no puede recuperarse.
- `messages/es.json` y `messages/pt.json`
  - agregan textos completos y equivalentes en español y portugués.

Contrato crítico que Cloud debe preservar: todas las mutaciones del instalador siguen pasando por `lib/offline/sync.ts` y mantienen identificadores generados en cliente. El servidor ya contempla reintentos idempotentes en `lib/actions/tasks.ts` y migraciones existentes; esta fase no cambió ese contrato de base de datos.

### 4.4 UX-010 — error de lectura distinto de estado vacío

Se creó `lib/data/errors.ts`:

- `throwIfDataError(scope, error)` registra `data.fetch_failed` con un scope estable;
- lanza `data_fetch_failed` para activar el error boundary de la ruta;
- evita que `error` y `data: null` terminen convertidos silenciosamente en `[]`.

Se aplicó a lecturas críticas de:

- Inicio, Ruta, Tareas y Coordinación del instalador;
- detalle y listado de órdenes;
- proyectos y estadísticas de sitios;
- clientes, locaciones y detalle de cliente;
- equipo, coordinadores, disponibilidad e invitaciones;
- membresías y roles activos;
- mensajes, conversaciones y recibos de lectura;
- notificaciones e historial paginado;
- evidencia, URLs firmadas y autores;
- agenda, calendario hábil y reprogramaciones;
- cancelaciones;
- encuestas, decisiones, autoridad y prerrequisitos.

Archivos principales:

- `app/(company)/orders/[id]/page.tsx`
- `app/(company)/projects/page.tsx`
- `app/(installer)/coordination/page.tsx`
- `app/(installer)/route/page.tsx`
- `app/(installer)/tasks/[id]/page.tsx`
- `lib/data/business-calendar.ts`
- `lib/data/cancellations.ts`
- `lib/data/clients.ts`
- `lib/data/company-membership-roles.ts`
- `lib/data/installer-home.ts`
- `lib/data/messages.ts`
- `lib/data/notifications.ts`
- `lib/data/order-evidence.ts`
- `lib/data/order-schedule.ts`
- `lib/data/orders.ts`
- `lib/data/reschedules.ts`
- `lib/data/surveys.ts`
- `lib/data/tasks.ts`
- `lib/data/team.ts`

Al validar en Vercel/Supabase, buscar el evento `data.fetch_failed` y su campo `scope`. No registrar ni copiar URLs firmadas, tokens o datos sensibles al documentar una falla.

### 4.5 UX-012 — prevención de acciones de alto impacto

Se añadieron confirmaciones contextuales para:

- asignar, desasignar y cancelar una orden;
- quitar un miembro del equipo;
- cancelar una invitación;
- suspender una empresa;
- descartar una notificación;
- descartar una operación offline.

Archivos:

- `components/company/order-actions.tsx`
- `components/company/pending-invitations.tsx`
- `components/company/roster-table.tsx`
- `components/master/companies-table.tsx`
- `components/notifications/notification-inbox-list.tsx`
- `components/installer/sync-indicator.tsx`
- `messages/es.json`
- `messages/pt.json`

Las confirmaciones son deliberadamente específicas: nombran la entidad y explican la consecuencia. Cloud debe probar aceptar, cancelar, doble click y fallo del servidor.

### 4.6 UX-014 — salida y recuperación durante MFA

Cambios en `app/two-factor/layout.tsx`:

- conserva el requerimiento AAL2 existente;
- muestra orientación para quien perdió acceso al autenticador;
- muestra la cuenta activa cuando hay email;
- ofrece cerrar sesión sin quedar atrapado dentro del flujo;
- el botón alcanza una altura mínima táctil de 44 px.

Cambios asociados:

- `components/shared/logout-button.tsx`
- `messages/es.json`
- `messages/pt.json`

No se cambió la política MFA de Supabase. Falta validar enrolamiento, challenge, verificación, logout y pérdida del autenticador con una cuenta de testing. La documentación oficial de Supabase recomienda redirigir a una pantalla de segundo factor en SSR y contemplar el caso de autenticador perdido: <https://supabase.com/docs/guides/auth/auth-mfa>.

### 4.7 UX-015 — zona horaria AR/BR

Cambios:

- `lib/auth.ts`
  - las membresías incorporan `companies.country`;
  - `operationalTimezone(user)` prioriza una membresía cuyo país coincide con el locale (`pt` → BR, en otro caso AR), luego la primera membresía y finalmente el locale como fallback;
  - usa `countryTimezone()` como fuente común.
- `app/(installer)/home/page.tsx`
  - deriva `today` mediante `dateKeyInTimeZone()`.
- `app/(installer)/route/page.tsx`
  - usa la misma zona para determinar la fecha operativa.
- `lib/data/installer-home.ts`
  - calcula `doneToday` convirtiendo `finalized_at` a la zona operativa; ya no compara `slice(0, 10)` en UTC.
- `lib/auth.test.ts`
  - cubre AR, BR, usuario multiempresa y fallback sin membresías.

Cloud debe probar especialmente los bordes de medianoche y cambio de día con empresas AR y BR.

## 5. Cobertura de pruebas añadida

### `lib/offline/sync.test.ts`

Cuatro pruebas nuevas:

1. diferencia operaciones frescas, reintentos repetidos y bloqueos;
2. permite reintentar un bloqueo y limpia `lastError`;
3. descarta en cascada las fotos locales dependientes;
4. recupera la última transición optimista no bloqueada.

### `public/sw.test.ts`

La cobertura existente se amplió a cinco casos totales:

1. cachea una pantalla de campo después de una respuesta exitosa;
2. no cachea `/dashboard` ni páginas autenticadas fuera del allowlist de campo;
3. devuelve la coincidencia exacta cacheada cuando falla la red;
4. ignora el query efímero de RSC al buscar fallback por pathname;
5. elimina todas las cachés con `clear-cache`.

Estas son pruebas unitarias del comportamiento del service worker. No sustituyen una prueba real con navegador, ciclo de vida del SW, Cache Storage, IndexedDB y sesión Supabase.

## 6. Validación ya ejecutada

Se ejecutaron, con resultado exitoso:

```text
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
node node_modules/vitest/vitest.mjs run
node node_modules/next/dist/bin/next build
git diff --check
```

Resultados observados:

- TypeScript: sin errores.
- ESLint completo: sin errores.
- Vitest: **62 archivos aprobados / 453 tests aprobados**.
- Next.js `16.2.12`: compilación y generación de las 38 páginas estáticas completadas; build exitoso.
- `git diff --check`: aprobado.

Cloud debe repetirlos después de cualquier corrección y antes de crear un preview. Puede usar los scripts equivalentes:

```text
pnpm type-check
pnpm lint
pnpm test
pnpm build
```

Si cambia una migración, además debe seguir el contrato del repositorio:

```text
supabase gen types typescript --linked > types/database.ts
node scripts/narrow-database-types.mjs
```

No ejecutar esa regeneración si no hubo cambio de schema. Nunca sobrescribir `types/database.ts` con tipos de un proyecto Supabase equivocado.

## 7. Por qué no se ejecutó el E2E autenticado/offline

En la máquina local usada para esta fase:

- no estaba instalado/disponible Docker CLI ni Docker Desktop;
- no estaba disponible Supabase CLI en el proyecto o globalmente;
- no había procesos Docker activos;
- no estaban escuchando los puertos locales habituales `54321`, `54322`, `54323` ni `3000`;
- no se inició ningún daemon porque el repositorio exige autorización explícita;
- no se apuntó a Supabase remoto para evitar escrituras accidentales.

Supabase documenta que el stack local requiere la CLI y un runtime compatible con Docker: <https://supabase.com/docs/guides/local-development/cli/getting-started>.

El archivo `playwright.config.ts` confirma además que:

- los tests autenticados dependen de `supabase/seed.sql`;
- los actores son cuentas sintéticas del seed;
- usan un solo worker porque comparten tenant y escriben datos;
- el área instalador corre también en un proyecto mobile Pixel 7;
- sin `E2E_BASE_URL`, espera un servidor de producción local mediante `pnpm start`;
- el comentario del propio archivo prohíbe apuntar el smoke a producción.

El E2E móvil existente (`e2e/installer.mobile.spec.ts`) solo comprueba apertura, ausencia de overflow horizontal y registro del service worker. No cubre todavía el ciclo offline descrito en la sección siguiente.

## 8. Plan exacto para Cloud

### Fase A — preservar y revalidar el código

1. Confirmar directorio, rama y working tree.
2. Leer `AGENTS.md`, este handoff y `docs/UX_AUDIT.md`.
3. No cambiar de rama ni limpiar el working tree sin acuerdo del usuario.
4. Ejecutar TypeScript, lint, Vitest y build.
5. Si algo falla en el entorno de Cloud, distinguir:
   - regresión real del código;
   - diferencia de Node/pnpm;
   - variables faltantes;
   - schema remoto distinto;
   - políticas RLS o grants;
   - caché vieja de Vercel/SW.

### Fase B — elegir un entorno seguro

Orden de preferencia:

1. **Supabase local + Next production local.** Es el entorno para el cual fueron escritos el seed y Playwright.
2. **Proyecto Supabase de testing/staging aislado + Vercel Preview.** Solo si Cloud confirma que no contiene datos reales y que puede ser reseteado o ensuciado por E2E.
3. No usar producción.

Antes de escribir, Cloud debe declarar en su respuesta qué proyecto Supabase y qué entorno Vercel va a usar, sin revelar IDs sensibles, claves o valores de variables.

### Fase C — Supabase local, si está disponible

No adivinar comandos: primero consultar la versión y `--help`, porque la CLI cambia con frecuencia.

Secuencia conceptual:

1. verificar CLI y runtime Docker-compatible;
2. iniciar el stack desde la raíz que ya contiene `supabase/config.toml`;
3. aplicar todas las migraciones y `supabase/seed.sql` en local;
4. confirmar que Auth, Postgres y Storage están saludables;
5. construir Next en modo producción y arrancar el servidor local;
6. ejecutar `pnpm test:e2e` con un solo worker;
7. detener los servicios al terminar.

Si usa un reset, debe ser inequívocamente local. **Nunca ejecutar `db reset --linked` ni un reset contra remoto.**

### Fase D — validaciones read-only en Supabase conectado

Si Cloud tiene MCP o conector de Supabase, realizar primero:

1. identificar si el proyecto conectado es testing, staging o producción;
2. comparar historial de migraciones con `supabase/migrations/`;
3. ejecutar advisors de seguridad y performance de forma read-only;
4. revisar RLS y grants de Data API para las tablas consultadas por los archivos modificados;
5. confirmar que las vistas expuestas, si existen, usan el modelo de seguridad previsto;
6. confirmar que `companies.country` está disponible para las membresías;
7. confirmar que los estados `en_camino` y `en_sitio` son aceptados por el dominio y las RPC/transiciones existentes;
8. confirmar las RPC usadas por detalle de tarea, como conteos/mínimos de evidencia;
9. verificar que Storage permita crear URLs firmadas solo a usuarios autorizados;
10. revisar que los reintentos offline conserven idempotencia y no dupliquen updates, fotos, transiciones ni mensajes.

No “arreglar” un error de permiso agregando `service_role` al cliente, desactivando RLS o convirtiendo funciones en `SECURITY DEFINER`. Si hace falta una migración, crearla con la CLI, revisar `USING` + `WITH CHECK`, probar aislamiento entre tenants, regenerar tipos y ejecutar `scripts/narrow-database-types.mjs`.

Esta fase no usa `logs.all`; se buscó en el repositorio y no hay coincidencias. El changelog actual anuncia que el endpoint de Management API `logs.all` será retirado el 2026-09-23, pero no requiere cambio en este diff: <https://supabase.com/changelog?types=breaking-change>.

### Fase E — E2E autenticado y offline obligatorio

Agregar o ejecutar pruebas que cubran, como mínimo:

#### E2E-01 — continuidad completa de estados

1. entrar como instalador sintético;
2. abrir una orden `planificada`;
3. ejecutar `planificada → en_camino → en_sitio → en_proceso → en_revision`;
4. después de cada transición verificar:
   - estado y CTA en detalle;
   - presencia en Inicio;
   - presencia en Ruta cuando corresponda;
   - persistencia tras reload;
   - ausencia de duplicados.

#### E2E-02 — reapertura sin red

1. correr build de producción; el service worker no se registra en desarrollo;
2. visitar `/home`, `/tasks`, una `/tasks/:id`, `/route` y las rutas de campo necesarias;
3. esperar que el SW esté activo y que la ruta haya sido cacheada;
4. poner el contexto del navegador offline;
5. cerrar y volver a abrir una página dentro del mismo contexto de navegador;
6. verificar que una ruta visitada reabre desde caché;
7. verificar el fallback con query RSC distinta;
8. verificar que una ruta nunca visitada muestra un fallo controlado y no datos de otra ruta;
9. volver online y comprobar actualización desde red.

#### E2E-03 — mutación offline y reintento idempotente

1. dejar el navegador sin red;
2. encolar una transición o actualización con identificador cliente;
3. verificar estado optimista y contador pendiente;
4. recargar/reabrir la tarea y verificar que se restaura la última transición pendiente;
5. volver online;
6. comprobar que el servidor recibe exactamente una operación efectiva;
7. comprobar que la cola queda vacía y se emite reconciliación;
8. simular respuesta perdida/retry y confirmar que no duplica filas ni eventos.

#### E2E-04 — conflicto definitivo recuperable

1. crear un cambio local pendiente;
2. modificar el estado del registro en el entorno de testing para volver inválida la transición;
3. reconectar;
4. verificar que el ítem queda bloqueado y deja de reintentarse automáticamente;
5. comprobar que la UI muestra explicación segura y acciones;
6. probar “Reintentar” después de resolver la condición del servidor;
7. crear otro conflicto y probar “Descartar”;
8. si tiene fotos dependientes, confirmar que solo se borran las fotos locales de ese ítem;
9. comprobar uso con teclado y lector de pantalla.

#### E2E-05 — aislamiento entre cuentas

1. entrar con instalador A, visitar páginas y crear un pendiente offline;
2. cerrar sesión;
3. verificar borrado de Cache Storage e IndexedDB/snapshot de A;
4. entrar con instalador B en el mismo navegador;
5. confirmar que B no puede ver HTML, estados optimistas, fotos ni operaciones de A;
6. repetir con cambio de identidad durante una inicialización lenta para cubrir la carrera corregida.

#### E2E-06 — MFA

1. cuenta que requiere MFA entra con AAL1;
2. es redirigida a setup/verify, no a un 401/403 genérico;
3. enrola TOTP y verifica correctamente;
4. prueba código incorrecto, expirado y reintento;
5. confirma que el usuario puede cerrar sesión desde el layout MFA;
6. confirma texto de recuperación en ES y PT;
7. valida cuenta activa y target táctil;
8. no registrar QR, secreto TOTP ni códigos.

#### E2E-07 — zona horaria

Crear datos sintéticos cerca de medianoche UTC y verificar:

- empresa AR con `America/Argentina/Buenos_Aires`;
- empresa BR con `America/Sao_Paulo`;
- usuario multiempresa con locale ES;
- usuario multiempresa con locale PT;
- `doneToday`, Ruta y agenda coinciden con el día operativo esperado.

### Fase F — Vercel Preview

Solo después de las pruebas locales o contra testing:

1. crear un **Preview Deployment**, no producción;
2. comprobar que las variables de entorno Preview apuntan al proyecto Supabase de testing, no al productivo;
3. no copiar valores de variables al informe ni a comentarios;
4. configurar en Supabase de testing los redirect URLs/callbacks necesarios para la URL de Preview;
5. verificar `APP_URL` y cualquier integración que genere enlaces sin enviar correos reales;
6. comprobar que `/sw.js` se sirve correctamente y controla el scope esperado;
7. repetir E2E usando `E2E_BASE_URL=<preview-url>`;
8. revisar build logs y runtime logs filtrados por environment `preview`, branch y deployment;
9. buscar 4xx/5xx y `data.fetch_failed` por scope;
10. no promover a producción hasta que todos los gates de la sección 10 estén aprobados.

Vercel distingue Local, Preview y Production, y Preview está pensado para QA sin afectar el sitio público: <https://vercel.com/docs/deployments/environments>. Las variables pueden configurarse por entorno/branch: <https://vercel.com/docs/environment-variables>. Los runtime logs pueden filtrarse por Preview, branch, deployment, ruta y status: <https://vercel.com/docs/logs/runtime>.

### Fase G — corregir lo que aparezca

Si los E2E o logs encuentran fallas:

1. reproducir con datos sintéticos;
2. identificar si el origen es UI, service worker, Dexie, Server Action, RLS, RPC, Storage o configuración Preview;
3. implementar el cambio mínimo;
4. agregar una prueba que falle antes del fix;
5. repetir TypeScript, lint, Vitest, build y E2E relevante;
6. actualizar este handoff y `docs/UX_AUDIT.md` con evidencia concreta;
7. no ocultar un error transformándolo nuevamente en lista vacía.

## 9. P1 que siguen fuera de esta fase

La auditoría completa tiene más alcance que esta implementación. Después de la fase actual quedan 9 findings P1, agrupados así:

- `UX-004`: listados críticos semánticos y operables por teclado;
- `UX-005`: gestión de foco en drawer móvil;
- `UX-006`: permitir zoom del viewport;
- `UX-007`: contraste AA;
- `UX-008`: navegación consistente por audiencia;
- `UX-009`: filtros, vista y retorno preservados en URL;
- `UX-011`: historial completo alcanzable;
- `UX-013`: errores de formulario localizados y protección de cambios sin guardar;
- `UX-016`: agenda responsive sin tabla forzada a 980 px.

No mezclar silenciosamente esos nueve P1 con el cierre E2E. Cloud debe:

1. cerrar y documentar primero la fase actual;
2. informar resultados y bloqueos;
3. pedir confirmación de alcance antes de iniciar una segunda fase grande;
4. si recibe autorización, seguir el orden de implementación definido en `docs/UX_AUDIT.md`.

## 10. Definition of Done para declarar cerrada esta fase

No declarar “completo” hasta cumplir todos estos puntos:

- [ ] working tree revisado y preservado;
- [ ] TypeScript aprobado;
- [ ] ESLint completo aprobado;
- [ ] Vitest completo aprobado;
- [ ] build Next de producción aprobado;
- [ ] E2E autenticado existente aprobado por rol;
- [ ] ciclo de estados del instalador aprobado;
- [ ] reapertura offline real aprobada;
- [ ] mutación offline + reconnect aprobada sin duplicados;
- [ ] conflicto bloqueado, retry y discard aprobados;
- [ ] limpieza entre cuentas aprobada;
- [ ] MFA setup/verify/logout/recovery aprobado;
- [ ] AR/BR y bordes de medianoche aprobados;
- [ ] navegación por teclado y lector de pantalla de la bandeja de conflictos aprobada;
- [ ] advisors Supabase revisados sin hallazgos críticos nuevos;
- [ ] logs Preview sin 5xx ni `data.fetch_failed` inesperados;
- [ ] Preview Deployment validado contra Supabase de testing;
- [ ] `docs/UX_AUDIT.md` actualizado con evidencia final;
- [ ] autorización explícita obtenida antes de cualquier promoción a producción.

## 11. Evidencia esperada en la respuesta de Cloud

Cloud debería devolver al usuario un informe con:

1. entorno usado, sin secretos;
2. commit/rama o snapshot exacto validado;
3. comandos ejecutados y resultados resumidos;
4. cantidad de tests aprobados/fallidos;
5. URL de Preview si fue autorizada y creada;
6. matriz de E2E-01 a E2E-07 con `PASS`, `FAIL` o `BLOCKED`;
7. scopes `data.fetch_failed` observados, sin payload sensible;
8. resultado de advisors y revisión RLS;
9. bugs encontrados y archivos modificados;
10. riesgos residuales;
11. confirmación explícita de que no usó producción para E2E;
12. si dejó cambios sin commit, lista exacta para que no se pierdan.

## 12. Archivos modificados por grupo

### Páginas

- `app/(company)/orders/[id]/page.tsx`
- `app/(company)/projects/page.tsx`
- `app/(installer)/coordination/page.tsx`
- `app/(installer)/home/page.tsx`
- `app/(installer)/route/page.tsx`
- `app/(installer)/tasks/[id]/page.tsx`
- `app/two-factor/layout.tsx`

### Componentes

- `components/company/order-actions.tsx`
- `components/company/pending-invitations.tsx`
- `components/company/roster-table.tsx`
- `components/installer/service-worker-register.tsx`
- `components/installer/sync-indicator.tsx`
- `components/installer/task-actions.tsx`
- `components/master/companies-table.tsx`
- `components/notifications/notification-inbox-list.tsx`
- `components/shared/logout-button.tsx`

### Autorización, dominio y datos

- `lib/auth.ts`
- `lib/auth.test.ts`
- `lib/data/errors.ts`
- `lib/data/business-calendar.ts`
- `lib/data/cancellations.ts`
- `lib/data/clients.ts`
- `lib/data/company-membership-roles.ts`
- `lib/data/installer-home.ts`
- `lib/data/messages.ts`
- `lib/data/notifications.ts`
- `lib/data/order-evidence.ts`
- `lib/data/order-schedule.ts`
- `lib/data/orders.ts`
- `lib/data/reschedules.ts`
- `lib/data/surveys.ts`
- `lib/data/tasks.ts`
- `lib/data/team.ts`

### Offline/PWA

- `lib/offline/sync.ts`
- `lib/offline/use-sync.ts`
- `lib/offline/sync.test.ts`
- `public/sw.js`
- `public/sw.test.ts`

### Contenido y documentación

- `messages/es.json`
- `messages/pt.json`
- `docs/UX_AUDIT.md`
- `docs/CLOUD_HANDOFF_UX_OFFLINE_2026-09-05.md`

## 13. Criterio de reacción recomendado

- Si todo pasa en local/testing y Preview: marcar la fase como validada, actualizar la auditoría y pedir autorización antes de producción.
- Si falla por schema/RLS: no debilitar seguridad; corregir mediante migración versionada, tests de aislamiento y regeneración de tipos.
- Si falla solo offline: inspeccionar ciclo de vida del SW, caché `field-v6`, limpieza de identidad, Dexie y eventos de reconciliación.
- Si aparecen duplicados: detener despliegue y revisar idempotencia cliente/servidor antes de seguir.
- Si aparecen datos cruzados entre cuentas o tenants: tratar como incidente de seguridad P0, detener toda promoción, conservar evidencia sin datos personales y corregir antes de cualquier otra tarea.
- Si MFA atrapa al usuario: revisar redirección AAL, lista de factores, logout y recuperación sin relajar la exigencia de segundo factor.
- Si el entorno disponible es producción: no ejecutar E2E de escritura; limitarse a revisión read-only y pedir un entorno de testing.

Este informe describe el estado local observado. Cloud debe verificar el estado externo actual antes de actuar y registrar cualquier diferencia entre el repositorio, Supabase y Vercel.
